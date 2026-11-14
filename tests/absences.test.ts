import { describe, it, expect, vi, afterEach } from 'vitest';
import { App, TFile } from 'obsidian';
import { DataManager, TimeEntry } from '../src/dataManager';
import { TimerManager } from '../src/timerManager';
import { DEFAULT_SETTINGS, TimeFlowSettings } from '../src/settings';

// Reporter's configuration: 37h week Mon-Fri, 7h 24m day, 30 min unpaid lunch
function makeSettings(): TimeFlowSettings {
	const settings: TimeFlowSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
	settings.baseWorkday = 7.4;
	settings.baseWorkweek = 37;
	settings.workPercent = 1;
	settings.lunchBreakMinutes = 30;
	settings.workScheduleHistory = [];
	settings.balanceStartDate = '2026-01-01';
	settings.startingFlextimeBalance = 0;
	settings.annetTemplates = [
		...settings.annetTemplates,
		{ id: 'car_service', label: 'Car Service', icon: '🚗', unpaid: true },
		{ id: 'appointment', label: 'Appointment', icon: '📋' },
	];
	return settings;
}

// Entries with real clock times (timers, time-range absences) carry exactTimes
function entry(name: string, date: string, from: string, to: string): TimeEntry {
	return { name, startTime: `${date}T${from}:00`, endTime: `${date}T${to}:00`, exactTimes: true };
}

// Duration-only or pre-exactTimes entries: their clock times are not trusted
function legacyEntry(name: string, date: string, from: string, to: string): TimeEntry {
	return { name, startTime: `${date}T${from}:00`, endTime: `${date}T${to}:00` };
}

async function buildDay(entries: TimeEntry[], holidayLines: string[] = [], settings = makeSettings()): Promise<DataManager> {
	const file = new TFile();
	const app = {
		vault: {
			getAbstractFileByPath: () => file,
			read: async () => holidayLines.join('\n'),
		},
	} as unknown as App;
	const dm = new DataManager(entries, settings, app);
	await dm.loadHolidays();
	dm.processEntries();
	return dm;
}

const MON = '2026-11-09';

/** Worked hours on a day: entries that are not credited/withdrawn absences */
function worked(dm: DataManager, day: string): number {
	return (dm.daily[day] || [])
		.filter(e => {
			const effect = dm.getSpecialDayBehavior(e.name)?.flextimeEffect;
			return effect !== 'reduce_goal' && effect !== 'withdraw';
		})
		.reduce((s, e) => s + (e.duration || 0), 0);
}

function dayFlex(dm: DataManager, day: string): number {
	return (dm.daily[day] || []).reduce((s, e) => s + (e.flextime || 0), 0);
}

const hm = (h: number, m: number) => h + m / 60;

