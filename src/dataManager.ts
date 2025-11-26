import { App, TFile } from 'obsidian';
import { TimeFlowSettings } from './settings';
import { Utils } from './utils';

export interface TimeEntry {
	name: string;
	startTime: string;
	endTime?: string;
	duration?: number;
	flextime?: number;
	date?: Date;
	subEntries?: TimeEntry[];
}

export interface HolidayInfo {
	type: string;
	description: string;
	halfDay: boolean;
}

export interface ValidationResults {
	hasErrors: boolean;
	hasWarnings: boolean;
	hasInfo: boolean;
	issues: {
		errors: any[];
		warnings: any[];
		info: any[];
		stats: {
			totalEntries: number;
			entriesChecked: number;
			entriesWithIssues: number;
		};
	};
	generatedAt: string;
}

export class DataManager {
	rawEntries: TimeEntry[];
	daily: Record<string, TimeEntry[]> = {};
	months: Record<string, Record<number, TimeEntry[]>> = {};
	activeEntries: TimeEntry[] = [];
	activeEntriesByDate: Record<string, TimeEntry[]> = {};
	holidays: Record<string, HolidayInfo> = {};
	workdayHours: number;
	workweekHours: number;
	settings: TimeFlowSettings;
	app: App;

	// Cache for expensive calculations
	private _cachedAverages: any = null;
	private _cachedContextData: Record<string, any> = {};

	constructor(entries: TimeEntry[], settings: TimeFlowSettings, app: App) {
		this.rawEntries = entries;
		this.settings = settings;
		this.app = app;
		this.workdayHours = settings.baseWorkday * settings.workPercent;
		this.workweekHours = settings.baseWorkweek * settings.workPercent;
	}

	async loadHolidays(): Promise<any> {
		const status = { success: false, message: '', count: 0, warning: null as string | null };

		try {
			const holidayFile = this.app.vault.getAbstractFileByPath(this.settings.holidaysFilePath);
			if (holidayFile && holidayFile instanceof TFile) {
				const content = await this.app.vault.read(holidayFile);
				const lines = content.split('\n');

				lines.forEach(line => {
					const match = line.match(/^-\s*(\d{4}-\d{2}-\d{2}):\s*(\w+)(?::half)?:\s*(.+)$/);
					if (match) {
						const [, date, type, description] = match;
						const isHalfDay = line.includes(':half:');
						this.holidays[date] = {
							type: type.trim().toLowerCase(),
							description: description.trim(),
							halfDay: isHalfDay
						};
					}
				});

				status.success = true;
				status.count = Object.keys(this.holidays).length;
				status.message = `Loaded ${status.count} planned days`;
				console.log(`Loaded ${status.count} future days`);
			} else {
				status.warning = `Holiday file not found: ${this.settings.holidaysFilePath}`;
				console.warn(status.warning);
			}
		} catch (error: any) {
			status.warning = `Error loading holidays: ${error.message}`;
			console.warn("Could not load future days file:", error);
		}

		return status;
	}

	isHoliday(dateStr: string): boolean {
		return this.holidays.hasOwnProperty(dateStr);
	}

	getHolidayInfo(dateStr: string): HolidayInfo | null {
		return this.holidays[dateStr] || null;
	}

	getDailyGoal(dateStr: string): number {
		const date = new Date(dateStr);
		const isWeekend = Utils.isWeekend(date, this.settings);

		if (isWeekend) return 0;

		const holidayInfo = this.getHolidayInfo(dateStr);
		if (holidayInfo) {
			if (["ferie", "velferdspermisjon", "helligdag", "egenmelding"].includes(holidayInfo.type)) {
				return 0;
			}
			if (holidayInfo.halfDay) {
				return 4;
			}
		}

		return this.workdayHours;
	}

