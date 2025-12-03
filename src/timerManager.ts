import { App, TFile, Notice } from 'obsidian';
import { TimeFlowSettings } from './settings';
import { Utils } from './utils';

// Timekeep-compatible format
export interface Timer {
	name: string;
	startTime: string | null;
	endTime: string | null;
	collapsed?: boolean;
	subEntries: Timer[] | null;
}

export interface TimekeepData {
	entries: Timer[];
	settings?: Partial<TimeFlowSettings>;
}

export class TimerManager {
	app: App;
	settings: TimeFlowSettings;
	data: TimekeepData;
	dataFile: string; // Main data file - uses settings.dataFilePath
	onTimerChange?: () => void;
	private isSaving = false;
	private lastSaveTime = 0;

	constructor(app: App, settings: TimeFlowSettings) {
		this.app = app;
		this.settings = settings;
		this.dataFile = settings.dataFilePath;
		this.data = { entries: [] };
	}

	/**
	 * Check if we should reload data from file.
	 * Returns false if we're currently saving or just saved (within 500ms)
	 * to prevent race conditions with the file watcher.
	 */
	shouldReloadFromFile(): boolean {
		if (this.isSaving) return false;
		if (Date.now() - this.lastSaveTime < 500) return false;
		return true;
	}

	async load(): Promise<TimeFlowSettings | null> {
		try {
			// Check if file exists using the adapter
			const fileExists = await this.app.vault.adapter.exists(this.dataFile);

			if (fileExists) {
				// Read directly using adapter (works even if vault cache isn't ready)
				const content = await this.app.vault.adapter.read(this.dataFile);
				const parsed = this.parseTimekeepData(content);
				if (parsed) {
					this.data = parsed;

					// Normalize ISO string formats (migrate UTC 'Z' suffix to local format)
					const needsSave = this.normalizeEntryTimestamps();
					if (needsSave) {
						await this.save();
						console.log('TimeFlow: Migrated entry timestamps to local ISO format');
					}

					// Return settings from data file if they exist
					if (parsed.settings) {
						return parsed.settings as TimeFlowSettings;
					}
				} else {
					console.warn('TimeFlow: Could not parse data from', this.dataFile);
					this.data = { entries: [] };
				}
			} else {
				// Create the file if it doesn't exist
				await this.createDataFile();
			}
		} catch (error) {
			console.error('TimeFlow: Error loading timer data:', error);
			this.data = { entries: [] };
		}
		return null;
	}

	async createDataFile(): Promise<void> {
		// Build timekeep block with entries only
		const entriesOnly = { entries: this.data.entries };
		const timekeepBlock = `\`\`\`timekeep
${JSON.stringify(entriesOnly, null, 2)}
\`\`\``;

		// Build settings block if present
		const settingsBlock = this.data.settings
			? `\n\n\`\`\`timeflow-settings
${JSON.stringify(this.data.settings, null, 2)}
\`\`\``
			: '';

		const content = `# timeflow data

This file contains your time tracking data in Timekeep-compatible format.

${timekeepBlock}${settingsBlock}
`;
		// Ensure the folder exists
		const folderPath = this.dataFile.substring(0, this.dataFile.lastIndexOf('/'));
		const folderExists = await this.app.vault.adapter.exists(folderPath);
		if (!folderExists) {
			await this.app.vault.createFolder(folderPath);
		}
		await this.app.vault.create(this.dataFile, content);
	}

	parseTimekeepData(content: string): TimekeepData | null {
		try {
			// Extract JSON from timekeep codeblock (entries only, or legacy format with settings)
			const timekeepMatch = content.match(/```timekeep\s*\n([\s\S]*?)\n```/);
			if (!timekeepMatch || !timekeepMatch[1]) {
				return null;
			}

			const timekeepData = JSON.parse(timekeepMatch[1]);
			const result: TimekeepData = {
				entries: timekeepData.entries || []
			};

			// Check for separate timeflow-settings block (new format)
			const settingsMatch = content.match(/```timeflow-settings\s*\n([\s\S]*?)\n```/);
			if (settingsMatch && settingsMatch[1]) {
				result.settings = JSON.parse(settingsMatch[1]);
			} else if (timekeepData.settings) {
				// Fall back to settings inside timekeep block (legacy format)
				result.settings = timekeepData.settings;
			}

			return result;
		} catch (error) {
			console.error('Error parsing timekeep data:', error);
		}
		return null;
	}

