import { Timer } from './timerManager';
import { t } from './i18n';

export interface ParseResult {
	success: boolean;
	entries: Timer[];
	errors: string[];
	warnings: string[];
}

export interface ImportParser {
	name: string;
	canParse(content: string): boolean;
	parse(content: string): ParseResult;
}

/**
 * Timekeep JSON Parser
 * Expects format: {"entries": [...]}
 */
export class TimekeepParser implements ImportParser {
	name = 'Timekeep JSON';

	canParse(content: string): boolean {
		try {
			const trimmed = content.trim();
			if (!trimmed.startsWith('{')) return false;
			const data = JSON.parse(trimmed);
			return data.entries && Array.isArray(data.entries);
		} catch {
			return false;
		}
	}

	parse(content: string): ParseResult {
		const result: ParseResult = {
			success: false,
			entries: [],
			errors: [],
			warnings: []
		};

		try {
			const data = JSON.parse(content.trim());

			if (!data.entries || !Array.isArray(data.entries)) {
				result.errors.push(`${t('import.errors.invalidFormat')}: ${t('import.errors.missingEntries')}`);
				return result;
			}

			for (let i = 0; i < data.entries.length; i++) {
				const entry = data.entries[i];

				if (!entry.name || !entry.startTime) {
					result.warnings.push(`${t('import.errors.entry')} ${i + 1}: ${t('import.errors.missingFields')} (name, startTime)`);
					continue;
				}

				// Validate timestamps
				const startDate = new Date(entry.startTime);
				if (isNaN(startDate.getTime())) {
					result.warnings.push(`${t('import.errors.entry')} ${i + 1}: ${t('import.errors.invalidStartTime')}`);
					continue;
				}

				if (entry.endTime) {
					const endDate = new Date(entry.endTime);
					if (isNaN(endDate.getTime())) {
						result.warnings.push(`${t('import.errors.entry')} ${i + 1}: ${t('import.errors.invalidEndTime')}`);
						continue;
					}
				}

				result.entries.push({
					name: entry.name,
					startTime: entry.startTime,
					endTime: entry.endTime || null,
					collapsed: entry.collapsed ?? false,
					subEntries: entry.subEntries || null
				});
			}

			result.success = result.entries.length > 0;
		} catch (error: any) {
			result.errors.push(`${t('import.errors.jsonError')}: ${error.message}`);
		}

		return result;
	}
}

/**
 * CSV Parser
 * Supports Norwegian (DD.MM.YYYY) and ISO (YYYY-MM-DD) date formats
 * Auto-detects delimiter (comma, semicolon, tab)
 */
export class CSVParser implements ImportParser {
	name = 'CSV';

	canParse(content: string): boolean {
		const lines = content.trim().split('\n');
		if (lines.length < 2) return false;

		// Check if first line looks like a header
		const firstLine = lines[0].toLowerCase();
		const hasDateColumn = firstLine.includes('dato') || firstLine.includes('date');
		const hasTimeColumn = firstLine.includes('start') || firstLine.includes('time') || firstLine.includes('tid');

		return hasDateColumn || hasTimeColumn;
	}