	processEntries(): void {
		this.rawEntries.forEach((e) => {
			if (!e.startTime) return;
			if (!e.endTime) {
				this.activeEntries.push(e);
				const start = Utils.parseDate(e.startTime);
				if (start) {
					const dayKey = Utils.toLocalDateStr(start);
					if (!this.activeEntriesByDate[dayKey]) this.activeEntriesByDate[dayKey] = [];
					this.activeEntriesByDate[dayKey].push(e);
				}
				return;
			}
			const start = Utils.parseDate(e.startTime);
			const end = Utils.parseDate(e.endTime);
			if (!start || !end) return;

			let duration = Utils.hoursDiff(start, end);

			// Deduct lunch break for work entries (jobb)
			if (e.name.toLowerCase() === 'jobb' && this.settings.lunchBreakMinutes > 0) {
				const lunchBreakHours = this.settings.lunchBreakMinutes / 60;
				duration = Math.max(0, duration - lunchBreakHours);
			}

			const dayKey = Utils.toLocalDateStr(start);
			if (!this.daily[dayKey]) this.daily[dayKey] = [];
			this.daily[dayKey].push({ ...e, duration, date: start });
		});
		this.calculateFlextime();
		this.groupByMonths();
	}

	calculateFlextime(): void {
		for (let day in this.daily) {
			const dayGoal = this.getDailyGoal(day);

			this.daily[day].forEach((e) => {
				let flextime = 0;
				const name = e.name.toLowerCase();

				if (name === "avspasering") {
					flextime -= e.duration || 0;
				} else if (dayGoal === 0) {
					flextime += e.duration || 0;
				} else {
					if ((e.duration || 0) > dayGoal) {
						flextime += (e.duration || 0) - dayGoal;
					}
				}

				e.flextime = flextime;
			});
		}
	}

	groupByMonths(): void {
		for (let day of Object.keys(this.daily)) {
			const date = new Date(day);
			const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
			if (!this.months[monthKey]) this.months[monthKey] = {};
			const weekNum = Math.ceil((date.getDate() - date.getDay() + 1) / 7);
			if (!this.months[monthKey][weekNum]) this.months[monthKey][weekNum] = [];
			this.months[monthKey][weekNum].push(...this.daily[day]);
		}
	}

	getOngoing(): number {
		const now = new Date();
		return this.activeEntries.reduce((sum, e) => {
			const start = Utils.parseDate(e.startTime);
			return start ? sum + Utils.hoursDiff(start, now) : sum;
		}, 0);
	}

	getBalanceUpToDate(endDate: string): number {
		let balance = 0;
		const startDate = "2025-11-05";

		const sortedDays = Object.keys(this.daily)
			.filter(day => day >= startDate && day <= endDate)
			.sort();

		for (const day of sortedDays) {
			const dayGoal = this.getDailyGoal(day);
			const dayEntries = this.daily[day] || [];

			let dayWorked = 0;
			let avspaseringHours = 0;

			dayEntries.forEach(e => {
				if (e.name.toLowerCase() === 'avspasering') {
					avspaseringHours += e.duration || 0;
				} else {
					dayWorked += e.duration || 0;
				}
			});

			if (dayGoal === 0) {
				balance += dayWorked;
			} else {
				balance += (dayWorked - dayGoal);
			}

			balance -= avspaseringHours;
		}

		return balance;
	}

	getCurrentBalance(): number {
		const today = Utils.toLocalDateStr(new Date());
		return this.getBalanceUpToDate(today);
	}

	getTotalFlextime(): number {
		return this.getCurrentBalance();
	}

	getCurrentWeekHours(today: Date): number {
		const dayOfWeek = today.getDay();
		const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
		const firstDayOfWeek = new Date(today);
		firstDayOfWeek.setDate(today.getDate() - daysFromMonday);
		const lastDayOfWeek = new Date(firstDayOfWeek);
		lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
		let total = 0;

		for (
			let d = new Date(firstDayOfWeek);
			d <= lastDayOfWeek;
			d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
		) {
			const dayKey = Utils.toLocalDateStr(d);
			const dayEntries = this.daily[dayKey] || [];

			dayEntries.forEach((entry) => {
				const name = entry.name.toLowerCase();
				if (
					name !== "avspasering" &&
					name !== "egenmelding" &&
					name !== "velferdspermisjon" &&
					name !== "ferie"
				) {
					total += entry.duration || 0;
				}
			});
		}

		return total + this.getOngoing();
	}

	getTodayHours(today: Date): number {
		const todayKey = Utils.toLocalDateStr(today);
		const todayEntries = this.daily[todayKey] || [];
		return (
			todayEntries.reduce((sum, e) => sum + (e.duration || 0), 0) + this.getOngoing()
		);
	}

