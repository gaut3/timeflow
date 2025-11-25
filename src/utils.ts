// Utility functions for TimeFlow plugin

export const SPECIAL_DAY_COLORS: Record<string, string> = {
	avspasering: "#ffe0b2",
	ferie: "#b3e5fc",
	velferdspermisjon: "#e1bee7",
	egenmelding: "#c8e6c9",
	kurs: "#f8bbd0",
	studie: "#f8bbd0",
	helligdag: "#ef5350",
	half: "#ffd54f",
	halfday: "#ffd54f",
	"Ingen registrering": "#cccccc",
};

export const EMOJI_MAP: Record<string, string> = {
	avspasering: "🛌",
	kurs: "📚",
	studie: "📚",
	ferie: "🏖️",
	velferdspermisjon: "🏥",
	egenmelding: "🤒",
	helligdag: "🎉",
	jobb: "💼",
};

export const Utils = {
	parseDate: (str: string | null): Date | null => (str ? new Date(str) : null),

	hoursDiff: (start: Date, end: Date): number => (end.getTime() - start.getTime()) / 3600000,

	isWeekend: (date: Date | null): boolean =>
		date ? (date.getDay() === 0 || date.getDay() === 6) : false,

	formatHoursToHM: (hours: number): string => {
		const h = Math.floor(hours);
		const m = Math.round((hours - h) * 60);
		return `${h}h ${m.toString().padStart(2, "0")}m`;
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
