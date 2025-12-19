import { App, TFile, normalizePath } from 'obsidian';
import { TimeFlowSettings, SpecialDayBehavior, WorkSchedulePeriod } from './settings';
import { Utils } from './utils';
import { t, translateAnnetTemplateName } from './i18n';

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
	annetTemplateId?: string;  // Template ID for 'annet' entries
}

export interface ValidationIssue {
	severity: string;
	type: string;
	description: string;
	date: string;
	entry?: {
		name: string;
		startTime: string;
		endTime?: string;
		duration?: number;
	};
}

export interface ValidationIssues {
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
	info: ValidationIssue[];
	stats: {
		totalEntries: number;
		entriesChecked: number;
		entriesWithIssues: number;
	};
}

export interface AveragesData {
	avgDaily: number;
	avgWeekly: number;
	totalDaysWorked: number;
	totalHoursWorked: number;
}

export interface StatisticsData {
	totalHours: number;
	workDays: number;
	averagePerDay: number;
	weekdayBreakdown: Record<string, number>;
	monthlyTotals: Record<string, number>;
	typeBreakdown: Record<string, number>;
	avgByType: Record<string, number>;
}

export interface ContextualData {
	consecutiveFlextimeDays: number;
	sameDayAvg: number;
	lastWeekHours: number;
}

export interface DayTypeStats {
	count: number;
	hours: number;
	planned?: number;
	max?: number;
}

export interface TimeStatistics {
	totalHours: number;
	totalFlextime: number;
	jobb: DayTypeStats;
	avspasering: DayTypeStats;
	ferie: DayTypeStats;
	velferdspermisjon: DayTypeStats;
	egenmelding: DayTypeStats;
	sykemelding: DayTypeStats;
	studie: DayTypeStats;
	kurs: DayTypeStats;
	workDays: number;
	weekendDays: number;
	weekendHours: number;
	avgDailyHours: number;
	workloadPercent: number;
}

export interface HolidayLoadStatus {
	success: boolean;
	message: string;
	count: number;
	warning: string | null;
	parseErrors?: number;           // Lines that couldn't be parsed
	duplicates?: string[];          // Dates with duplicate entries
	invalidTimeRanges?: string[];   // Dates with invalid time ranges (end <= start)
}

export interface ValidationResults {
	hasErrors: boolean;
	hasWarnings: boolean;
	hasInfo: boolean;
	issues: ValidationIssues;
	generatedAt: string;
}

export interface SpecialDayHours {
	type: string;
	hours: number;
	color: string;
}

export interface BarChartData {
	label: string;
	hours: number;
	target?: number;
	specialDays?: SpecialDayHours[];
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
	private _cachedAverages: AveragesData | null = null;
	private _cachedContextData: Record<string, ContextualData> = {};

	constructor(entries: TimeEntry[], settings: TimeFlowSettings, app: App) {
		this.rawEntries = entries;
		this.settings = settings;
		this.app = app;
		this.workdayHours = settings.baseWorkday * settings.workPercent;
		this.workweekHours = settings.baseWorkweek * settings.workPercent;
	}

