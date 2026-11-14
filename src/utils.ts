// Utility functions for timeflow plugin
import { TimeFlowSettings } from './settings';

// Constant colors for holidays (not configurable)
export const FIXED_DAY_COLORS: Record<string, string> = {
	helligdag: "#a05040",
	halfday: "#ffd54f",
	"Ingen registrering": "#cccccc",
};

// Constant text colors for holidays (not configurable)
export const FIXED_DAY_TEXT_COLORS: Record<string, string> = {
	helligdag: "#ffffff",
	halfday: "#000000",
	"Ingen registrering": "#000000",
};

// Function to get special day colors from settings
export function getSpecialDayColors(settings: TimeFlowSettings): Record<string, string> {
	const colors: Record<string, string> = { ...FIXED_DAY_COLORS };

	// Fallback to old specialDayColors if it exists (for migration compatibility)
	// Apply these first so they can be overridden by specialDayBehaviors
	if (settings.specialDayColors) {
		Object.assign(colors, settings.specialDayColors);
	}

	// Build color map from special day behaviors (takes priority)
	settings.specialDayBehaviors.forEach(behavior => {
		colors[behavior.id] = behavior.color;
	});

	return colors;
}

// Function to get special day text colors from settings
export function getSpecialDayTextColors(settings: TimeFlowSettings): Record<string, string> {
	const colors: Record<string, string> = { ...FIXED_DAY_TEXT_COLORS };

	// Build text color map from special day behaviors
	settings.specialDayBehaviors.forEach(behavior => {
		colors[behavior.id] = behavior.textColor || '#000000';
	});

	return colors;
}

// Function to build emoji map from settings
export function getEmojiMap(settings: TimeFlowSettings): Record<string, string> {
	const emojiMap: Record<string, string> = {};

	// Build emoji map from special day behaviors (includes jobb)
	settings.specialDayBehaviors.forEach(behavior => {
		emojiMap[behavior.id] = behavior.icon;
	});

	return emojiMap;
}

// Legacy EMOJI_MAP for backward compatibility (deprecated)
export const EMOJI_MAP: Record<string, string> = {
	avspasering: "🛌",
	kurs: "📚",
	studie: "📚",
	ferie: "🏖️",
	velferdspermisjon: "🏥",
	egenmelding: "🤒",
	sykemelding: "🏥",
	helligdag: "🎉",
	jobb: "💼",
};