	async save(): Promise<void> {
		this.isSaving = true;
		this.lastSaveTime = Date.now();
		try {
			// Build timekeep block with entries only (Timekeep-compatible)
			const entriesOnly = { entries: this.data.entries };
			const timekeepBlock = `\`\`\`timekeep
${JSON.stringify(entriesOnly, null, 2)}
\`\`\``;

			// Build settings block separately
			const settingsBlock = this.data.settings
				? `\n\n\`\`\`timeflow-settings
${JSON.stringify(this.data.settings, null, 2)}
\`\`\``
				: '';

			const content = `# timeflow data

This file contains your time tracking data in Timekeep-compatible format.

${timekeepBlock}${settingsBlock}
`;

			// First check if file exists using adapter (more reliable than vault cache)
			const fileExists = await this.app.vault.adapter.exists(this.dataFile);

			if (fileExists) {
				// File exists - get it and modify
				const file = this.app.vault.getAbstractFileByPath(this.dataFile);
				if (file && file instanceof TFile) {
					await this.app.vault.modify(file, content);
				} else {
					// File exists on disk but not in vault cache - use adapter directly
					await this.app.vault.adapter.write(this.dataFile, content);
				}
			} else {
				// File doesn't exist - create it
				const folderPath = this.dataFile.substring(0, this.dataFile.lastIndexOf('/'));
				const folderExists = await this.app.vault.adapter.exists(folderPath);
				if (!folderExists) {
					await this.app.vault.createFolder(folderPath);
				}
				try {
					await this.app.vault.create(this.dataFile, content);
				} catch (createError: any) {
					// If file was created between our check and create (race condition), just write to it
					if (createError?.message?.includes('File already exists')) {
						await this.app.vault.adapter.write(this.dataFile, content);
					} else {
						throw createError;
					}
				}
			}
		} catch (error) {
			console.error('TimeFlow: Error saving timer data:', error);
		} finally {
			this.isSaving = false;
		}
	}

	// Save settings to the data file for cross-device sync
	async saveSettings(settings: TimeFlowSettings): Promise<void> {
		this.settings = settings;
		this.data.settings = settings;
		await this.save();
	}

	async startTimer(name: string = 'jobb'): Promise<Timer> {
		const timer: Timer = {
			name,
			startTime: Utils.toLocalISOString(new Date()),
			endTime: null,
			subEntries: null
		};

		this.data.entries.push(timer);
		await this.save();

		if (this.onTimerChange) {
			this.onTimerChange();
		}

		new Notice(`⏱️ Timer started: ${name}`);
		return timer;
	}

	async stopTimer(timer: Timer): Promise<Timer | null> {
		if (!timer.startTime || timer.endTime) {
			return null;
		}

		timer.endTime = Utils.toLocalISOString(new Date());
		await this.save();

		if (this.onTimerChange) {
			this.onTimerChange();
		}

		const duration = Utils.hoursDiff(
			new Date(timer.startTime),
			new Date(timer.endTime)
		);

		new Notice(`✅ Timer stopped: ${timer.name} (${Utils.formatHoursToHM(duration)})`);
		return timer;
	}

	async stopAllTimers(): Promise<void> {
		const activeTimers = this.getActiveTimers();
		for (const timer of activeTimers) {
			await this.stopTimer(timer);
		}
	}

	async deleteTimer(timer: Timer): Promise<boolean> {
		const index = this.data.entries.indexOf(timer);
		if (index !== -1) {
			this.data.entries.splice(index, 1);
			await this.save();

			if (this.onTimerChange) {
				this.onTimerChange();
			}

			new Notice('Timer deleted');
			return true;
		}
		return false;
	}