	getAverages(): any {
		if (this._cachedAverages) {
			return this._cachedAverages;
		}

		const today = new Date();
		const todayKey = Utils.toLocalDateStr(today);
		const pastKeys = Object.keys(this.daily).filter((d) => d < todayKey);

		// Filter out weekends from the calculation
		const weekdayKeys = pastKeys.filter(dk => {
			const date = Utils.parseDate(dk);
			return date && !Utils.isWeekend(date, this.settings);
		});

		const totalHoursWorked = weekdayKeys.reduce(
			(sum, dk) => sum + this.daily[dk].reduce((s, e) => s + (e.duration || 0), 0),
			0
		);
		const avgDaily =
			weekdayKeys.length > 0 ? totalHoursWorked / weekdayKeys.length : 0;
		const avgWeekly = totalHoursWorked / (weekdayKeys.length / this.settings.workdaysPerWeek || 1);

		this._cachedAverages = {
			avgDaily,
			avgWeekly,
			totalDaysWorked: weekdayKeys.length,
			totalHoursWorked,
		};

		return this._cachedAverages;
	}

	getStatistics(timeframe: string = "total"): any {
		const today = new Date();
		let filterFn: (dateStr: string) => boolean;

		if (timeframe === "year") {
			const currentYear = today.getFullYear();
			filterFn = (dateStr) => new Date(dateStr).getFullYear() === currentYear;
		} else if (timeframe === "month") {
			const currentYear = today.getFullYear();
			const currentMonth = today.getMonth();
			filterFn = (dateStr) => {
				const d = new Date(dateStr);
				return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
			};
		} else {
			filterFn = () => true;
		}

		const filteredDays = Object.keys(this.daily).filter(filterFn);
		const allEntries = filteredDays.flatMap((day) => this.daily[day]);

		const stats: any = {
			totalHours: allEntries.reduce((sum, e) => sum + (e.duration || 0), 0),
			totalFlextime: allEntries.reduce((sum, e) => sum + (e.flextime || 0), 0),
			jobb: { count: 0, hours: 0 },
			avspasering: { count: 0, hours: 0, planned: 0 },
			ferie: { count: 0, hours: 0, max: 25, planned: 0 },
			velferdspermisjon: { count: 0, hours: 0, planned: 0 },
			egenmelding: { count: 0, hours: 0, max: 24 },
			sykemelding: { count: 0, hours: 0 },
			studie: { count: 0, hours: 0, planned: 0 },
			kurs: { count: 0, hours: 0, planned: 0 },
			workDays: 0,
			weekendDays: 0,
			weekendHours: 0,
			avgDailyHours: 0,
			workloadPercent: 0,
		};

		const daysByType: Record<string, Set<string>> = {
			jobb: new Set(),
			avspasering: new Set(),
			ferie: new Set(),
			velferdspermisjon: new Set(),
			egenmelding: new Set(),
			sykemelding: new Set(),
			studie: new Set(),
			kurs: new Set(),
		};

		const uniqueDays = new Set();
		const weekendDaysSet = new Set();
		const workDaysSet = new Set();

		filteredDays.forEach((dayKey) => {
			const dayDate = new Date(dayKey);
			const dayEntries = this.daily[dayKey];

			uniqueDays.add(dayKey);

			dayEntries.forEach((e) => {
				const name = e.name.toLowerCase();
				if (e.date && Utils.isWeekend(e.date, this.settings)) {
					weekendDaysSet.add(dayKey);
					stats.weekendHours += e.duration || 0;
				} else {
					workDaysSet.add(dayKey);
				}

				if (
					name === "jobb" ||
					!["avspasering", "ferie", "velferdspermisjon", "egenmelding", "studie", "kurs"].includes(name)
				) {
					daysByType.jobb.add(dayKey);
					stats.jobb.hours += e.duration || 0;
				} else if (["avspasering", "ferie", "velferdspermisjon", "egenmelding", "studie", "kurs"].includes(name)) {
					daysByType[name].add(dayKey);
					stats[name].hours += e.duration || 0;
				}
			});
		});

		stats.weekendDays = weekendDaysSet.size;
		stats.workDays = workDaysSet.size;

		stats.jobb.count = daysByType.jobb.size;
		stats.avspasering.count = daysByType.avspasering.size;
		stats.ferie.count = daysByType.ferie.size;
		stats.velferdspermisjon.count = daysByType.velferdspermisjon.size;
		stats.egenmelding.count = daysByType.egenmelding.size;
		stats.studie.count = daysByType.studie.size;
		stats.kurs.count = daysByType.kurs.size;

		// Count planned future days
		Object.keys(this.holidays).forEach((dateStr) => {
			const plannedInfo = this.holidays[dateStr];
			const plannedDate = new Date(dateStr);

			if (filterFn(dateStr) && plannedDate > today) {
				const type = plannedInfo.type;
				if (type === 'ferie' && stats.ferie) {
					stats.ferie.planned++;
				} else if (type === 'avspasering' && stats.avspasering) {
					stats.avspasering.planned++;
				} else if (type === 'velferdspermisjon' && stats.velferdspermisjon) {
					stats.velferdspermisjon.planned++;
				} else if (type === 'studie' && stats.studie) {
					stats.studie.planned++;
				} else if (type === 'kurs' && stats.kurs) {
					stats.kurs.planned++;
				}
			}
		});

		stats.avgDailyHours = uniqueDays.size > 0 ? stats.totalHours / uniqueDays.size : 0;

		if (timeframe === "year" || timeframe === "month") {
			const expectedWorkdays = timeframe === "year"
				? this.settings.workdaysPerYear
				: this.settings.workdaysPerMonth;
			const expectedHours = expectedWorkdays * this.workdayHours;
			stats.workloadPercent = expectedHours > 0 ? (stats.totalHours / expectedHours) * 100 : 0;
		}

		return stats;
	}