describe('partial-day absences and work time', () => {
	it('1. standard workday without absences', async () => {
		const dm = await buildDay([entry('jobb', MON, '08:00', '15:54')]);
		expect(worked(dm, MON)).toBeCloseTo(hm(7, 24), 6);
		expect(dayFlex(dm, MON)).toBeCloseTo(0, 6);
		expect(dm.getBalanceUpToDate(MON)).toBeCloseTo(0, 6);
	});

	it('2a. 9 Nov 2026 regression: unpaid 45 min absence inside work is excluded, goal unchanged', async () => {
		// Unpaid annet is not converted to an entry; it only lives in holidays.md
		const dm = await buildDay(
			[entry('jobb', MON, '06:07', '16:30')],
			[`- ${MON}: annet:car_service:07:00-07:45: Car Service`]
		);
		expect(worked(dm, MON)).toBeCloseTo(hm(9, 8), 6);       // 10h23 - 45m - 30m
		expect(dm.getDailyGoal(MON)).toBeCloseTo(hm(7, 24), 6);
		expect(dayFlex(dm, MON)).toBeCloseTo(hm(1, 44), 6);
		expect(dm.getBalanceUpToDate(MON)).toBeCloseTo(hm(1, 44), 6);
	});

	it('2b. 9 Nov 2026: credited (default) annet no longer double-counts the overlap', async () => {
		// Past partial annet is converted to an 'annet' entry; it reduces the goal by 45m
		const dm = await buildDay(
			[entry('jobb', MON, '06:07', '16:30'), entry('annet', MON, '07:00', '07:45')],
			[`- ${MON}: annet:appointment:07:00-07:45: Car Service`]
		);
		expect(worked(dm, MON)).toBeCloseTo(hm(9, 8), 6);
		// 9h08 worked vs 7h24 - 45m credited = 6h39 goal -> +2h29 (was +3h14)
		expect(dayFlex(dm, MON)).toBeCloseTo(hm(2, 29), 6);
		expect(dm.getBalanceUpToDate(MON)).toBeCloseTo(hm(2, 29), 6);
	});

	it('3. absence overlapping the start or end of work only deducts the overlap', async () => {
		const start = await buildDay(
			[entry('jobb', MON, '06:07', '16:30')],
			[`- ${MON}: annet:car_service:05:37-06:37: early`]
		);
		expect(worked(start, MON)).toBeCloseTo(hm(10, 23) - 0.5 - 0.5, 6);

		const end = await buildDay(
			[entry('jobb', MON, '06:07', '16:30')],
			[`- ${MON}: annet:car_service:16:00-17:00: late`]
		);
		expect(worked(end, MON)).toBeCloseTo(hm(10, 23) - 0.5 - 0.5, 6);
	});

	it('4. absence outside work hours never creates negative work time', async () => {
		const unpaid = await buildDay(
			[entry('jobb', MON, '08:00', '15:54')],
			[`- ${MON}: annet:car_service:17:00-18:00: after work`]
		);
		expect(worked(unpaid, MON)).toBeCloseTo(hm(7, 24), 6);
		expect(dayFlex(unpaid, MON)).toBeCloseTo(0, 6);

		// Credited sick time outside work still reduces the goal, work untouched
		const sick = await buildDay([entry('jobb', MON, '08:00', '14:54'), entry('egenmelding', MON, '15:00', '16:00')]);
		expect(worked(sick, MON)).toBeCloseTo(hm(6, 24), 6);
		expect(dayFlex(sick, MON)).toBeCloseTo(0, 6);

		// Absence fully covering a work entry clamps at zero
		const covered = await buildDay([entry('jobb', MON, '07:00', '07:45'), entry('egenmelding', MON, '07:00', '07:45')]);
		expect(worked(covered, MON)).toBe(0);
	});

	it('5. multiple overlapping absences are deducted once', async () => {
		// Sick 07:00-08:00 and unpaid 07:30-08:30: union is 1h30, not 2h
		const dm = await buildDay(
			[entry('jobb', MON, '06:07', '16:30'), entry('egenmelding', MON, '07:00', '08:00')],
			[`- ${MON}: annet:car_service:07:30-08:30: overlap`]
		);
		expect(worked(dm, MON)).toBeCloseTo(hm(10, 23) - 1.5 - 0.5, 6);
		// Sick hour still credited: goal 7h24 - 1h = 6h24
		expect(dayFlex(dm, MON)).toBeCloseTo(hm(10, 23) - 1.5 - 0.5 - hm(6, 24), 6);
	});

	it('6. full-day absence: no goal, no deduction', async () => {
		const unpaidFull = await buildDay([], [`- ${MON}: annet:car_service: whole day`]);
		expect(unpaidFull.getDailyGoal(MON)).toBe(0);

		const ferie = await buildDay([entry('ferie', MON, '08:00', '08:00')], [`- ${MON}: ferie: vacation`]);
		expect(ferie.getDailyGoal(MON)).toBe(0);
		expect(ferie.getBalanceUpToDate(MON)).toBeCloseTo(0, 6);
	});

	it('7. lunch is deducted once, from the trimmed longest work entry', async () => {
		// Split day: absence overlaps the morning block; lunch comes off the longer afternoon block
		const dm = await buildDay(
			[entry('jobb', MON, '07:00', '09:00'), entry('jobb', MON, '09:30', '15:00')],
			[`- ${MON}: annet:car_service:08:00-08:45: errand`]
		);
		const [morning, afternoon] = dm.daily[MON];
		expect(morning.duration).toBeCloseTo(hm(1, 15), 6);
		expect(afternoon.duration).toBeCloseTo(5, 6);
		expect(worked(dm, MON)).toBeCloseTo(hm(6, 15), 6);
	});

	it('8. paid, sick and flextime categories keep their accounting', async () => {
		// Partial sick leave inside work: credited (goal -2h) and no longer also counted as worked
		const sick = await buildDay([entry('jobb', MON, '08:00', '16:00'), entry('egenmelding', MON, '10:00', '12:00')]);
		expect(worked(sick, MON)).toBeCloseTo(5.5, 6);
		expect(dayFlex(sick, MON)).toBeCloseTo(5.5 - 5.4, 6);

		// Avspasering inside work: withdrawn hours cover the goal and are not also worked
		const avsp = await buildDay([entry('jobb', MON, '08:00', '16:00'), entry('avspasering', MON, '14:00', '16:00')]);
		expect(worked(avsp, MON)).toBeCloseTo(5.5, 6);
		expect(balanceOnMon(avsp)).toBeCloseTo(5.5 + 2 - 7.4 - 2, 6);

		// Avspasering on its own withdraws its duration
		const avspOnly = await buildDay([entry('avspasering', MON, '08:00', '15:24')]);
		expect(balanceOnMon(avspOnly)).toBeCloseTo(-7.4, 6);

		// Velferdspermisjon partial outside work: credited
		const velferd = await buildDay([entry('jobb', MON, '08:00', '14:54'), entry('velferdspermisjon', MON, '15:00', '16:00')]);
		expect(balanceOnMon(velferd)).toBeCloseTo(0, 6);
	});

	it('9. daily balances and weekly totals after absences', async () => {
		const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
		const entries = days.map(d => entry('jobb', d, '08:00', '15:54'));
		entries[0] = entry('jobb', days[0], '06:07', '16:30');
		entries.push(entry('egenmelding', days[2], '08:00', '09:00'));
		const dm = await buildDay(entries, [`- ${days[0]}: annet:car_service:07:00-07:45: Car Service`]);

		// Mon +1h44 (unpaid), Wed sick hour inside work: -1h worked, goal -1h -> 0
		expect(dayFlex(dm, days[0])).toBeCloseTo(hm(1, 44), 6);
		expect(dayFlex(dm, days[2])).toBeCloseTo(0, 6);
		expect(dm.getBalanceUpToDate(days[4])).toBeCloseTo(hm(1, 44), 6);

		const week = dm.getWeekCompliance(new Date(2026, 10, 9));
		expect(week.totalHours).toBeCloseTo(hm(9, 8) + 3 * hm(7, 24) + hm(6, 24), 6);
		expect(week.expectedHours).toBeCloseTo(5 * 7.4 - 1, 6);
	});
});

