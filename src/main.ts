import { Plugin, WorkspaceLeaf, ItemView } from 'obsidian';
import { TimeFlowSettings, DEFAULT_SETTINGS, TimeFlowSettingTab, DEFAULT_SPECIAL_DAY_BEHAVIORS } from './settings';
import { TimeFlowView, VIEW_TYPE_TIMEFLOW } from './view';
import { TimerManager } from './timerManager';
import { ImportModal } from './importModal';

export default class TimeFlowPlugin extends Plugin {
	settings: TimeFlowSettings;
	timerManager: TimerManager;

	async onload() {
		console.log('Loading TimeFlow plugin');

		// Load settings (without migration yet)
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// Initialize timer manager
		this.timerManager = new TimerManager(this.app, this.settings);
		const syncedSettings = await this.timerManager.load();

		// If settings are in the data file, merge them with local settings
		// Data file settings take precedence for cross-device sync
		if (syncedSettings) {
			console.log('TimeFlow: Merging synced settings from data file');
			this.settings = Object.assign({}, DEFAULT_SETTINGS, this.settings, syncedSettings);
			this.timerManager.settings = this.settings;
		}

		// Now run migrations AFTER merging synced settings
		const needsSave = this.migrateWorkDaysSettings() || this.migrateSpecialDayBehaviors();
		if (needsSave) {
			console.log('TimeFlow: Saving migrated settings');
			await this.saveSettings();
		}

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
		console.log('Unloading TimeFlow plugin');
		// Don't stop timers on unload - they should persist across reloads
	}

	async loadSettings() {
		// This is called when settings tab is opened - just reload from storage
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	migrateSpecialDayBehaviors(): boolean {
		// Migrate from old specialDayColors/specialDayLabels to new specialDayBehaviors
		console.log('TimeFlow Migration: Starting specialDayBehaviors migration');
		console.log('TimeFlow Migration: Current behaviors:', this.settings.specialDayBehaviors?.map(b => b.id));
		console.log('TimeFlow Migration: Default behaviors:', DEFAULT_SPECIAL_DAY_BEHAVIORS.map(b => b.id));

		let changed = false;

		if (!this.settings.specialDayBehaviors || this.settings.specialDayBehaviors.length === 0) {
			console.log('TimeFlow: Migrating special day settings to new behavior system');

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
			console.log('TimeFlow Migration: Behaviors exist, checking for missing defaults...');
			// Ensure all default behaviors exist (add any missing ones like 'jobb')
			DEFAULT_SPECIAL_DAY_BEHAVIORS.forEach(defaultBehavior => {
				const existingIndex = this.settings.specialDayBehaviors.findIndex(b => b.id === defaultBehavior.id);
				console.log(`TimeFlow Migration: Checking '${defaultBehavior.id}', existingIndex=${existingIndex}, isWorkType=${defaultBehavior.isWorkType}`);
				if (existingIndex === -1) {
					console.log(`TimeFlow: Adding missing behavior '${defaultBehavior.id}'`);
					// Add work types at the beginning, others at the end
					if (defaultBehavior.isWorkType) {
						this.settings.specialDayBehaviors.unshift({ ...defaultBehavior });
					} else {
						this.settings.specialDayBehaviors.push({ ...defaultBehavior });
					}
					changed = true;
				} else if (defaultBehavior.isWorkType && !this.settings.specialDayBehaviors[existingIndex].isWorkType) {
					// Ensure existing work types have the isWorkType flag
					console.log(`TimeFlow Migration: Setting isWorkType=true on existing '${defaultBehavior.id}'`);
					this.settings.specialDayBehaviors[existingIndex].isWorkType = true;
					changed = true;
				}
			});
			console.log('TimeFlow Migration: After migration:', this.settings.specialDayBehaviors?.map(b => ({ id: b.id, isWorkType: b.isWorkType })));
		}
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

	async saveSettings() {
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