	/**
	 * Normalize entry timestamps:
	 * - Convert UTC 'Z' format to local ISO format
	 * - Convert midnight T00:00:00 to T08:00:00 to avoid timezone parsing issues
	 * Returns true if any entries were modified and need saving.
	 */
	normalizeEntryTimestamps(): boolean {
		let modified = false;

		const normalizeTimestamp = (timestamp: string | null | undefined): string | null => {
			if (!timestamp) return null;

			// Check if it ends with 'Z' (UTC format)
			if (timestamp.endsWith('Z')) {
				const date = new Date(timestamp);
				if (!isNaN(date.getTime())) {
					// Convert to local ISO string format (without 'Z')
					const pad = (n: number) => n.toString().padStart(2, '0');
					const localISO = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
					modified = true;
					return localISO;
				}
			}

			// Convert midnight timestamps to 08:00 to avoid timezone issues
			// This handles legacy special day entries that used T00:00:00
			if (timestamp.endsWith('T00:00:00')) {
				modified = true;
				return timestamp.replace('T00:00:00', 'T08:00:00');
			}

			return timestamp;
		};

		const normalizeEntry = (entry: Timer) => {
			if (entry.startTime) {
				const normalized = normalizeTimestamp(entry.startTime);
				if (normalized !== entry.startTime) {
					entry.startTime = normalized;
				}
			}
			if (entry.endTime) {
				const normalized = normalizeTimestamp(entry.endTime);
				if (normalized !== entry.endTime) {
					entry.endTime = normalized;
				}
			}
			// Also normalize subEntries if present
			if (entry.subEntries && Array.isArray(entry.subEntries)) {
				entry.subEntries.forEach(sub => normalizeEntry(sub));
			}
		};

		this.data.entries.forEach(entry => normalizeEntry(entry));
		return modified;
	}

	getActiveTimers(): Timer[] {
		return this.data.entries.filter(e => e.startTime && !e.endTime && !e.collapsed);
	}

	getCompletedTimers(): Timer[] {
		return this.data.entries.filter(e => e.startTime && e.endTime);
	}

	getAllTimers(): Timer[] {
		return this.data.entries;
	}

	// Flatten all entries including subEntries for DataManager
	convertToTimeEntries(): any[] {
		const flatEntries: any[] = [];

		const flattenEntry = (entry: Timer) => {
			if (entry.collapsed && entry.subEntries) {
				// If collapsed, include subEntries instead of parent
				entry.subEntries.forEach(sub => flattenEntry(sub));
			} else if (entry.startTime) {
				// Include the entry itself
				flatEntries.push({
					name: entry.name,
					startTime: entry.startTime,
					endTime: entry.endTime,
					subEntries: null
				});
			}
		};

		this.data.entries.forEach(entry => flattenEntry(entry));
		return flatEntries;
	}

	// Get running time for active timer
	getRunningTime(timer: Timer): number {
		if (!timer.startTime || timer.endTime) return 0;
		const now = new Date();
		const start = new Date(timer.startTime);
		return Utils.hoursDiff(start, now);
	}

	// Get total running time for all active timers
	getTotalRunningTime(): number {
		return this.getActiveTimers().reduce((total, timer) => {
			return total + this.getRunningTime(timer);
		}, 0);
	}

	// Load data from multiple sources (daily notes with timekeep codeblocks)
	async loadFromDailyNotes(): Promise<void> {
		try {
			const files = this.app.vault.getMarkdownFiles();
			const dailyNotesFolder = this.settings.dailyNotesFolder;

			let allEntries: Timer[] = [];

			for (const file of files) {
				// Check if file is in daily notes folder
				if (file.path.startsWith(dailyNotesFolder)) {
					const content = await this.app.vault.read(file);
					const parsed = this.parseTimekeepData(content);
					if (parsed && parsed.entries) {
						allEntries = allEntries.concat(parsed.entries);
					}
				}
			}

			// Merge with current data (avoid duplicates)
			const currentEntries = this.data.entries;
			allEntries.forEach(entry => {
				// Simple duplicate check: same name, startTime, and endTime
				const isDuplicate = currentEntries.some(e =>
					e.name === entry.name &&
					e.startTime === entry.startTime &&
					e.endTime === entry.endTime
				);
				if (!isDuplicate) {
					currentEntries.push(entry);
				}
			});

			this.data.entries = currentEntries;
			await this.save();

		} catch (error) {
			console.error('Error loading from daily notes:', error);
		}
	}

