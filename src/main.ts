import { Plugin, WorkspaceLeaf, ItemView } from 'obsidian';
import { TimeFlowSettings, DEFAULT_SETTINGS, TimeFlowSettingTab } from './settings';
import { TimeFlowView, VIEW_TYPE_TIMEFLOW } from './view';
import { TimerManager } from './timerManager';
import { ImportModal } from './importModal';

export default class TimeFlowPlugin extends Plugin {
	settings: TimeFlowSettings;
	timerManager: TimerManager;

	async onload() {
		console.log('Loading TimeFlow plugin');

		// Load settings
		await this.loadSettings();

		// Initialize timer manager
		this.timerManager = new TimerManager(this.app, this.settings);
		const syncedSettings = await this.timerManager.load();

		// If settings are in the data file, merge them with local settings
		// Data file settings take precedence for cross-device sync
		if (syncedSettings) {
			console.log('TimeFlow: Merging synced settings from data file');
			this.settings = Object.assign({}, DEFAULT_SETTINGS, this.settings, syncedSettings);
			this.timerManager.settings = this.settings;
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Also save to data file for cross-device sync
		await this.timerManager.saveSettings(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMEFLOW);

		if (leaves.length > 0) {
			// A TimeFlow view already exists, use the first one
			leaf = leaves[0];
		} else {
			// Create a new leaf in the right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_TIMEFLOW, active: true });
			}
		}

		// Reveal the leaf if it exists
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}
