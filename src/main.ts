import { Plugin, WorkspaceLeaf, ItemView } from 'obsidian';
import { TimeFlowSettings, DEFAULT_SETTINGS, TimeFlowSettingTab, DEFAULT_SPECIAL_DAY_BEHAVIORS } from './settings';
import { TimeFlowView, VIEW_TYPE_TIMEFLOW } from './view';
import { TimerManager, Timer } from './timerManager';
import { ImportModal } from './importModal';
import { setLanguage } from './i18n';
import { Utils } from './utils';

export default class TimeFlowPlugin extends Plugin {
	settings: TimeFlowSettings;
	timerManager: TimerManager;

	async onload() {
		// Load settings (without migration yet)
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// Initialize timer manager
		this.timerManager = new TimerManager(this.app, this.settings);
		const syncedSettings = await this.timerManager.load();

		// If settings are in the data file, merge them with local settings
		// Data file settings take precedence for cross-device sync
		if (syncedSettings) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, this.settings, syncedSettings);
			this.timerManager.settings = this.settings;
		}

		// Now run migrations AFTER merging synced settings
		const needsSave = this.migrateWorkDaysSettings() || this.migrateSpecialDayBehaviors();
		const timestampMigrated = await this.migrateTimestamps();
		if (needsSave || timestampMigrated) {
			await this.saveSettings();
		}

		// Initialize language from settings
		setLanguage(this.settings.language ?? 'nb');

		// Register the TimeFlow view
		this.registerView(
			VIEW_TYPE_TIMEFLOW,
			(leaf) => new TimeFlowView(leaf, this)
		);

		// Add ribbon icon to open timeflow
		this.addRibbonIcon('calendar-clock', 'Open timeflow', () => {
			this.activateView();
		});

		// Add command to open timeflow
		this.addCommand({
			id: 'open-timeflow',
			name: 'Open timeflow Dashboard',
			callback: () => {
				this.activateView();
			}
		});

		// Add commands for timer control
		this.addCommand({
			id: 'start-timer',
			name: 'Start Timer',
			callback: async () => {
				await this.timerManager.startTimer('jobb');
			}
		});

		this.addCommand({
			id: 'stop-all-timers',
			name: 'Stop All Timers',
			callback: async () => {
				await this.timerManager.stopAllTimers();
			}
		});

		// Add command to import data
		this.addCommand({
			id: 'import-timekeep-data',
			name: 'Import Timekeep Data',
			callback: () => {
				new ImportModal(this.app, this.timerManager, () => {
					// Refresh any open TimeFlow views
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMEFLOW);
					leaves.forEach(leaf => {
						const view = leaf.view as TimeFlowView;
						if (view && view.refresh) {
							view.refresh();
						}
					});
				}).open();
			}
		});

		// Add settings tab
		this.addSettingTab(new TimeFlowSettingTab(this.app, this));

		// Defer file watcher registration until layout is ready (improves load time)
		this.app.workspace.onLayoutReady(() => {
			// Watch for changes to the data file (e.g., from sync)
			this.registerEvent(
				this.app.vault.on('modify', async (file) => {
					if (file.path === this.settings.dataFilePath) {
						// Skip reload if we just saved (prevents race condition)
						if (!this.timerManager.shouldReloadFromFile()) return;
						// Reload data from file
						await this.timerManager.load();
						// Refresh all open TimeFlow views
						const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMEFLOW);
						leaves.forEach(leaf => {
							const view = leaf.view as TimeFlowView;
							if (view && view.refresh) {
								view.refresh();
							}
						});
					}
				})
			);
		});
	}

	onunload() {
		// Don't stop timers on unload - they should persist across reloads
	}

	async loadSettings() {
		// This is called when settings tab is opened - just reload from storage
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	migrateSpecialDayBehaviors(): boolean {
		// Migrate from old specialDayColors/specialDayLabels to new specialDayBehaviors
		let changed = false;

		if (!this.settings.specialDayBehaviors || this.settings.specialDayBehaviors.length === 0) {
			// Start with default behaviors
			this.settings.specialDayBehaviors = DEFAULT_SPECIAL_DAY_BEHAVIORS.map(defaultBehavior => {
				// Create a copy and override with any custom values from old settings
				return {
					...defaultBehavior,
					label: this.settings.specialDayLabels?.[defaultBehavior.id] || defaultBehavior.label,
					color: this.settings.specialDayColors?.[defaultBehavior.id] || defaultBehavior.color
				};
			});
			changed = true;
		} else {
			// Ensure all default behaviors exist (add any missing ones like 'jobb')
			DEFAULT_SPECIAL_DAY_BEHAVIORS.forEach(defaultBehavior => {
				const existingIndex = this.settings.specialDayBehaviors.findIndex(b => b.id === defaultBehavior.id);
				if (existingIndex === -1) {
					// Add work types at the beginning, others at the end
					if (defaultBehavior.isWorkType) {
						this.settings.specialDayBehaviors.unshift({ ...defaultBehavior });
					} else {
						this.settings.specialDayBehaviors.push({ ...defaultBehavior });
					}
					changed = true;
				} else if (defaultBehavior.isWorkType && !this.settings.specialDayBehaviors[existingIndex].isWorkType) {
					// Ensure existing work types have the isWorkType flag
					this.settings.specialDayBehaviors[existingIndex].isWorkType = true;
					changed = true;
				}
			});
		}
		return changed;
	}

	/**
	 * Migrate UTC timestamps (ending with Z) to local ISO format.
	 * This ensures times display correctly regardless of timezone.
	 */
	async migrateTimestamps(): Promise<boolean> {
		if (this.settings.hasTimestampMigration) {
			return false; // Already migrated
		}

		let changed = false;

		const convertTimestamp = (timestamp: string | null): string | null => {
			if (!timestamp) return null;
			// Check if it's a UTC timestamp (ends with Z)
			if (timestamp.endsWith('Z')) {
				const date = new Date(timestamp);
				// Convert to local ISO string without Z suffix
				return Utils.toLocalISOString(date);
			}
			return timestamp; // Already local format
		};

		const migrateEntry = (entry: Timer): void => {
			const newStart = convertTimestamp(entry.startTime);
			const newEnd = convertTimestamp(entry.endTime);

			if (newStart !== entry.startTime || newEnd !== entry.endTime) {
				entry.startTime = newStart;
				entry.endTime = newEnd;
				changed = true;
			}

			// Also migrate subEntries
			if (entry.subEntries) {
				entry.subEntries.forEach(sub => migrateEntry(sub));
			}
		};

		// Migrate all entries
		this.timerManager.data.entries.forEach(entry => migrateEntry(entry));

		if (changed) {
			await this.timerManager.save();
			console.log('TimeFlow: Migrated timestamps to local format');
		}

		// Mark migration as complete
		this.settings.hasTimestampMigration = true;
		return changed;
	}

	migrateWorkDaysSettings(): boolean {
		let changed = false;
		// Migrate from old includeSaturday/Sunday to new workDays array
		if (!this.settings.workDays || this.settings.workDays.length === 0) {
			const workDays = [1, 2, 3, 4, 5]; // Monday-Friday

			// Add Saturday if it was included
			if (this.settings.includeSaturdayInWorkWeek) {
				workDays.push(6);
			}

			// Add Sunday if it was included
			if (this.settings.includeSundayInWorkWeek) {
				workDays.push(0);
			}

			this.settings.workDays = workDays.sort((a, b) => a - b);
			changed = true;
		}

		// Ensure alternating week work days exist
		if (!this.settings.alternatingWeekWorkDays || this.settings.alternatingWeekWorkDays.length === 0) {
			this.settings.alternatingWeekWorkDays = [...this.settings.workDays];
			changed = true;
		}
		return changed;
	}

	/**
	 * Validate and clamp settings to sensible bounds to prevent division by zero
	 * and other edge cases.
	 */
	validateSettings(): void {
		// Ensure numeric values are within bounds
		this.settings.workPercent = Math.max(0.01, Math.min(2, this.settings.workPercent));
		this.settings.baseWorkday = Math.max(0.5, Math.min(24, this.settings.baseWorkday));
		this.settings.baseWorkweek = Math.max(1, Math.min(168, this.settings.baseWorkweek));
		this.settings.workdaysPerWeek = Math.max(1, Math.min(7, this.settings.workdaysPerWeek));
		this.settings.workdaysPerMonth = Math.max(1, Math.min(31, this.settings.workdaysPerMonth));
		this.settings.workdaysPerYear = Math.max(1, Math.min(366, this.settings.workdaysPerYear));
		this.settings.lunchBreakMinutes = Math.max(0, Math.min(120, this.settings.lunchBreakMinutes));
		this.settings.halfDayHours = Math.max(0.5, Math.min(12, this.settings.halfDayHours));
		this.settings.maxEgenmeldingDays = Math.max(0, Math.min(365, this.settings.maxEgenmeldingDays));
		this.settings.maxFerieDays = Math.max(0, Math.min(365, this.settings.maxFerieDays));
		this.settings.heatmapColumns = Math.max(12, Math.min(96, this.settings.heatmapColumns));

		// Cross-validation: halfDayHours cannot exceed baseWorkday
		if (this.settings.halfDayHours >= this.settings.baseWorkday) {
			this.settings.halfDayHours = this.settings.baseWorkday / 2;
		}

		// Cross-validation: ensure threshold ordering (criticalLow < warningLow < warningHigh < criticalHigh)
		const t = this.settings.balanceThresholds;
		if (t.criticalLow >= t.warningLow) t.warningLow = t.criticalLow + 1;
		if (t.warningLow >= t.warningHigh) t.warningHigh = t.warningLow + 1;
		if (t.warningHigh >= t.criticalHigh) t.criticalHigh = t.warningHigh + 1;

		// Ensure arrays have at least one element
		if (!this.settings.workDays || this.settings.workDays.length === 0) {
			this.settings.workDays = [1, 2, 3, 4, 5]; // Default to Monday-Friday
		}
	}

	async saveSettings() {
		this.validateSettings();
		await this.saveData(this.settings);
		// Also save to data file for cross-device sync
		await this.timerManager.saveSettings(this.settings);
	}

	async activateView(location?: 'sidebar' | 'main') {
		const targetLocation = location ?? this.settings.defaultViewLocation;
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMEFLOW);

		if (leaves.length > 0) {
			// A TimeFlow view already exists, use the first one
			leaf = leaves[0];
		} else {
			// Create a new leaf based on target location
			if (targetLocation === 'main') {
				leaf = workspace.getLeaf('tab');
			} else {
				leaf = workspace.getRightLeaf(false);
			}
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_TIMEFLOW, active: true });
			}
		}

		// Reveal the leaf if it exists
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async moveViewToLocation(location: 'sidebar' | 'main') {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMEFLOW);

		// Close any existing TimeFlow views
		for (const leaf of leaves) {
			leaf.detach();
		}

		// Open in new location
		await this.activateView(location);
	}
}
