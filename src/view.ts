import { ItemView, WorkspaceLeaf } from 'obsidian';
import TimeFlowPlugin from './main';
import { DataManager } from './dataManager';
import { UIBuilder } from './uiBuilder';
import { t } from './i18n';

export const VIEW_TYPE_TIMEFLOW = 'timeflow-view';

export class TimeFlowView extends ItemView {
	plugin: TimeFlowPlugin;
	dataManager: DataManager | null = null;
	uiBuilder: UIBuilder | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TimeFlowPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_TIMEFLOW;
	}

	getDisplayText(): string {
		return 'Timeflow dashboard';
	}

	getIcon(): string {
		return 'calendar-clock';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('timeflow-dashboard');

		// Load and render the dashboard
		await this.loadDashboard(container as HTMLElement);
	}

	async onClose(): Promise<void> {
		// Cleanup intervals and resources
		if (this.uiBuilder) {
			this.uiBuilder.cleanup();
		}
		return Promise.resolve();
	}

	async loadDashboard(container: HTMLElement) {
		try {
			// Get entries from TimerManager
			const allEntries = this.plugin.timerManager.convertToTimeEntries();

			if (allEntries.length === 0) {
				container.createDiv({
					text: 'No timer data yet. Start a timer to begin tracking!',
					cls: 'timeflow-warning'
				});
			}

			// Initialize DataManager
			this.dataManager = new DataManager(allEntries, this.plugin.settings, this.app);

			// Load holidays asynchronously
			let holidayStatus = await this.dataManager.loadHolidays();

			// Convert past planned days to timer entries (so they appear in Historikk)
			const converted = await this.plugin.timerManager.convertPastPlannedDays(
				this.dataManager.holidays,
				this.plugin.settings
			);
			if (converted > 0) {
				// Refresh entries after conversion since new entries were added
				const updatedEntries = this.plugin.timerManager.convertToTimeEntries();
				this.dataManager = new DataManager(updatedEntries, this.plugin.settings, this.app);
				// Re-load holidays into new dataManager and update status
				holidayStatus = await this.dataManager.loadHolidays();
			}

			// Process entries
			this.dataManager.processEntries();

			// Run data validation
			const validationResults = this.dataManager.validateData();

			// Create system status object
			const systemStatus = {
				holiday: holidayStatus,
				validation: validationResults,
				activeTimers: this.dataManager.activeEntries.length,
				dataParseError: this.plugin.timerManager.dataParseError
			};

			// Build UI
			this.uiBuilder = new UIBuilder(
				this.dataManager,
				systemStatus,
				this.plugin.settings,
				this.app,
				this.plugin.timerManager,
				this.plugin
			);

			// Set up timer change callback to refresh dashboard
			this.plugin.timerManager.onTimerChange = () => {
				void this.refresh();
			};

			// Build and append the dashboard
			const dashboardEl = this.uiBuilder.build();
			container.empty();
			container.appendChild(dashboardEl);

			// Start real-time updates
			this.uiBuilder.startUpdates();

		} catch (error) {
			console.error('Error loading TimeFlow dashboard:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			container.createDiv({
				text: t('notifications.errorLoadingDashboard').replace('{error}', errorMessage),
				cls: 'timeflow-error'
			});
		}
	}

	// Method to refresh the dashboard
	async refresh() {
		const container = this.containerEl.children[1];
		await this.loadDashboard(container as HTMLElement);
	}
}
