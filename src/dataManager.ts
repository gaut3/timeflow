import { App, TFile } from 'obsidian';
import { TimeFlowSettings, SpecialDayBehavior } from './settings';
import { Utils } from './utils';

export interface TimeEntry {
	name: string;
	startTime: string;
	endTime?: string;
	duration?: number;
	flextime?: number;
	date?: Date;
	subEntries?: TimeEntry[];
	isActive?: boolean; // True if this is an ongoing timer entry
}

export interface HolidayInfo {
	type: string;
	description: string;
	halfDay: boolean;
	startTime?: string;  // HH:MM format for avspasering
	endTime?: string;    // HH:MM format for avspasering
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
					// Match formats:
					// - YYYY-MM-DD: type: description
					// - YYYY-MM-DD: type:half: description
					// - YYYY-MM-DD: avspasering:14:00-16:00: description (time range)
					const match = line.match(/^-\s*(\d{4}-\d{2}-\d{2}):\s*(\w+)(?::(half|\d{2}:\d{2}-\d{2}:\d{2})?)?:\s*(.+)$/);
					if (match) {
						const [, date, type, modifier, description] = match;
						const isHalfDay = modifier === 'half';

						// Parse time range (e.g., "14:00-16:00")
						let startTime: string | undefined;
						let endTime: string | undefined;
						if (modifier && modifier.includes('-') && modifier.includes(':')) {
							const [start, end] = modifier.split('-');
							startTime = start;
							endTime = end;
						}

						this.holidays[date] = {
							type: type.trim().toLowerCase(),
							description: description.trim(),
							halfDay: isHalfDay,
							startTime,
							endTime
						};
					}
				});

				status.success = true;
				status.count = Object.keys(this.holidays).length;
				status.message = `Loaded ${status.count} planned days`;
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

	getSpecialDayBehavior(id: string): SpecialDayBehavior | undefined {
		// Case-insensitive lookup to handle legacy data with different casing (e.g., "Jobb" vs "jobb")
		const behavior = this.settings.specialDayBehaviors.find(b => b.id.toLowerCase() === id.toLowerCase());
		if (!behavior) {
			// Return a neutral fallback for orphaned/unknown types
			// This ensures deleted types don't break historical data
			return {
				id: id,
				label: id,
				icon: '❓',
				color: '#cccccc',
				textColor: '#000000',
				noHoursRequired: true,
				flextimeEffect: 'none',
				includeInStats: false
			};
		}
		return behavior;
	}

	getDailyGoal(dateStr: string): number {
		// NEW: Simple tracking mode - no goals
		if (!this.settings.enableGoalTracking) {
			return 0;
		}

		const date = new Date(dateStr);
		const isWeekend = Utils.isWeekend(date, this.settings);

		if (isWeekend) return 0;

		const holidayInfo = this.getHolidayInfo(dateStr);
		if (holidayInfo) {
			// Check if this special day type requires no hours
			const behavior = this.getSpecialDayBehavior(holidayInfo.type);
			if (behavior && behavior.noHoursRequired) {
				// No work hours required (e.g., vacation, sick leave)
				return 0;
			}

			// For days that require hours (like kurs, studie),
			// apply regular workday goal or half-day goal
			if (holidayInfo.halfDay) {
				// Calculate half-day hours based on settings
				const halfDayHours = this.settings.halfDayMode === 'percentage'
					? this.settings.baseWorkday / 2
					: this.settings.halfDayHours;
				return halfDayHours;
			}
		}

		// Also check if there's a special day entry (ferie, egenmelding, etc.) for this date
		// This handles legacy/imported data that exists only in data.md (not in holidays.md)
		if (this.daily[dateStr]) {
			const specialEntry = this.daily[dateStr].find(e => {
				const behavior = this.getSpecialDayBehavior(e.name);
				// Check noHoursRequired OR countsAsWorkday (legacy property for ferie, etc.)
				return behavior && (behavior.noHoursRequired || behavior.countsAsWorkday);
			});
			if (specialEntry) {
				return 0;
			}
		}

		return this.workdayHours;
	}

	processEntries(): void {
		// Clear existing data to prevent duplicates when reprocessing
		this.daily = {};
		this.activeEntries = [];
		this.activeEntriesByDate = {};
		this.months = {};
		this._cachedAverages = null;
		this._cachedContextData = {};

		this.rawEntries.forEach((e) => {
			if (!e.startTime) return;
			const start = Utils.parseDate(e.startTime);
			if (!start) return;

			const dayKey = Utils.toLocalDateStr(start);

			// Check for active entries (no endTime or endTime is null/undefined)
			if (!e.endTime) {
				console.log('TimeFlow: Processing active entry:', e.name, 'on', dayKey);
				// Active entry - track separately but also include in daily for history
				this.activeEntries.push(e);
				if (!this.activeEntriesByDate[dayKey]) this.activeEntriesByDate[dayKey] = [];
				this.activeEntriesByDate[dayKey].push(e);

				// Calculate duration from start to now for display in history
				const now = new Date();
				let duration = Utils.hoursDiff(start, now);

				// Deduct lunch break for work entries (jobb)
				if (e.name.toLowerCase() === 'jobb' && this.settings.lunchBreakMinutes > 0) {
					const lunchBreakHours = this.settings.lunchBreakMinutes / 60;
					duration = Math.max(0, duration - lunchBreakHours);
				}

				if (!this.daily[dayKey]) this.daily[dayKey] = [];
				this.daily[dayKey].push({ ...e, duration, date: start, isActive: true });
				return;
			}

			const end = Utils.parseDate(e.endTime);
			if (!end) return;

			let duration = Utils.hoursDiff(start, end);

			// Deduct lunch break for work entries (jobb)
			if (e.name.toLowerCase() === 'jobb' && this.settings.lunchBreakMinutes > 0) {
				const lunchBreakHours = this.settings.lunchBreakMinutes / 60;
				duration = Math.max(0, duration - lunchBreakHours);
			}

			if (!this.daily[dayKey]) this.daily[dayKey] = [];
			this.daily[dayKey].push({ ...e, duration, date: start });
		});
		this.calculateFlextime();
		this.groupByMonths();
	}

	calculateFlextime(): void {
		// Skip flextime calculation in simple tracking mode - set all to 0
		if (!this.settings.enableGoalTracking) {
			for (let day in this.daily) {
				this.daily[day].forEach((e) => {
					e.flextime = 0;
				});
			}
			return;
		}

		for (let day in this.daily) {
			const dayGoal = this.getDailyGoal(day);
			const holidayInfo = this.getHolidayInfo(day);

			this.daily[day].forEach((e) => {
				let flextime = 0;
				const name = e.name.toLowerCase();

				// Check if this is a special day with behavior rules
				if (holidayInfo) {
					const behavior = this.getSpecialDayBehavior(holidayInfo.type);
					if (behavior) {
						if (behavior.flextimeEffect === 'withdraw') {
							// Withdraws from flextime (e.g., avspasering)
							flextime -= e.duration || 0;
						} else if (behavior.flextimeEffect === 'accumulate') {
							// Excess hours count as flextime (e.g., kurs, studie)
							if (dayGoal > 0 && (e.duration || 0) > dayGoal) {
								flextime += (e.duration || 0) - dayGoal;
							}
						} else if (behavior.noHoursRequired && dayGoal === 0) {
							// 'none' effect on no-hours-required day: work counts as bonus (like weekends)
							flextime += e.duration || 0;
						}
						// 'none' effect on regular goal day means no special flextime handling
					}
				} else if (dayGoal === 0) {
					// Weekend or no goal: all hours count as flextime bonus
					flextime += e.duration || 0;
				} else {
					// Regular workday: hours beyond goal count as flextime
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
			const weekNum = Utils.getWeekNumber(date);
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
		const startDate = this.settings.balanceStartDate;

		const sortedDays = Object.keys(this.daily)
			.filter(day => day >= startDate && day <= endDate)
			.sort();

		for (const day of sortedDays) {
			const dayGoal = this.getDailyGoal(day);
			const dayEntries = this.daily[day] || [];

			let dayWorked = 0;
			let avspaseringHours = 0;
			let hasCompletedEntries = false;

			dayEntries.forEach(e => {
				// Skip active entries - only count completed work in balance
				if (e.isActive) return;
				hasCompletedEntries = true;
				if (e.name.toLowerCase() === 'avspasering') {
					avspaseringHours += e.duration || 0;
				} else {
					dayWorked += e.duration || 0;
				}
			});

			// Skip days that only have active entries (work in progress)
			if (!hasCompletedEntries) continue;

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
				// Skip active entries since getOngoing() calculates their duration separately
				if (entry.isActive) return;
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
		// Exclude active entries since getOngoing() calculates their duration separately
		return (
			todayEntries.filter(e => !e.isActive).reduce((sum, e) => sum + (e.duration || 0), 0) + this.getOngoing()
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

		// Only count days with actual work (work types with duration > 0)
		// Exclude vacation, sick days etc. from the workload calculation
		const workDayKeys = weekdayKeys.filter(dk => {
			const entries = this.daily[dk];
			// Check if any entry is a work type with actual hours
			return entries.some(e => {
				const behavior = this.getSpecialDayBehavior(e.name);
				return behavior?.isWorkType && (e.duration || 0) > 0;
			});
		});

		const totalHoursWorked = workDayKeys.reduce(
			(sum, dk) => sum + this.daily[dk].reduce((s, e) => {
				// Only sum hours from work types
				const behavior = this.getSpecialDayBehavior(e.name);
				return s + (behavior?.isWorkType ? (e.duration || 0) : 0);
			}, 0),
			0
		);
		const avgDaily =
			workDayKeys.length > 0 ? totalHoursWorked / workDayKeys.length : 0;
		// Guard against division by zero if workdaysPerWeek is 0
		const weeksWorked = this.settings.workdaysPerWeek > 0
			? workDayKeys.length / this.settings.workdaysPerWeek
			: 0;
		const avgWeekly = weeksWorked > 0 ? totalHoursWorked / weeksWorked : 0;

		this._cachedAverages = {
			avgDaily,
			avgWeekly,
			totalDaysWorked: workDayKeys.length,
			totalHoursWorked,
		};

		return this._cachedAverages;
	}

	getStatistics(timeframe: string = "total", year?: number, month?: number): any {
		const today = new Date();
		let filterFn: (dateStr: string) => boolean;

		if (timeframe === "year") {
			const targetYear = year !== undefined ? year : today.getFullYear();
			filterFn = (dateStr) => new Date(dateStr).getFullYear() === targetYear;
		} else if (timeframe === "month") {
			const targetYear = year !== undefined ? year : today.getFullYear();
			const targetMonth = month !== undefined ? month : today.getMonth();
			filterFn = (dateStr) => {
				const d = new Date(dateStr);
				return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
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
			ferie: { count: 0, hours: 0, max: this.getSpecialDayBehavior('ferie')?.maxDaysPerYear || this.settings.maxFerieDays, planned: 0 },
			velferdspermisjon: { count: 0, hours: 0, planned: 0 },
			egenmelding: { count: 0, hours: 0, max: this.getSpecialDayBehavior('egenmelding')?.maxDaysPerYear || this.settings.maxEgenmeldingDays },
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

			// Count special days with noHoursRequired in this period to adjust expected workdays
			let noHoursRequiredDays = 0;
			filteredDays.forEach((dayKey) => {
				const holidayInfo = this.getHolidayInfo(dayKey);
				if (holidayInfo) {
					const behavior = this.getSpecialDayBehavior(holidayInfo.type);
					if (behavior?.noHoursRequired) {
						noHoursRequiredDays++;
					}
				}
			});

			const adjustedWorkdays = Math.max(0, expectedWorkdays - noHoursRequiredDays);
			const expectedHours = adjustedWorkdays * this.workdayHours;
			stats.workloadPercent = expectedHours > 0 ? (stats.totalHours / expectedHours) * 100 : 0;
		}

		return stats;
	}

	getAvailableYears(): number[] {
		const years = new Set<number>();
		Object.keys(this.daily).forEach(dateStr => {
			const year = new Date(dateStr).getFullYear();
			years.add(year);
		});
		return Array.from(years).sort((a, b) => b - a); // Descending order
	}

	getAvailableMonthsForYear(year: number): number[] {
		const months = new Set<number>();
		Object.keys(this.daily).forEach(dateStr => {
			const date = new Date(dateStr);
			if (date.getFullYear() === year) {
				months.add(date.getMonth());
			}
		});
		return Array.from(months).sort((a, b) => a - b); // Ascending order
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

				if ((entry.duration || 0) > this.settings.validationThresholds.maxDurationHours) {
					issues.errors.push(createIssue(
						'error',
						'Excessive Duration',
						`Entry spans more than ${this.settings.validationThresholds.maxDurationHours} hours (${entry.duration?.toFixed(1)}h)`,
						entry,
						dayKey
					));
				}

				if ((entry.duration || 0) > this.settings.validationThresholds.veryLongSessionHours
					&& (entry.duration || 0) <= this.settings.validationThresholds.maxDurationHours) {
					issues.warnings.push(createIssue(
						'warning',
						'Very Long Session',
						`Entry duration exceeds ${this.settings.validationThresholds.veryLongSessionHours} hours (${entry.duration?.toFixed(1)}h)`,
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

			// Check for overlapping entries on the same day
			if (dayEntries.length > 1) {
				const sortedEntries = [...dayEntries]
					.filter(e => e.startTime && e.endTime)
					.sort((a, b) => {
						const aStart = new Date(a.startTime!);
						const bStart = new Date(b.startTime!);
						return aStart.getTime() - bStart.getTime();
					});

				for (let i = 0; i < sortedEntries.length - 1; i++) {
					const current = sortedEntries[i];
					const next = sortedEntries[i + 1];

					if (current.startTime && current.endTime && next.startTime && next.endTime) {
						const currentEnd = new Date(current.endTime);
						const nextStart = new Date(next.startTime);

						if (currentEnd > nextStart) {
							const overlapMinutes = Math.round((currentEnd.getTime() - nextStart.getTime()) / 60000);
							issues.errors.push({
								severity: 'error',
								type: 'Overlapping Entries',
								description: `Entries overlap by ${overlapMinutes} minutes`,
								date: dayKey,
								entry: {
									name: `${current.name} → ${next.name}`,
									startTime: current.startTime,
									endTime: next.endTime
								}
							});
							issues.stats.entriesWithIssues++;
						}
					}
				}
			}
		}

		// Check for missing workday entries (after first entry date)
		const allDates = Object.keys(this.daily).sort();
		if (allDates.length > 0) {
			const firstDate = new Date(allDates[0]);
			const lastDate = today;

			// Iterate through all dates from first entry to today
			for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
				const dateStr = Utils.toLocalDateStr(d);
				const isWeekend = Utils.isWeekend(d, this.settings);
				const holidayInfo = this.getHolidayInfo(dateStr);
				const hasEntries = this.daily[dateStr] && this.daily[dateStr].length > 0;

				// Skip if it's a weekend (unless weekend work is enabled)
				if (isWeekend) continue;

				// Skip if it's a holiday that counts as a workday (ferie, egenmelding, etc.)
				if (holidayInfo && ['ferie', 'helligdag', 'egenmelding', 'sykemelding', 'velferdspermisjon'].includes(holidayInfo.type)) {
					continue;
				}

				// Skip today and future dates
				if (dateStr >= todayStr) continue;

				// If no entries on a past workday, flag it
				if (!hasEntries) {
					issues.warnings.push({
						severity: 'warning',
						type: 'Missing Entry',
						description: 'No work entries registered for this workday',
						date: dateStr
					});
				}
			}
		}

		// Validate active entries
		issues.stats.totalEntries += this.activeEntries.length;
		this.activeEntries.forEach((entry) => {
			issues.stats.entriesChecked++;

			if (entry.startTime) {
				const startTime = new Date(entry.startTime);
				const now = new Date();
				const hoursRunning = Utils.hoursDiff(startTime, now);

				if (hoursRunning > this.settings.validationThresholds.longRunningTimerHours) {
					issues.warnings.push({
						severity: 'warning',
						type: 'Long-Running Timer',
						description: `Active timer has been running for ${hoursRunning.toFixed(1)} hours (threshold: ${this.settings.validationThresholds.longRunningTimerHours}h)`,
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
		if (currentWeekHours > this.settings.validationThresholds.highWeeklyTotalHours) {
			issues.info.push({
				severity: 'info',
				type: 'High Weekly Total',
				description: `Current week total exceeds ${this.settings.validationThresholds.highWeeklyTotalHours} hours (${currentWeekHours.toFixed(1)}h)`,
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

	/**
	 * Check if there's a rest period violation for a given date
	 * A violation occurs when the gap between the last work session ending on the previous day
	 * and the first work session starting on the given day is less than the minimum rest hours
	 */
	checkRestPeriodViolation(dateStr: string): { violated: boolean; restHours: number | null; previousDayEnd: string | null; currentDayStart: string | null } {
		const minimumRestHours = this.settings.complianceSettings?.minimumRestHours ?? 11;

		// Get the previous day
		const currentDate = new Date(dateStr);
		const previousDate = new Date(currentDate);
		previousDate.setDate(previousDate.getDate() - 1);
		const previousDayKey = Utils.toLocalDateStr(previousDate);

		// Get entries for both days
		const previousDayEntries = this.daily[previousDayKey] || [];
		const currentDayEntries = this.daily[dateStr] || [];

		if (previousDayEntries.length === 0 || currentDayEntries.length === 0) {
			return { violated: false, restHours: null, previousDayEnd: null, currentDayStart: null };
		}

		// Find the last end time of the previous day
		let lastEndTimeMs = 0;
		let lastEndTimeStr = '';
		previousDayEntries.forEach(entry => {
			if (entry.endTime) {
				const endTime = new Date(entry.endTime);
				if (endTime.getTime() > lastEndTimeMs) {
					lastEndTimeMs = endTime.getTime();
					lastEndTimeStr = endTime.toISOString();
				}
			}
		});

		// Find the first start time of the current day
		let firstStartTimeMs = Infinity;
		let firstStartTimeStr = '';
		currentDayEntries.forEach(entry => {
			if (entry.startTime) {
				const startTime = new Date(entry.startTime);
				if (startTime.getTime() < firstStartTimeMs) {
					firstStartTimeMs = startTime.getTime();
					firstStartTimeStr = startTime.toISOString();
				}
			}
		});

		if (lastEndTimeMs === 0 || firstStartTimeMs === Infinity) {
			return { violated: false, restHours: null, previousDayEnd: null, currentDayStart: null };
		}

		// Calculate the gap in hours
		const restHours = (firstStartTimeMs - lastEndTimeMs) / (1000 * 60 * 60);
		const violated = restHours < minimumRestHours;

		return {
			violated,
			restHours,
			previousDayEnd: lastEndTimeStr,
			currentDayStart: firstStartTimeStr
		};
	}

	/**
	 * Get statistics for a special day type, respecting the counting period setting
	 * For historical years, always use calendar year counting
	 * For current year, respect the countingPeriod setting
	 */
	getSpecialDayStats(typeId: string, year?: number): { count: number; max: number | undefined; isRolling: boolean; periodLabel: string } {
		const behavior = this.getSpecialDayBehavior(typeId);
		const today = new Date();
		const currentYear = today.getFullYear();
		const targetYear = year ?? currentYear;
		const isCurrentYear = targetYear === currentYear;

		// Determine counting period
		const countingPeriod = behavior?.countingPeriod || 'calendar';
		const useRolling = isCurrentYear && countingPeriod === 'rolling365';

		let count = 0;
		const daysSeen = new Set<string>();

		if (useRolling) {
			// Count days in the last 365 days
			const cutoffDate = new Date(today);
			cutoffDate.setDate(cutoffDate.getDate() - 365);
			const cutoffStr = Utils.toLocalDateStr(cutoffDate);

			Object.keys(this.daily).forEach(dateStr => {
				if (dateStr >= cutoffStr && dateStr <= Utils.toLocalDateStr(today)) {
					const entries = this.daily[dateStr];
					entries.forEach(entry => {
						if (entry.name.toLowerCase() === typeId && !daysSeen.has(dateStr)) {
							daysSeen.add(dateStr);
							count++;
						}
					});
				}
			});

			// Also count from holidays file
			Object.keys(this.holidays).forEach(dateStr => {
				if (dateStr >= cutoffStr && dateStr <= Utils.toLocalDateStr(today)) {
					const holidayInfo = this.holidays[dateStr];
					if (holidayInfo.type === typeId && !daysSeen.has(dateStr)) {
						daysSeen.add(dateStr);
						count++;
					}
				}
			});
		} else {
			// Count days in the calendar year
			Object.keys(this.daily).forEach(dateStr => {
				const date = new Date(dateStr);
				if (date.getFullYear() === targetYear) {
					const entries = this.daily[dateStr];
					entries.forEach(entry => {
						if (entry.name.toLowerCase() === typeId && !daysSeen.has(dateStr)) {
							daysSeen.add(dateStr);
							count++;
						}
					});
				}
			});

			// Also count from holidays file
			Object.keys(this.holidays).forEach(dateStr => {
				const date = new Date(dateStr);
				if (date.getFullYear() === targetYear) {
					const holidayInfo = this.holidays[dateStr];
					if (holidayInfo.type === typeId && !daysSeen.has(dateStr)) {
						daysSeen.add(dateStr);
						count++;
					}
				}
			});
		}

		return {
			count,
			max: behavior?.maxDaysPerYear,
			isRolling: useRolling,
			periodLabel: useRolling ? '365d' : targetYear.toString()
		};
	}
}
