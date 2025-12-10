// Utility functions for timeflow plugin
import { TimeFlowSettings } from './settings';

// Constant colors for holidays (not configurable)
export const FIXED_DAY_COLORS: Record<string, string> = {
	helligdag: "#ef5350",
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
	parseDate: (str: string | null): Date | null => (str ? new Date(str) : null),

	hoursDiff: (start: Date, end: Date): number => (end.getTime() - start.getTime()) / 3600000,

	isWeekend: (date: Date | null, settings?: TimeFlowSettings): boolean => {
		if (!date) return false;
		const day = date.getDay();

		// If no settings provided, use default behavior (Saturday = 6, Sunday = 0)
		if (!settings) return day === 0 || day === 6;

		// If alternating weeks enabled, determine which week we're in
		if (settings.enableAlternatingWeeks) {
			// Use ISO 8601 week number for consistent alternating week calculation
			const weekNum = Utils.getWeekNumber(date);
			const isAlternatingWeek = weekNum % 2 === 0;

			const workDays = isAlternatingWeek ? settings.alternatingWeekWorkDays : settings.workDays;
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