	getContextualData(today: Date): any {
		const todayKey = Utils.toLocalDateStr(today);

		if (this._cachedContextData[todayKey]) {
			return this._cachedContextData[todayKey];
		}

		const weekday = today.getDay();

		let consecutiveFlextimeDays = 0;
		const sortedDays = Object.keys(this.daily).sort().reverse();
		for (let day of sortedDays) {
			if (day >= todayKey) continue;
			const dayFlextime = this.daily[day].reduce(
				(sum, e) => sum + (e.flextime || 0),
				0
			);
			if (dayFlextime > 0) {
				consecutiveFlextimeDays++;
			} else {
				break;
			}
		}

		const sameWeekdayKeys = Object.keys(this.daily).filter((d) => {
			const date = new Date(d);
			return date.getDay() === weekday && d < todayKey;
		});

		const sameDayTotal = sameWeekdayKeys.reduce(
			(sum, dk) => sum + this.daily[dk].reduce((s, e) => s + (e.duration || 0), 0),
			0
		);
		const sameDayAvg =
			sameWeekdayKeys.length > 0 ? sameDayTotal / sameWeekdayKeys.length : 0;

		const dayOfWeek = today.getDay();
		const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
		const thisWeekMonday = new Date(today);
		thisWeekMonday.setDate(today.getDate() - daysFromMonday);
		const lastWeekStart = new Date(thisWeekMonday);
		lastWeekStart.setDate(thisWeekMonday.getDate() - 7);
		const lastWeekEnd = new Date(lastWeekStart);
		lastWeekEnd.setDate(lastWeekStart.getDate() + 6);

		let lastWeekHours = 0;
		for (
			let d = new Date(lastWeekStart);
			d <= lastWeekEnd;
			d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
		) {
			const dayKey = Utils.toLocalDateStr(d);
			const dayEntries = this.daily[dayKey] || [];
			lastWeekHours += dayEntries.reduce((s, e) => s + (e.duration || 0), 0);
		}

		const result = { consecutiveFlextimeDays, sameDayAvg, lastWeekHours };

		this._cachedContextData[todayKey] = result;

		return result;
	}