	parse(content: string): ParseResult {
		const result: ParseResult = {
			success: false,
			entries: [],
			errors: [],
			warnings: []
		};

		try {
			const lines = content.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);

			if (lines.length < 2) {
				result.errors.push(t('import.errors.csvNeedsHeader'));
				return result;
			}

			// Detect delimiter
			const delimiter = this.detectDelimiter(lines[0]);

			// Parse header
			const headers = this.parseCSVLine(lines[0], delimiter).map(h => h.toLowerCase().trim());

			// Find column indices
			const dateCol = this.findColumn(headers, ['dato', 'date', 'dag', 'day']);
			const startCol = this.findColumn(headers, ['start', 'starttid', 'start time', 'fra', 'from']);
			const endCol = this.findColumn(headers, ['slutt', 'end', 'sluttid', 'end time', 'til', 'to']);
			const activityCol = this.findColumn(headers, ['aktivitet', 'activity', 'type', 'navn', 'name', 'beskrivelse', 'description']);

			if (dateCol === -1) {
				result.errors.push(t('import.errors.couldNotFindDateColumn'));
				return result;
			}

			if (startCol === -1) {
				result.errors.push(t('import.errors.couldNotFindStartColumn'));
				return result;
			}

			// Parse data rows
			for (let i = 1; i < lines.length; i++) {
				const values = this.parseCSVLine(lines[i], delimiter);

				if (values.length <= Math.max(dateCol, startCol)) {
					result.warnings.push(`${t('import.errors.row')} ${i + 1}: ${t('import.errors.tooFewColumns')}`);
					continue;
				}

				const dateStr = values[dateCol]?.trim();
				const startStr = values[startCol]?.trim();
				const endStr = endCol !== -1 ? values[endCol]?.trim() : '';
				const activity = activityCol !== -1 ? values[activityCol]?.trim() : 'jobb';

				if (!dateStr || !startStr) {
					result.warnings.push(`${t('import.errors.row')} ${i + 1}: ${t('import.errors.missingDateOrTime')}`);
					continue;
				}

				// Parse date (Norwegian DD.MM.YYYY or ISO YYYY-MM-DD)
				const parsedDate = this.parseDate(dateStr);
				if (!parsedDate) {
					result.warnings.push(`${t('import.errors.row')} ${i + 1}: ${t('import.errors.invalidDateFormat')} "${dateStr}"`);
					continue;
				}

				// Parse start time
				const startTime = this.parseTime(startStr);
				if (!startTime) {
					result.warnings.push(`${t('import.errors.row')} ${i + 1}: ${t('import.errors.invalidTimeFormat')} "${startStr}"`);
					continue;
				}

				// Create start datetime
				const startDateTime = new Date(parsedDate);
				startDateTime.setHours(startTime.hours, startTime.minutes, 0, 0);

				// Parse end time if present
				let endDateTime: Date | null = null;
				if (endStr) {
					const endTime = this.parseTime(endStr);
					if (endTime) {
						endDateTime = new Date(parsedDate);
						endDateTime.setHours(endTime.hours, endTime.minutes, 0, 0);

						// Handle overnight shifts
						if (endDateTime <= startDateTime) {
							endDateTime.setDate(endDateTime.getDate() + 1);
						}
					} else {
						result.warnings.push(`${t('import.errors.row')} ${i + 1}: ${t('import.errors.invalidTimeFormat')} "${endStr}"`);
					}
				}

				result.entries.push({
					name: activity.toLowerCase() || 'jobb',
					startTime: startDateTime.toISOString(),
					endTime: endDateTime ? endDateTime.toISOString() : null,
					collapsed: false,
					subEntries: null
				});
			}

			result.success = result.entries.length > 0;
		} catch (error: any) {
			result.errors.push(`CSV ${t('import.errors_label')}: ${error.message}`);
		}

		return result;
	}

	private detectDelimiter(line: string): string {
		const semicolonCount = (line.match(/;/g) || []).length;
		const commaCount = (line.match(/,/g) || []).length;
		const tabCount = (line.match(/\t/g) || []).length;

		if (semicolonCount >= commaCount && semicolonCount >= tabCount) return ';';
		if (tabCount >= commaCount) return '\t';
		return ',';
	}

	private parseCSVLine(line: string, delimiter: string): string[] {
		const result: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];

			if (char === '"') {
				inQuotes = !inQuotes;
			} else if (char === delimiter && !inQuotes) {
				result.push(current.trim());
				current = '';
			} else {
				current += char;
			}
		}
		result.push(current.trim());

		return result;
	}

	private findColumn(headers: string[], possibleNames: string[]): number {
		for (const name of possibleNames) {
			const index = headers.findIndex(h => h.includes(name));
			if (index !== -1) return index;
		}
		return -1;
	}

	private parseDate(dateStr: string): Date | null {
		// Try Norwegian format (DD.MM.YYYY)
		const norwegianMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
		if (norwegianMatch) {
			const [, day, month, year] = norwegianMatch;
			const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
			if (!isNaN(date.getTime())) return date;
		}

		// Try ISO format (YYYY-MM-DD)
		const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
		if (isoMatch) {
			const [, year, month, day] = isoMatch;
			const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
			if (!isNaN(date.getTime())) return date;
		}

		// Try DD/MM/YYYY format
		const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
		if (slashMatch) {
			const [, day, month, year] = slashMatch;
			const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
			if (!isNaN(date.getTime())) return date;
		}

		return null;
	}

	private parseTime(timeStr: string): { hours: number; minutes: number } | null {
		// Try HH:MM or H:MM
		const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
		if (match) {
			const hours = parseInt(match[1]);
			const minutes = parseInt(match[2]);
			if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
				return { hours, minutes };
			}
		}

		// Try HH.MM (Norwegian decimal time notation)
		const dotMatch = timeStr.match(/^(\d{1,2})\.(\d{2})$/);
		if (dotMatch) {
			const hours = parseInt(dotMatch[1]);
			const minutes = parseInt(dotMatch[2]);
			if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
				return { hours, minutes };
			}
		}

		return null;
	}
}