describe('convertPastPlannedDays', () => {
	it('converts paid and unpaid partial annet with exact times, but not untimed avspasering', async () => {
		const settings = makeSettings();
		const tm = new TimerManager({} as App, settings);
		tm.save = async () => {};
		await tm.convertPastPlannedDays({
			'2026-11-09': { type: 'annet', description: '', halfDay: false, startTime: '07:00', endTime: '07:45', annetTemplateId: 'car_service' },
			'2026-11-10': { type: 'annet', description: '', halfDay: false, startTime: '07:00', endTime: '07:45', annetTemplateId: 'appointment' },
			'2026-11-11': { type: 'avspasering', description: '', halfDay: false },
		}, settings);
		expect(tm.data.entries.map(e => [e.startTime, e.exactTimes])).toEqual([
			['2026-11-09T07:00:00', true],
			['2026-11-10T07:00:00', true],
			// Full-workday fallback has made-up times, so it must not trim work
			['2026-11-11T08:00:00', undefined],
		]);
	});
});

describe('review fixes', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('duration-only and older absences without exact times never trim work', async () => {
		// 3h egenmelding entered as a duration is stored at a noon anchor (12:00-15:00)
		const dm = await buildDay([entry('jobb', MON, '08:00', '13:00'), legacyEntry('egenmelding', MON, '12:00', '15:00')]);
		expect(worked(dm, MON)).toBeCloseTo(4.5, 6); // 5h - lunch, no trim
		expect(dayFlex(dm, MON)).toBeCloseTo(4.5 - 4.4, 6); // goal 7.4 - 3h credited
	});

	it('marking a template unpaid after conversion still counts the day as unpaid', async () => {
		const holiday = [`- ${MON}: annet:car_service:07:00-07:45: Car Service`];
		const entries = () => [entry('jobb', MON, '06:07', '16:30'), entry('annet', MON, '07:00', '07:45')];

		const unpaid = await buildDay(entries(), holiday);
		expect(unpaid.daily[MON].map(e => e.name)).toEqual(['jobb']);
		expect(worked(unpaid, MON)).toBeCloseTo(hm(9, 8), 6);
		expect(dayFlex(unpaid, MON)).toBeCloseTo(hm(1, 44), 6);

		// Toggling unpaid off again only changes the calculation; no data is rewritten
		const settings = makeSettings();
		settings.annetTemplates.find(tmpl => tmpl.id === 'car_service')!.unpaid = false;
		const paid = await buildDay(entries(), holiday, settings);
		expect(dayFlex(paid, MON)).toBeCloseTo(hm(2, 29), 6);
	});

	it('a past unpaid partial day without work is flagged as a missing entry, not charged', async () => {
		// Missing-entry checks start at the first registered day, so register the Friday before
		const dm = await buildDay(
			[entry('jobb', '2026-11-06', '08:00', '15:54'), entry('annet', MON, '07:00', '07:45')],
			[`- ${MON}: annet:car_service:07:00-07:45: Car Service`]
		);
		expect(dm.daily[MON]).toBeUndefined();
		expect(dm.getBalanceUpToDate(MON)).toBeCloseTo(0, 6);
		expect(dm.getAnnetBehavior(dm.getHolidayInfo(MON)!).flextimeEffect).toBe('none');
		const missing = dm.validateData().issues.warnings.filter(w => w.type === 'Missing Entry').map(w => w.date);
		expect(missing).toContain(MON);
	});

	it('an absence after midnight trims an overnight shift that started the day before', async () => {
		const dm = await buildDay([
			{ name: 'jobb', startTime: `${MON}T22:00:00`, endTime: '2026-11-10T06:00:00' },
			entry('avspasering', '2026-11-10', '04:00', '06:00'),
		]);
		expect(worked(dm, MON)).toBeCloseTo(8 - 2 - 0.5, 6);
	});

	it('a running work timer excludes time it overlaps with a logged absence', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 10, 9, 12, 0, 0));
		const running: TimeEntry = { name: 'jobb', startTime: `${MON}T08:00:00` };
		const dm = await buildDay([running, entry('egenmelding', MON, '10:00', '11:00')]);

		// 4h elapsed - 1h sick - 30m lunch (no completed jobb entry yet)
		expect(dm.liveActiveDuration(running)).toBeCloseTo(2.5, 6);
		expect(worked(dm, MON)).toBeCloseTo(2.5, 6);
	});
});

function balanceOnMon(dm: DataManager): number {
	return dm.getBalanceUpToDate(MON);
}
