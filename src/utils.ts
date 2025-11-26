// Utility functions for TimeFlow plugin
import { TimeFlowSettings } from './settings';

// Constant colors for holidays (not configurable)
export const FIXED_DAY_COLORS: Record<string, string> = {
	helligdag: "#ef5350",
	halfday: "#ffd54f",
	"Ingen registrering": "#cccccc",
};

// Function to get special day colors from settings
export function getSpecialDayColors(settings: TimeFlowSettings): Record<string, string> {
	return {
		...FIXED_DAY_COLORS,
		...settings.specialDayColors
	};
}

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
		// Check if Saturday or Sunday should be considered weekend based on settings
		const isSaturday = day === 6 && !settings.includeSaturdayInWorkWeek;
		const isSunday = day === 0 && !settings.includeSundayInWorkWeek;
		return isSaturday || isSunday;
	},

	formatHoursToHM: (hours: number, unit: 'h' | 't' = 'h'): string => {
		const h = Math.floor(hours);
		const m = Math.round((hours - h) * 60);
		return `${h}${unit} ${m.toString().padStart(2, "0")}m`;
	},

	toLocalDateStr: (date: Date): string => {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, "0");
		const d = String(date.getDate()).padStart(2, "0");
		return `${y}-${m}-${d}`;
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

	getEmoji: (entry: any): string => {
		const name = entry.name.toLowerCase();
		if (EMOJI_MAP[name]) return EMOJI_MAP[name];
		if (!entry.endTime) return "⏳";
		if (Utils.isWeekend(entry.date)) return "🌙";
		return "";
	},

	randMsg: (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)],

	getDayOfYear: (date: Date): number => {
		const start = new Date(date.getFullYear(), 0, 0);
		const diff = date.getTime() - start.getTime();
		return Math.floor(diff / 86400000);
	},
};