	async loadHolidays(): Promise<HolidayLoadStatus> {
		const status: HolidayLoadStatus = { success: false, message: '', count: 0, warning: null };

		// Clear existing holidays before reloading
		this.holidays = {};

		// Track validation issues
		let parseErrors = 0;
		const duplicates: string[] = [];
		const invalidTimeRanges: string[] = [];

		// Helper to validate time range (start must be before end)
		const isValidTimeRange = (start: string, end: string): boolean => {
			const startMinutes = parseInt(start.split(':')[0]) * 60 + parseInt(start.split(':')[1]);
			const endMinutes = parseInt(end.split(':')[0]) * 60 + parseInt(end.split(':')[1]);
			return endMinutes > startMinutes;
		};

		try {
			const holidayFile = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.holidaysFilePath));
			if (holidayFile && holidayFile instanceof TFile) {
				const content = await this.app.vault.read(holidayFile);
				const lines = content.split('\n');

				lines.forEach(line => {
					// Skip empty lines and comments
					const trimmedLine = line.trim();
					if (!trimmedLine || trimmedLine.startsWith('#') || !trimmedLine.startsWith('-')) {
						return;
					}

					// Match formats:
					// - YYYY-MM-DD: type: description
					// - YYYY-MM-DD: type:half: description
					// - YYYY-MM-DD: avspasering:14:00-16:00: description (time range)
					// - YYYY-MM-DD: annet:templateId:HH:MM-HH:MM: description (annet with template and time)
					// - YYYY-MM-DD: annet:templateId: description (annet with template, full day)
					// - YYYY-MM-DD: annet:HH:MM-HH:MM: description (annet without template, with time)
					// - YYYY-MM-DD: annet: description (annet without template, full day)
					const match = line.match(/^-\s*(\d{4}-\d{2}-\d{2}):\s*(\w+)(?::(half|\d{2}:\d{2}-\d{2}:\d{2})?)?:\s*(.+)$/);

					// Special handling for annet entries with more complex format
					const annetMatch = line.match(/^-\s*(\d{4}-\d{2}-\d{2}):\s*annet(?::([^:]+))?(?::(\d{2}:\d{2}-\d{2}:\d{2}))?:\s*(.+)$/);

					let parsedDate: string | null = null;

					if (annetMatch) {
						const [, date, templateOrTime, timeRange, description] = annetMatch;
						parsedDate = date;
						let annetTemplateId: string | undefined;
						let startTime: string | undefined;
						let endTime: string | undefined;

						// Check if templateOrTime is a time range (HH:MM-HH:MM) or a template ID
						if (templateOrTime && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(templateOrTime)) {
							// It's a time range without template
							const [start, end] = templateOrTime.split('-');
							startTime = start;
							endTime = end;
						} else if (templateOrTime) {
							// It's a template ID
							annetTemplateId = templateOrTime.trim().toLowerCase();
							// Check for time range in third position
							if (timeRange) {
								const [start, end] = timeRange.split('-');
								startTime = start;
								endTime = end;
							}
						}

						// Validate time range if present
						if (startTime && endTime && !isValidTimeRange(startTime, endTime)) {
							invalidTimeRanges.push(date);
						}

						// Check for duplicate
						if (this.holidays[date]) {
							duplicates.push(date);
						}

						this.holidays[date] = {
							type: 'annet',
							description: description.trim(),
							halfDay: false,
							startTime,
							endTime,
							annetTemplateId
						};
					} else if (match) {
						const [, date, type, modifier, description] = match;
						parsedDate = date;
						const isHalfDay = modifier === 'half';

						// Parse time range (e.g., "14:00-16:00")
						let startTime: string | undefined;
						let endTime: string | undefined;
						if (modifier && modifier.includes('-') && modifier.includes(':')) {
							const [start, end] = modifier.split('-');
							startTime = start;
							endTime = end;

							// Validate time range
							if (!isValidTimeRange(start, end)) {
								invalidTimeRanges.push(date);
							}
						}

						// Check for duplicate
						if (this.holidays[date]) {
							duplicates.push(date);
						}

						this.holidays[date] = {
							type: type.trim().toLowerCase(),
							description: description.trim(),
							halfDay: isHalfDay,
							startTime,
							endTime
						};
					} else {
						// Only count as parse error if it looks like a date entry attempt (- YYYY- pattern)
						if (/^-\s*\d{4}-/.test(line)) {
							parseErrors++;
						}
					}
				});

				status.success = true;
				status.count = Object.keys(this.holidays).length;
				status.message = t('status.loadedPlannedDays').replace('{count}', String(status.count));

				// Add validation results to status
				if (parseErrors > 0) status.parseErrors = parseErrors;
				if (duplicates.length > 0) status.duplicates = duplicates;
				if (invalidTimeRanges.length > 0) status.invalidTimeRanges = invalidTimeRanges;
			} else {
				status.warning = `Holiday file not found: ${this.settings.holidaysFilePath}`;
				console.warn(status.warning);
			}
		} catch (error) {
			status.warning = `Error loading holidays: ${error instanceof Error ? error.message : String(error)}`;
			console.warn("Could not load future days file:", error);
		}

		return status;
	}

	isHoliday(dateStr: string): boolean {
		return Object.prototype.hasOwnProperty.call(this.holidays, dateStr);
	}

	getHolidayInfo(dateStr: string): HolidayInfo | null {
		return this.holidays[dateStr] || null;
	}

	getSpecialDayBehavior(id: string): SpecialDayBehavior | undefined {
		// Case-insensitive lookup to handle legacy data with different casing (e.g., "Jobb" vs "jobb")
		const behavior = this.settings.specialDayBehaviors.find(b => b.id.toLowerCase() === id.toLowerCase());
		if (!behavior) {
			// Return a work-like fallback for unknown types (e.g., "Block 1" from Timekeep imports)
			// This treats unknown entries as regular work - hours count toward daily goal
			// Using isWorkType: true ensures they behave like "jobb" entries, not like "accumulate" types
			return {
				id: id,
				label: id,
				icon: '❓',
				color: '#cccccc',
				textColor: '#000000',
				noHoursRequired: false,
				flextimeEffect: 'none',
				isWorkType: true,
				includeInStats: true
			};
		}
		return behavior;
	}

	/**
	 * Check if a comment is required for stopping a timer on a given date.
	 * Required if:
	 * - Date >= effective date
	 * - Entry is work type or accumulate type
	 * - Day's total work + additionalDuration exceeds (dailyGoal + threshold)
	 */
	checkCommentRequired(
		dateStr: string,
		entryType: string,
		additionalDuration: number
	): { required: boolean; hoursOverThreshold: number; dailyGoal: number } {
		// Check if overtime comments feature is enabled
		if (!this.settings.enableOvertimeComments) {
			return { required: false, hoursOverThreshold: 0, dailyGoal: 0 };
		}

		const threshold = this.settings.overtimeCommentThreshold ?? 0.5;
		const effectiveDate = this.settings.overtimeCommentEffectiveDate ?? '2025-01-01';

		// Check if date >= effective date
		if (dateStr < effectiveDate) {
			return { required: false, hoursOverThreshold: 0, dailyGoal: 0 };
		}

		// Check if entry type requires comments (work/accumulate only)
		const behavior = this.getSpecialDayBehavior(entryType);
		if (!behavior?.isWorkType && behavior?.flextimeEffect !== 'accumulate') {
			return { required: false, hoursOverThreshold: 0, dailyGoal: 0 };
		}

		// Calculate day's work total
		const dailyGoal = this.getDailyGoal(dateStr);
		const dayEntries = this.daily[dateStr] || [];

		let dayWorkTotal = 0;
		dayEntries.forEach(e => {
			// Only count completed entries (not active ones)
			if (!e.isActive) {
				const eBehavior = this.getSpecialDayBehavior(e.name);
				if (eBehavior?.isWorkType || eBehavior?.flextimeEffect === 'accumulate') {
					dayWorkTotal += e.duration || 0;
				}
			}
		});

		// Add the current timer's duration
		dayWorkTotal += additionalDuration;

		// Check if exceeds threshold
		const thresholdLimit = dailyGoal + threshold;
		const hoursOverThreshold = dayWorkTotal - thresholdLimit;

		return {
			required: hoursOverThreshold > 0,
			hoursOverThreshold: Math.max(0, hoursOverThreshold),
			dailyGoal
		};
	}

	/**
	 * Get the behavior for an 'annet' holiday entry with dynamic properties based on time range.
	 * - Full day (no time range): noHoursRequired=true, flextimeEffect='none'
	 * - Partial day (with time range): noHoursRequired=false, flextimeEffect='reduce_goal'
	 */
	getAnnetBehavior(holidayInfo: HolidayInfo): SpecialDayBehavior {
		const baseBehavior = this.getSpecialDayBehavior('annet');
		const hasTimeRange = !!holidayInfo.startTime && !!holidayInfo.endTime;

		// Get template info for icon/label if available
		let icon = baseBehavior?.icon || '📋';
		let label = baseBehavior?.label || 'Annet';

		if (holidayInfo.annetTemplateId) {
			const template = this.settings.annetTemplates?.find(
				t => t.id.toLowerCase() === holidayInfo.annetTemplateId?.toLowerCase()
			);
			if (template) {
				icon = template.icon;
				label = translateAnnetTemplateName(template.id, template.label);
			}
		}

		if (hasTimeRange) {
			// Partial day: reduce_goal behavior
			return {
				...baseBehavior!,
				icon,
				label,
				noHoursRequired: false,
				flextimeEffect: 'reduce_goal'
			};
		} else {
			// Full day: none behavior (like ferie)
			return {
				...baseBehavior!,
				icon,
				label,
				noHoursRequired: true,
				flextimeEffect: 'none'
			};
		}
	}

	/**
	 * Get the work schedule that was active on a specific date.
	 *
	 * Logic:
	 * - Periods are sorted by effectiveFrom date
	 * - Find the most recent period that started on or before the given date
	 * - If the date is before ALL periods, use the earliest period (not current settings)
	 *   This ensures historical consistency even before the first recorded period
	 * - Future periods work correctly: they won't apply until their effective date
	 */
	getScheduleForDate(dateStr: string): { workPercent: number; baseWorkday: number; baseWorkweek: number; workDays: number[]; halfDayHours: number } {
		const history = this.settings.workScheduleHistory;

		// If no history, use current settings
		if (!history || history.length === 0) {
			return {
				workPercent: this.settings.workPercent,
				baseWorkday: this.settings.baseWorkday,
				baseWorkweek: this.settings.baseWorkweek,
				workDays: this.settings.workDays,
				halfDayHours: this.settings.halfDayHours
			};
		}

		// Sort history by effectiveFrom date (ascending)
		const sortedHistory = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

		// Find the most recent period that started on or before the given date
		let activePeriod: WorkSchedulePeriod | null = null;
		for (const period of sortedHistory) {
			if (period.effectiveFrom <= dateStr) {
				activePeriod = period;
			} else {
				break; // All subsequent periods are in the future relative to dateStr
			}
		}

		// If a period applies, use it
		if (activePeriod) {
			return {
				workPercent: activePeriod.workPercent,
				baseWorkday: activePeriod.baseWorkday,
				baseWorkweek: activePeriod.baseWorkweek,
				workDays: activePeriod.workDays,
				halfDayHours: activePeriod.halfDayHours
			};
		}

		// Date is before all periods - use the earliest period for consistency
		// (This handles dates before balanceStartDate consistently)
		const earliestPeriod = sortedHistory[0];
		return {
			workPercent: earliestPeriod.workPercent,
			baseWorkday: earliestPeriod.baseWorkday,
			baseWorkweek: earliestPeriod.baseWorkweek,
			workDays: earliestPeriod.workDays,
			halfDayHours: earliestPeriod.halfDayHours
		};
	}

	getDailyGoal(dateStr: string): number {
		// NEW: Simple tracking mode - no goals
		if (!this.settings.enableGoalTracking) {
			return 0;
		}

		// Get the schedule that was active on this date
		const schedule = this.getScheduleForDate(dateStr);

		const date = new Date(dateStr);
		// Check if this date is a weekend based on the schedule's work days
		const dayOfWeek = date.getDay();
		const isWeekend = !schedule.workDays.includes(dayOfWeek);

		if (isWeekend) return 0;

		const holidayInfo = this.getHolidayInfo(dateStr);
		if (holidayInfo) {
			// Check if this special day type requires no hours
			// Use dynamic behavior for 'annet' entries
			const behavior = holidayInfo.type === 'annet'
				? this.getAnnetBehavior(holidayInfo)
				: this.getSpecialDayBehavior(holidayInfo.type);
			if (behavior && behavior.noHoursRequired) {
				// No work hours required (e.g., vacation, sick leave)
				return 0;
			}

			// For days that require hours (like kurs, studie),
			// apply regular workday goal or half-day goal
			if (holidayInfo.halfDay) {
				// Calculate half-day hours based on schedule settings
				const halfDayHours = this.settings.halfDayMode === 'percentage'
					? schedule.baseWorkday / 2
					: schedule.halfDayHours;
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

		// Calculate workday hours using the schedule's settings
		return schedule.baseWorkday * schedule.workPercent;
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
			const dayEntries = this.daily[day];

			// Calculate goal reduction from reduce_goal entries (sick days, etc.)
			let goalReduction = 0;
			dayEntries.forEach(e => {
				const behavior = this.getSpecialDayBehavior(e.name);
				if (behavior?.flextimeEffect === 'reduce_goal') {
					// If 0 duration (full-day entry), reduce by full daily goal
					const reduction = (e.duration && e.duration > 0) ? e.duration : dayGoal;
					goalReduction += reduction;
				}
			});
			const effectiveGoal = Math.max(0, dayGoal - goalReduction);

			// Calculate total work hours for the day (for proper flextime distribution)
			let totalWorkHours = 0;
			dayEntries.forEach(e => {
				const behavior = this.getSpecialDayBehavior(e.name);
				if (!behavior || behavior.isWorkType || behavior.flextimeEffect === 'accumulate') {
					totalWorkHours += e.duration || 0;
				}
			});

			dayEntries.forEach((e) => {
				let flextime = 0;
				const behavior = this.getSpecialDayBehavior(e.name);

				// Handle reduce_goal entries (sick days, velferdspermisjon)
				// These entries have no direct flextime effect - they just reduce the goal
				if (behavior?.flextimeEffect === 'reduce_goal') {
					e.flextime = 0;
					return;
				}

				// Determine which behavior to use:
				// 1. If entry has its own behavior (e.g., studie timer), use that
				// 2. Otherwise, if there's a holidayInfo, use the holiday's behavior
				// This ensures timer entries take priority over planned days
				const effectiveBehavior = behavior || (holidayInfo ? (
					holidayInfo.type === 'annet'
						? this.getAnnetBehavior(holidayInfo)
						: this.getSpecialDayBehavior(holidayInfo.type)
				) : null);

				// Work types (jobb) use regular flextime calculation, not special behavior
				const isWorkTypeEntry = effectiveBehavior?.isWorkType || (!behavior && !holidayInfo);

				if (effectiveBehavior && !isWorkTypeEntry) {
					if (effectiveBehavior.flextimeEffect === 'withdraw') {
						// Withdraws from flextime (e.g., avspasering)
						flextime -= e.duration || 0;
					} else if (effectiveBehavior.flextimeEffect === 'accumulate') {
						// Accumulate types (studie, kurs): only gain flextime for excess hours over goal
						if (effectiveGoal > 0 && (e.duration || 0) > effectiveGoal) {
							flextime += (e.duration || 0) - effectiveGoal;
						} else if (effectiveGoal === 0) {
							flextime += e.duration || 0;
						}
						// If hours <= goal, flextime stays 0 (no negative balance)
					} else if (effectiveBehavior.noHoursRequired && effectiveGoal === 0) {
						// 'none' effect on no-hours-required day: work counts as bonus (like weekends)
						flextime += e.duration || 0;
					}
					// 'none' effect on regular goal day means no special flextime handling
				} else if (effectiveGoal === 0) {
					// Weekend, no goal, or fully covered by sick time: all hours count as flextime bonus
					flextime += e.duration || 0;
				} else {
					// Regular workday with effective goal: calculate flextime difference
					// Distribute flextime proportionally if multiple work entries
					if (totalWorkHours !== effectiveGoal && effectiveGoal > 0 && totalWorkHours > 0) {
						const proportion = (e.duration || 0) / totalWorkHours;
						flextime += (totalWorkHours - effectiveGoal) * proportion;
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
		// Start with the configured starting balance (for users migrating from other systems)
		let balance = this.settings.startingFlextimeBalance || 0;
		const startDate = this.settings.balanceStartDate;

		const sortedDays = Object.keys(this.daily)
			.filter(day => day >= startDate && day <= endDate)
			.sort();

		for (const day of sortedDays) {
			const dayGoal = this.getDailyGoal(day);
			const dayEntries = this.daily[day] || [];

			let regularWorked = 0;  // Regular work hours (can be negative vs goal)
			let accumulateWorked = 0;  // Accumulate type hours (studie, kurs - only positive excess)
			let avspaseringHours = 0;
			let goalReduction = 0;  // Hours that reduce daily goal (sick days, etc.)
			let hasAccumulateEntry = false;  // Track if any accumulate entries exist
			let hasActiveEntry = false;  // Track if any active entries exist

			dayEntries.forEach(e => {
				// Track active entries but include their current duration in balance
				if (e.isActive) {
					hasActiveEntry = true;
					// Include active timer's current duration in regular work
					const behavior = this.getSpecialDayBehavior(e.name);
					if (!behavior || behavior.isWorkType) {
						regularWorked += e.duration || 0;
					} else if (behavior?.flextimeEffect === 'accumulate') {
						accumulateWorked += e.duration || 0;
						hasAccumulateEntry = true;
					}
					return;
				}

				// Check if this entry type should count toward flextime
				const behavior = this.getSpecialDayBehavior(e.name);

				// Handle different flextime effects
				if (behavior?.flextimeEffect === 'reduce_goal') {
					// Sick days, velferdspermisjon, etc. - reduce daily goal by their duration
					// If 0 duration (full-day entry), reduce by full daily goal
					const reduction = (e.duration && e.duration > 0) ? e.duration : dayGoal;
					goalReduction += reduction;
				} else if (behavior?.flextimeEffect === 'withdraw') {
					// Avspasering - subtract from balance
					avspaseringHours += e.duration || 0;
				} else if (behavior && (behavior.noHoursRequired || behavior.countsAsWorkday)) {
					// noHoursRequired types (ferie, helligdag, etc.) - any hours worked are bonus
					// Since goal is 0 for these days, hours count as extra flextime
					regularWorked += e.duration || 0;
				} else if (behavior?.flextimeEffect === 'accumulate' && !behavior.isWorkType) {
					// Accumulate types (studie, kurs) - only count hours over goal as positive
					accumulateWorked += e.duration || 0;
					hasAccumulateEntry = true;
				} else {
					// Regular work hours (jobb, etc.)
					regularWorked += e.duration || 0;
				}
			});

			// If there's an active timer, skip this day entirely - don't charge goal yet
			// (assume user intends to work the full goal)
			if (hasActiveEntry) continue;

			// Days with no entries will now be processed and charge the full goal
			// (regularWorked = 0, so balance += 0 - effectiveGoal = -goal)

			// Calculate effective goal after reductions (but not below 0)
			const effectiveGoal = Math.max(0, dayGoal - goalReduction);

			// Handle accumulate entries: only positive excess over goal counts
			if (hasAccumulateEntry && regularWorked === 0) {
				// Day only has accumulate entries (studie, kurs)
				if (effectiveGoal === 0) {
					// No goal day - all hours count as bonus
					balance += accumulateWorked;
				} else {
					// Only hours over goal count (never negative)
					const excess = accumulateWorked - effectiveGoal;
					if (excess > 0) {
						balance += excess;
					}
					// If <= goal, no contribution to balance (not negative)
				}
			} else {
				// Regular work or mixed entries
				const totalWorked = regularWorked + accumulateWorked;
				if (effectiveGoal === 0) {
					balance += totalWorked;
				} else {
					balance += (totalWorked - effectiveGoal);
				}
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

				const behavior = this.getSpecialDayBehavior(entry.name);
				// Exclude: withdraw (avspasering), reduce_goal (sick days), none with noHoursRequired (ferie)
				const shouldExclude = behavior && (
					behavior.flextimeEffect === 'withdraw' ||
					behavior.flextimeEffect === 'reduce_goal' ||
					(behavior.flextimeEffect === 'none' && behavior.noHoursRequired)
				);
				if (!shouldExclude) {
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
		// Also exclude non-work types (vacation, sick days, avspasering)
		return (
			todayEntries
				.filter(e => {
					if (e.isActive) return false;
					const behavior = this.getSpecialDayBehavior(e.name);
					// Include work types and accumulate types (kurs, studie)
					return !behavior || behavior.isWorkType || behavior.flextimeEffect === 'accumulate';
				})
				.reduce((sum, e) => sum + (e.duration || 0), 0) + this.getOngoing()
		);
	}

	getAverages(): AveragesData {
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

	getStatistics(timeframe: string = "total", year?: number, month?: number): TimeStatistics {
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

		const stats: TimeStatistics = {
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
			const dayDate = new Date(dayKey + 'T12:00:00');
			const dayEntries = this.daily[dayKey];

			uniqueDays.add(dayKey);

			// Check weekend/workday once per day (outside entry loop)
			const isWeekendDay = Utils.isWeekend(dayDate, this.settings);
			if (isWeekendDay) {
				weekendDaysSet.add(dayKey);
			} else {
				workDaysSet.add(dayKey);
			}

			dayEntries.forEach((e) => {
				const name = e.name.toLowerCase();
				const behavior = this.getSpecialDayBehavior(name);

				// Track weekend hours
				if (isWeekendDay) {
					stats.weekendHours += e.duration || 0;
				}

				// Track by specific type if it exists in daysByType
				if (daysByType[name]) {
					// For reduce_goal types (egenmelding, sykemelding), only count full-day entries (0 duration)
					// Partial sick days mean you went to work, so they shouldn't count as sick days
					const isReduceGoalType = behavior?.flextimeEffect === 'reduce_goal';
					const isFullDay = !e.duration || e.duration === 0;
					if (!isReduceGoalType || isFullDay) {
						daysByType[name].add(dayKey);
						// Only add hours to non-jobb types here (jobb hours are handled below)
						// Type-safe access using known keys
						const statKey = name as keyof typeof stats;
						const stat = stats[statKey];
						if (name !== 'jobb' && typeof stat === 'object' && stat !== null && 'hours' in stat) {
							stat.hours += e.duration || 0;
						}
					}
				}

				// Count toward jobb for work types, accumulate types (kurs/studie), and unknown types
				if (behavior?.isWorkType || behavior?.flextimeEffect === 'accumulate' || !behavior) {
					daysByType.jobb.add(dayKey);
					stats.jobb.hours += e.duration || 0;
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
		stats.sykemelding.count = daysByType.sykemelding.size;
		stats.studie.count = daysByType.studie.size;
		stats.kurs.count = daysByType.kurs.size;

		// Count planned future days
		Object.keys(this.holidays).forEach((dateStr) => {
			const plannedInfo = this.holidays[dateStr];
			const plannedDate = new Date(dateStr);

			if (filterFn(dateStr) && plannedDate > today) {
				const type = plannedInfo.type;
				if (type === 'ferie' && stats.ferie.planned !== undefined) {
					stats.ferie.planned++;
				} else if (type === 'avspasering' && stats.avspasering.planned !== undefined) {
					stats.avspasering.planned++;
				} else if (type === 'velferdspermisjon' && stats.velferdspermisjon.planned !== undefined) {
					stats.velferdspermisjon.planned++;
				} else if (type === 'studie' && stats.studie.planned !== undefined) {
					stats.studie.planned++;
				} else if (type === 'kurs' && stats.kurs.planned !== undefined) {
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
					// Use dynamic behavior for 'annet' entries
					const behavior = holidayInfo.type === 'annet'
						? this.getAnnetBehavior(holidayInfo)
						: this.getSpecialDayBehavior(holidayInfo.type);
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

	getContextualData(today: Date): ContextualData {
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
				// Filter using behavior properties - include work types and accumulate types
				// Exclude: withdraw (avspasering), reduce_goal (sick days), none (ferie)
				weekSum += dayEntries
					.filter(e => {
						const behavior = this.getSpecialDayBehavior(e.name);
						return !behavior || behavior.isWorkType || behavior.flextimeEffect === 'accumulate';
					})
					.reduce((s, e) => s + (e.duration || 0), 0);
			}
			weekTotals.push(weekSum);
		}
		return weekTotals;
	}

	validateData(): ValidationResults {
		const issues: ValidationIssues = {
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
					.filter((e): e is TimeEntry & { startTime: string; endTime: string } => Boolean(e.startTime && e.endTime))
					.sort((a, b) => {
						const aStart = new Date(a.startTime);
						const bStart = new Date(b.startTime);
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

				// Skip if it's a holiday that doesn't require work (ferie, egenmelding, etc.)
				if (holidayInfo) {
					// Use dynamic behavior for 'annet' entries
					const behavior = holidayInfo.type === 'annet'
						? this.getAnnetBehavior(holidayInfo)
						: this.getSpecialDayBehavior(holidayInfo.type);
					if (behavior?.noHoursRequired || behavior?.flextimeEffect === 'reduce_goal') {
						continue;
					}
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

		// Check for unknown entry types
		const knownTypes = new Set(this.settings.specialDayBehaviors.map(b => b.id.toLowerCase()));
		const unknownTypes = new Map<string, number>(); // type -> count

		for (const dayKey in this.daily) {
			this.daily[dayKey].forEach(entry => {
				if (entry.name) {
					const entryType = entry.name.toLowerCase();
					if (!knownTypes.has(entryType)) {
						unknownTypes.set(entry.name, (unknownTypes.get(entry.name) || 0) + 1);
					}
				}
			});
		}

		if (unknownTypes.size > 0) {
			const totalUnknown = Array.from(unknownTypes.values()).reduce((sum, count) => sum + count, 0);
			const typeNames = Array.from(unknownTypes.keys()).slice(0, 3).join(', ');
			const moreTypes = unknownTypes.size > 3 ? ` +${unknownTypes.size - 3}` : '';
			issues.info.push({
				severity: 'info',
				type: t('status.unknownEntryTypes').replace('{count}', String(totalUnknown)),
				description: `${typeNames}${moreTypes}`,
				date: todayStr
			});
		}

		// Check if balance start date is after first entry
		const allDatesForBalance = Object.keys(this.daily).sort();
		if (allDatesForBalance.length > 0 && this.settings.balanceStartDate) {
			const firstEntryDate = allDatesForBalance[0];
			if (this.settings.balanceStartDate > firstEntryDate) {
				issues.info.push({
					severity: 'info',
					type: t('status.balanceStartAfterFirst').replace('{date}', this.settings.balanceStartDate),
					description: `${firstEntryDate}`,
					date: this.settings.balanceStartDate
				});
			}
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

		// For reduce_goal types (egenmelding, sykemelding, etc.), only count full days from holidays.md
		// Partial sick days in data.md should NOT count towards the limit
		const isReduceGoalType = behavior?.flextimeEffect === 'reduce_goal';

		let count = 0;
		const daysSeen = new Set<string>();

		if (useRolling) {
			// Count days in the last 365 days
			const cutoffDate = new Date(today);
			cutoffDate.setDate(cutoffDate.getDate() - 365);
			const cutoffStr = Utils.toLocalDateStr(cutoffDate);

			// Count from data.md entries
			// For reduce_goal types, only count full-day entries (0 duration)
			Object.keys(this.daily).forEach(dateStr => {
				if (dateStr >= cutoffStr && dateStr <= Utils.toLocalDateStr(today)) {
					const entries = this.daily[dateStr];
					entries.forEach(entry => {
						if (entry.name.toLowerCase() === typeId && !daysSeen.has(dateStr)) {
							// For reduce_goal types, only count if it's a full day (0 duration)
							if (isReduceGoalType && entry.duration && entry.duration > 0) {
								return; // Skip partial sick days
							}
							daysSeen.add(dateStr);
							count++;
						}
					});
				}
			});

			// Count from holidays file (full days)
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
			// For reduce_goal types, only count full-day entries (0 duration)
			Object.keys(this.daily).forEach(dateStr => {
				const date = new Date(dateStr);
				if (date.getFullYear() === targetYear) {
					const entries = this.daily[dateStr];
					entries.forEach(entry => {
						if (entry.name.toLowerCase() === typeId && !daysSeen.has(dateStr)) {
							// For reduce_goal types, only count if it's a full day (0 duration)
							if (isReduceGoalType && entry.duration && entry.duration > 0) {
								return; // Skip partial sick days
							}
							daysSeen.add(dateStr);
							count++;
						}
					});
				}
			});

			// Count from holidays file (full days)
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

	/**
	 * Get total hours for a specific week (Monday to Sunday)
	 */
	getWeekHours(weekStart: Date): number {
		let total = 0;
		for (let i = 0; i < 7; i++) {
			const d = new Date(weekStart);
			d.setDate(weekStart.getDate() + i);
			const dayKey = Utils.toLocalDateStr(d);
			const dayEntries = this.daily[dayKey] || [];
			dayEntries.forEach(entry => {
				if (!entry.isActive) {
					const behavior = this.getSpecialDayBehavior(entry.name);
					const shouldExclude = behavior && (
						behavior.flextimeEffect === 'withdraw' ||
						behavior.flextimeEffect === 'reduce_goal' ||
						(behavior.flextimeEffect === 'none' && behavior.noHoursRequired)
					);
					if (!shouldExclude) {
						total += entry.duration || 0;
					}
				}
			});
		}
		return total;
	}

	/**
	 * Get week hours with special day breakdown for bar chart visualization
	 */
	getWeekHoursWithBreakdown(weekStart: Date): { workHours: number; specialDays: SpecialDayHours[] } {
		let workHours = 0;
		const specialDayMap: Record<string, number> = {};

		for (let i = 0; i < 7; i++) {
			const d = new Date(weekStart);
			d.setDate(weekStart.getDate() + i);
			const dayKey = Utils.toLocalDateStr(d);
			const dayEntries = this.daily[dayKey] || [];

			dayEntries.forEach(entry => {
				if (!entry.isActive) {
					const behavior = this.getSpecialDayBehavior(entry.name);
					const entryHours = entry.duration || 0;

					if (behavior?.flextimeEffect === 'reduce_goal' || behavior?.noHoursRequired) {
						// Special day - track separately
						const typeId = entry.name.toLowerCase();
						specialDayMap[typeId] = (specialDayMap[typeId] || 0) + entryHours;
					} else if (behavior?.flextimeEffect !== 'withdraw') {
						// Regular work hours
						workHours += entryHours;
					}
				}
			});
		}

		// Convert map to array with colors
		const specialDays: SpecialDayHours[] = Object.entries(specialDayMap)
			.filter(([, hours]) => hours > 0)
			.map(([type, hours]) => {
				const behavior = this.getSpecialDayBehavior(type);
				return {
					type,
					hours,
					color: behavior?.color || '#e0e0e0'
				};
			});

		return { workHours, specialDays };
	}

	/**
	 * Get month hours with special day breakdown for bar chart visualization
	 */
	getMonthHoursWithBreakdown(year: number, month: number): { workHours: number; specialDays: SpecialDayHours[] } {
		let workHours = 0;
		const specialDayMap: Record<string, number> = {};
		const daysInMonth = new Date(year, month + 1, 0).getDate();

		for (let day = 1; day <= daysInMonth; day++) {
			const d = new Date(year, month, day);
			const dayKey = Utils.toLocalDateStr(d);
			const dayEntries = this.daily[dayKey] || [];

			dayEntries.forEach(entry => {
				if (!entry.isActive) {
					const behavior = this.getSpecialDayBehavior(entry.name);
					const entryHours = entry.duration || 0;

					if (behavior?.flextimeEffect === 'reduce_goal' || behavior?.noHoursRequired) {
						// Special day - track separately
						const typeId = entry.name.toLowerCase();
						specialDayMap[typeId] = (specialDayMap[typeId] || 0) + entryHours;
					} else if (behavior?.flextimeEffect !== 'withdraw') {
						// Regular work hours
						workHours += entryHours;
					}
				}
			});
		}

		// Convert map to array with colors
		const specialDays: SpecialDayHours[] = Object.entries(specialDayMap)
			.filter(([, hours]) => hours > 0)
			.map(([type, hours]) => {
				const behavior = this.getSpecialDayBehavior(type);
				return {
					type,
					hours,
					color: behavior?.color || '#e0e0e0'
				};
			});

		return { workHours, specialDays };
	}

	/**
	 * Get total hours for a specific month
	 */
	getMonthHours(year: number, month: number): number {
		let total = 0;
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		for (let day = 1; day <= daysInMonth; day++) {
			const d = new Date(year, month, day);
			const dayKey = Utils.toLocalDateStr(d);
			const dayEntries = this.daily[dayKey] || [];
			dayEntries.forEach(entry => {
				if (!entry.isActive) {
					const behavior = this.getSpecialDayBehavior(entry.name);
					const shouldExclude = behavior && (
						behavior.flextimeEffect === 'withdraw' ||
						behavior.flextimeEffect === 'reduce_goal' ||
						(behavior.flextimeEffect === 'none' && behavior.noHoursRequired)
					);
					if (!shouldExclude) {
						total += entry.duration || 0;
					}
				}
			});
		}
		return total;
	}

	/**
	 * Get total hours for a specific year
	 */
	getYearHours(year: number): number {
		let total = 0;
		for (let month = 0; month < 12; month++) {
			total += this.getMonthHours(year, month);
		}
		return total;
	}

	/**
	 * Get historical hours data for bar chart
	 * Returns array of { label, hours, target?, specialDays? }
	 */
	getHistoricalHoursData(timeframe: 'month' | 'year' | 'total', selectedYear?: number, selectedMonth?: number): BarChartData[] {
		const data: BarChartData[] = [];
		const today = new Date();
		const weeklyTarget = this.workweekHours;

		if (timeframe === 'month') {
			// Last 6 weeks
			const currentWeekStart = this.getWeekStart(today);
			const weekPrefix = t('stats.weekPrefix') || 'U';
			for (let i = 5; i >= 0; i--) {
				const weekStart = new Date(currentWeekStart);
				weekStart.setDate(currentWeekStart.getDate() - (i * 7));
				const weekNum = this.getISOWeekNumber(weekStart);
				const breakdown = this.getWeekHoursWithBreakdown(weekStart);
				data.push({
					label: `${weekPrefix}${weekNum}`,
					hours: breakdown.workHours,
					target: weeklyTarget,
					specialDays: breakdown.specialDays
				});
			}
		} else if (timeframe === 'year') {
			// All 12 months for selected year
			const year = selectedYear || today.getFullYear();
			const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
			const monthlyTarget = weeklyTarget * 4.33; // Approximate weeks per month
			for (let month = 0; month < 12; month++) {
				const breakdown = this.getMonthHoursWithBreakdown(year, month);
				data.push({
					label: monthNames[month],
					hours: breakdown.workHours,
					target: monthlyTarget,
					specialDays: breakdown.specialDays
				});
			}
		} else {
			// Total: Last 6 years (no special day breakdown for yearly view)
			const currentYear = today.getFullYear();
			for (let i = 5; i >= 0; i--) {
				const year = currentYear - i;
				const hours = this.getYearHours(year);
				data.push({
					label: year.toString(),
					hours
				});
			}
		}

		return data;
	}

	/**
	 * Get the Monday of the week containing the given date
	 */
	private getWeekStart(date: Date): Date {
		const d = new Date(date);
		const dayOfWeek = d.getDay();
		const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
		d.setDate(d.getDate() - daysFromMonday);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	/**
	 * Get ISO week number for a date
	 */
	private getISOWeekNumber(date: Date): number {
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNum = d.getUTCDay() || 7;
		d.setUTCDate(d.getUTCDate() + 4 - dayNum);
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
	}
}