/**
 * Generic JSON Array Parser
 * Expects format: [{"date": "...", "start": "...", ...}, ...]
 */
export class GenericJSONParser implements ImportParser {
	name = 'JSON Array';

	canParse(content: string): boolean {
		try {
			const trimmed = content.trim();
			if (!trimmed.startsWith('[')) return false;
			const data = JSON.parse(trimmed);
			return Array.isArray(data) && data.length > 0;
		} catch {
			return false;
		}
	}

	parse(content: string): ParseResult {
		const result: ParseResult = {
			success: false,
			entries: [],
			errors: [],
			warnings: []
		};

		try {
			const data = JSON.parse(content.trim());

			if (!Array.isArray(data)) {
				result.errors.push(t('import.errors.expectedJsonArray'));
				return result;
			}

			for (let i = 0; i < data.length; i++) {
				const item = data[i];

				// Try to find date/time fields with various names
				const dateField = item.date || item.dato || item.day || item.dag;
				const startField = item.start || item.startTime || item.starttid || item.fra || item.from;
				const endField = item.end || item.endTime || item.slutt || item.sluttid || item.til || item.to;
				const nameField = item.name || item.navn || item.activity || item.aktivitet || item.type || 'jobb';

				if (!dateField && !startField) {
					// If no separate date/start, check for combined datetime
					if (item.startTime && item.startTime.includes('T')) {
						// ISO datetime format
						const startDate = new Date(item.startTime);
						if (!isNaN(startDate.getTime())) {
							result.entries.push({
								name: (nameField || 'jobb').toLowerCase(),
								startTime: item.startTime,
								endTime: item.endTime || null,
								collapsed: false,
								subEntries: null
							});
							continue;
						}
					}
					result.warnings.push(`${t('import.errors.entry')} ${i + 1}: ${t('import.errors.missingDateOrTime')}`);
					continue;
				}

				// Parse combined datetime from date + time
				let startDateTime: Date | null = null;
				let endDateTime: Date | null = null;

				if (dateField && startField) {
					startDateTime = this.combineDateAndTime(dateField, startField);
					if (endField) {
						endDateTime = this.combineDateAndTime(dateField, endField);
						// Handle overnight shifts
						if (endDateTime && startDateTime && endDateTime <= startDateTime) {
							endDateTime.setDate(endDateTime.getDate() + 1);
						}
					}
				}

				if (!startDateTime) {
					result.warnings.push(`${t('import.errors.entry')} ${i + 1}: ${t('import.errors.couldNotParseDateTime')}`);
					continue;
				}

				result.entries.push({
					name: (nameField || 'jobb').toLowerCase(),
					startTime: startDateTime.toISOString(),
					endTime: endDateTime ? endDateTime.toISOString() : null,
					collapsed: false,
					subEntries: null
				});
			}

			result.success = result.entries.length > 0;
		} catch (error: any) {
			result.errors.push(`${t('import.errors.jsonError')}: ${error.message}`);
		}

		return result;
	}

	private combineDateAndTime(dateStr: string, timeStr: string): Date | null {
		// Parse date
		let date: Date | null = null;

		// Try ISO format
		if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
			date = new Date(dateStr + 'T00:00:00');
		}
		// Try Norwegian format
		else if (dateStr.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
			const [day, month, year] = dateStr.split('.').map(Number);
			date = new Date(year, month - 1, day);
		}

		if (!date || isNaN(date.getTime())) return null;

		// Parse time
		const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
		if (timeMatch) {
			date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
			return date;
		}

		return null;
	}
}

/**
 * Auto-detect parser and parse content
 */
export function autoDetectAndParse(content: string): ParseResult & { format: string } {
	const parsers: ImportParser[] = [
		new TimekeepParser(),
		new CSVParser(),
		new GenericJSONParser()
	];

	for (const parser of parsers) {
		if (parser.canParse(content)) {
			const result = parser.parse(content);
			return { ...result, format: parser.name };
		}
	}

	return {
		success: false,
		entries: [],
		errors: [t('import.errors.unknownFormat')],
		warnings: [],
		format: '?'
	};
}