	// Export to Timekeep format for other tools
	exportTimekeepFormat(): string {
		return JSON.stringify(this.data, null, 2);
	}

	// Import from Timekeep JSON
	async importTimekeepData(jsonData: string): Promise<boolean> {
		try {
			const parsed: TimekeepData = JSON.parse(jsonData);
			if (parsed && parsed.entries) {
				// Merge with current data, avoiding duplicates
				const currentEntries = this.data.entries;
				let addedCount = 0;
				let skippedCount = 0;

				parsed.entries.forEach(entry => {
					// Check for duplicates: same name, startTime, and endTime
					const isDuplicate = currentEntries.some(e =>
						e.name === entry.name &&
						e.startTime === entry.startTime &&
						e.endTime === entry.endTime
					);

					if (!isDuplicate) {
						currentEntries.push(entry);
						addedCount++;
					} else {
						skippedCount++;
					}
				});

				this.data.entries = currentEntries;
				await this.save();

				if (this.onTimerChange) {
					this.onTimerChange();
				}

				// Show detailed notice about import results
				if (skippedCount > 0) {
					new Notice(`✅ Imported ${addedCount} entries, skipped ${skippedCount} duplicates`);
				} else {
					new Notice(`✅ Imported ${addedCount} entries`);
				}
				return true;
			}
		} catch (error) {
			console.error('Error importing timekeep data:', error);
			new Notice('❌ Error importing data');
		}
		return false;
	}

	// Convert past planned days (from holidays.md) to timer entries
	// This ensures planned days like ferie, avspasering appear in Historikk
	async convertPastPlannedDays(holidays: Record<string, { type: string; description: string; halfDay: boolean; startTime?: string; endTime?: string }>, settings: TimeFlowSettings): Promise<number> {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		let converted = 0;

		for (const [dateStr, info] of Object.entries(holidays)) {
			const plannedDate = new Date(dateStr);
			if (plannedDate >= today) continue; // Skip future/today

			// Skip types that don't auto-convert
			const behavior = settings.specialDayBehaviors.find(b => b.id === info.type);
			if (!behavior?.noHoursRequired) continue; // studie, kurs don't convert
			if (info.type === 'helligdag') continue; // System holiday

			// Check if entry of same type already exists for this date
			const hasEntry = this.data.entries.some(e => {
				if (!e.startTime) return false;
				const entryDate = new Date(e.startTime);
				return Utils.toLocalDateStr(entryDate) === dateStr &&
					   e.name.toLowerCase() === info.type;
			});

			if (hasEntry) continue;

			// Calculate times based on type
			// Use T08:00:00 instead of T00:00:00 to avoid timezone parsing issues
			let startTime = `${dateStr}T08:00:00`;
			let endTime = `${dateStr}T08:00:00`;

			if (info.type === 'avspasering') {
				// Avspasering uses startTime/endTime from holidays.md (e.g., 14:00-16:00)
				if (info.startTime && info.endTime) {
					startTime = `${dateStr}T${info.startTime}:00`;
					endTime = `${dateStr}T${info.endTime}:00`;
				} else {
					// Fallback: full workday if no time specified
					const hours = settings.baseWorkday * settings.workPercent;
					const h = Math.floor(hours);
					const m = Math.round((hours - h) * 60);
					endTime = `${dateStr}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
				}
			}
			// ferie, velferdspermisjon, sykemelding, egenmelding: 08:00-08:00 (0 duration is fine)

			const entry: Timer = {
				name: info.type,
				startTime,
				endTime,
				subEntries: null
			};

			this.data.entries.push(entry);
			converted++;
		}

		if (converted > 0) {
			await this.save();
		}
		return converted;
	}
}
