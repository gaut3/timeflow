// MessageGenerator - Simplified (motivational messages removed)
// Returns empty strings - messages feature has been disabled

export class MessageGenerator {
	static getDailyMessage(
		hours: number,
		goal: number,
		specials: string[],
		isWeekendDay: boolean,
		avgDaily: number,
		context: any,
		consecutiveFlextimeWarningDays: number
	): string {
		return '';
	}

	static getWeeklyMessage(
		hours: number,
		goal: number,
		specials: string[],
		today: Date,
		context: any,
		weekendWorkHours: number = 0
	): string {
		return '';
	}
}