	getWeekTotals(numWeeks: number = 8): number[] {
		const today = new Date();
		const weekTotals: number[] = [];

		for (let i = numWeeks - 1; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(today.getDate() - i * 7);
			const dayOfWeek = d.getDay();
			const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
			const weekStart = new Date(d);
			weekStart.setDate(d.getDate() - daysFromMonday);
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekStart.getDate() + 6);

			let weekSum = 0;
			for (
				let wd = new Date(weekStart);
				wd <= weekEnd;
				wd = new Date(wd.getFullYear(), wd.getMonth(), wd.getDate() + 1)
			) {
				const dayKey = Utils.toLocalDateStr(wd);
				const dayEntries = this.daily[dayKey] || [];
				weekSum += dayEntries.reduce((s, e) => s + (e.duration || 0), 0);
			}
			weekTotals.push(weekSum);
		}
		return weekTotals;
	}

	validateData(): ValidationResults {
		const issues: any = {
			errors: [],
			warnings: [],
			info: [],
			stats: {
				totalEntries: 0,
				entriesChecked: 0,
				entriesWithIssues: 0
			}
		};

		const today = new Date();
		const todayStr = Utils.toLocalDateStr(today);

		const createIssue = (severity: string, type: string, description: string, entry: TimeEntry, dayKey: string) => {
			issues.stats.entriesWithIssues++;
			return {
				severity,
				type,
				description,
				date: dayKey,
				entry: {
					name: entry.name,
					startTime: entry.startTime,
					endTime: entry.endTime,
					duration: entry.duration
				}
			};
		};

		// Validate completed entries
		for (const dayKey in this.daily) {
			const dayEntries = this.daily[dayKey];
			issues.stats.totalEntries += dayEntries.length;

			dayEntries.forEach((entry) => {
				issues.stats.entriesChecked++;

				if (!entry.name || entry.name.trim() === '') {
					issues.errors.push(createIssue(
						'error',
						'Missing Entry Name',
						'Entry has no name/type',
						entry,
						dayKey
					));
				}

				if (!entry.startTime) {
					issues.errors.push(createIssue(
						'error',
						'Missing Start Time',
						'Entry has no start time',
						entry,
						dayKey
					));
					return;
				}

				if ((entry.duration || 0) < 0) {
					issues.errors.push(createIssue(
						'error',
						'Negative Duration',
						`End time is before start time (${entry.duration?.toFixed(1)}h)`,
						entry,
						dayKey
					));
				}

				if ((entry.duration || 0) > 24) {
					issues.errors.push(createIssue(
						'error',
						'Excessive Duration',
						`Entry spans more than 24 hours (${entry.duration?.toFixed(1)}h)`,
						entry,
						dayKey
					));
				}

				if ((entry.duration || 0) > 16 && (entry.duration || 0) <= 24) {
					issues.warnings.push(createIssue(
						'warning',
						'Very Long Session',
						`Entry duration exceeds 16 hours (${entry.duration?.toFixed(1)}h)`,
						entry,
						dayKey
					));
				}

				if ((entry.duration || 0) === 0) {
					issues.info.push(createIssue(
						'info',
						'Zero Duration',
						'Entry has zero duration',
						entry,
						dayKey
					));
				}

				if (dayKey > todayStr) {
					issues.info.push(createIssue(
						'info',
						'Future Date',
						'Entry is dated in the future',
						entry,
						dayKey
					));
				}
			});
		}

		// Validate active entries
		issues.stats.totalEntries += this.activeEntries.length;
		this.activeEntries.forEach((entry) => {
			issues.stats.entriesChecked++;

			if (entry.startTime) {
				const startTime = new Date(entry.startTime);
				const now = new Date();
				const hoursRunning = Utils.hoursDiff(startTime, now);

				if (hoursRunning > 12) {
					issues.warnings.push({
						severity: 'warning',
						type: 'Long-Running Timer',
						description: `Active timer has been running for ${hoursRunning.toFixed(1)} hours`,
						date: Utils.toLocalDateStr(startTime),
						entry: {
							name: entry.name,
							startTime: entry.startTime,
							duration: hoursRunning
						}
					});
					issues.stats.entriesWithIssues++;
				}
			}
		});

		const currentWeekHours = this.getCurrentWeekHours(today);
		if (currentWeekHours > 60) {
			issues.info.push({
				severity: 'info',
				type: 'High Weekly Total',
				description: `Current week total exceeds 60 hours (${currentWeekHours.toFixed(1)}h)`,
				date: todayStr
			});
		}

		return {
			hasErrors: issues.errors.length > 0,
			hasWarnings: issues.warnings.length > 0,
			hasInfo: issues.info.length > 0,
			issues,
			generatedAt: new Date().toISOString()
		};
	}
}