export const Utils = {
	// Date-only strings ("YYYY-MM-DD") are parsed as UTC midnight by new Date(),
	// which is the PREVIOUS local day in timezones west of UTC. Parse them as
	// local noon instead (noon is immune to DST edges). Full datetimes pass through.
	parseDate: (str: string | null): Date | null => {
		if (!str) return null;
		if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + 'T12:00:00');
		return new Date(str);
	},

	// Parse a numeric input tolerating the Norwegian decimal comma ("37,5" → 37.5).
	// parseFloat stops at the comma, silently truncating to 37.
	parseNum: (value: string): number => parseFloat(value.replace(',', '.')),

	hoursDiff: (start: Date, end: Date): number => (end.getTime() - start.getTime()) / 3600000,

	// Absence types whose time range matters: credited (reduce_goal) or withdrawn (withdraw)
	isTimedAbsenceType: (settings: TimeFlowSettings, name: string): boolean => {
		const id = name.toLowerCase();
		const effect = settings.specialDayBehaviors?.find(b => b.id.toLowerCase() === id)?.flextimeEffect;
		return effect === 'reduce_goal' || effect === 'withdraw';
	},

	// Whether an 'annet' template is configured as unpaid (case-insensitive id match)
	isUnpaidAnnetTemplate: (settings: TimeFlowSettings, templateId?: string): boolean => {
		if (!templateId) return false;
		const id = templateId.toLowerCase();
		return !!settings.annetTemplates?.find(tmpl => tmpl.id.toLowerCase() === id)?.unpaid;
	},

	// Compare two stored timestamps by instant, tolerating mixed formats
	// (local ISO without Z vs UTC with Z vs missing)
	sameTimestamp: (a: string | null | undefined, b: string | null | undefined): boolean => {
		if (!a || !b) return !a === !b;
		if (a === b) return true;
		const ta = new Date(a).getTime();
		const tb = new Date(b).getTime();
		return !isNaN(ta) && ta === tb;
	},

	isWeekend: (date: Date | null, settings?: TimeFlowSettings): boolean => {
		if (!date) return false;
		const day = date.getDay();

		// If no settings provided, use default behavior (Saturday = 6, Sunday = 0)
		if (!settings) return day === 0 || day === 6;

		// If alternating weeks enabled, determine which week we're in
		if (settings.enableAlternatingWeeks) {
			const workDays = Utils.isAlternatingWeek(date) ? settings.alternatingWeekWorkDays : settings.workDays;
			return !workDays.includes(day);
		}

		// Check if day is in the workDays array
		return !settings.workDays.includes(day);
	},

	formatHoursToHM: (hours: number, unit: 'h' | 't' = 'h'): string => {
		const isNegative = hours < 0;
		const absHours = Math.abs(hours);
		let h = Math.floor(absHours);
		let m = Math.round((absHours - h) * 60);
		// Handle rounding to 60 minutes
		if (m === 60) {
			h++;
			m = 0;
		}
		return `${isNegative ? '-' : ''}${h}${unit} ${m.toString().padStart(2, "0")}m`;
	},

	// Decimal hours with two decimals ("9.25"), from the same rounded minutes
	// formatHoursToHM shows, so "8h 14m" always pairs with "8.23". Negative
	// values keep their "-"; signed adds "+" to positive values. Zero is "0.00".
	formatDecimalHours: (hours: number, signed = false): string => {
		const minutes = Math.round(Math.abs(hours) * 60);
		const value = (minutes / 60).toFixed(2);
		if (minutes === 0) return value;
		if (hours < 0) return `-${value}`;
		return signed ? `+${value}` : value;
	},

	toLocalDateStr: (date: Date): string => {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, "0");
		const d = String(date.getDate()).padStart(2, "0");
		return `${y}-${m}-${d}`;
	},

	// Create ISO string without Z suffix (interpreted as local time)
	toLocalISOString: (date: Date): string => {
		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
	},

	// Continuous week parity for alternating-week schedules. ISO week number
	// parity (weekNum % 2) breaks in 53-week ISO years (week 53 → week 1 are both
	// odd, repeating the same week type). Instead count whole weeks from a fixed
	// Monday epoch. Epoch/parity chosen so even-ISO-week = alternating is
	// preserved for the current era (2024–2026).
	isAlternatingWeek: (date: Date): boolean => {
		const monday = new Date(date);
		monday.setHours(12, 0, 0, 0);
		monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
		const epoch = new Date(2024, 0, 1, 12); // Monday, ISO week 1 of 2024
		// Math.round tolerates the ±1h DST drift between local-noon dates
		const weekIndex = Math.round((monday.getTime() - epoch.getTime()) / (7 * 86400000));
		return ((weekIndex % 2) + 2) % 2 === 1;
	},

	getWeekNumber: (d: Date): number => {
		const date = new Date(d.getTime());
		date.setHours(0, 0, 0, 0);
		date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
		const week1 = new Date(date.getFullYear(), 0, 4);
		return (
			1 +
			Math.round(
				((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
			)
		);
	},

	getEmoji: (entry: { name: string; endTime?: string | null; date?: Date }): string => {
		const name = entry.name.toLowerCase();
		if (EMOJI_MAP[name]) return EMOJI_MAP[name];
		if (!entry.endTime) return "⏳";
		if (entry.date && Utils.isWeekend(entry.date)) return "🌙";
		return "";
	},

	randMsg: (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)],

	getDayOfYear: (date: Date): number => {
		const start = new Date(date.getFullYear(), 0, 0);
		const diff = date.getTime() - start.getTime();
		return Math.floor(diff / 86400000);
	},
};
