import { App, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import TimeFlowPlugin from './main';
import { Utils } from './utils';

export interface TimeFlowSettings {
	version: string;
	theme: 'light' | 'dark' | 'system';
	hourUnit: 'h' | 't';
	workPercent: number;
	baseWorkday: number;
	baseWorkweek: number;
	lunchBreakMinutes: number;
	includeSaturdayInWorkWeek: boolean; // DEPRECATED - kept for migration
	includeSundayInWorkWeek: boolean; // DEPRECATED - kept for migration
	workDays: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
	enableAlternatingWeeks: boolean;
	alternatingWeekWorkDays: number[]; // Work days for alternating week
	enableGoalTracking: boolean; // NEW: Toggle between goal-based and simple tracking
	enableWeeklyGoals: boolean;
	maxEgenmeldingDays: number;
	maxFerieDays: number;
	updateInterval: number;
	clockInterval: number;
	dataFilePath: string;
	holidaysFilePath: string;
	dailyNotesFolder: string;
	dailyNotesTemplatePath: string;
	workdaysPerYear: number;
	workdaysPerMonth: number;
	workdaysPerWeek: number;
	consecutiveFlextimeWarningDays: number;
	defaultExportWeeks: number;
	heatmapColumns: number;
	noteTypes: NoteType[];
	specialDayBehaviors: SpecialDayBehavior[];
	specialDayColors?: Record<string, string>; // DEPRECATED - kept for migration
	specialDayLabels?: Record<string, string>; // DEPRECATED - kept for migration
	// Advanced configuration settings
	balanceStartDate: string;
	halfDayHours: number;
	halfDayMode: 'fixed' | 'percentage';
	balanceThresholds: {
		criticalLow: number;
		warningLow: number;
		warningHigh: number;
		criticalHigh: number;
	};
	validationThresholds: {
		longRunningTimerHours: number;
		veryLongSessionHours: number;
		maxDurationHours: number;
		highWeeklyTotalHours: number;
	};
}

export interface SpecialDayBehavior {
	id: string;                    // Unique identifier (e.g., "ferie")
	label: string;                 // Display name
	icon: string;                  // Emoji
	color: string;                 // Hex color
	noHoursRequired: boolean;      // No work hours required this day?
	flextimeEffect: 'none' | 'withdraw' | 'accumulate';
	includeInStats: boolean;       // Count in yearly statistics?
	maxDaysPerYear?: number;       // Optional limit
}

export const DEFAULT_SPECIAL_DAY_BEHAVIORS: SpecialDayBehavior[] = [
	{
		id: 'ferie',
		label: 'Ferie',
		icon: '🏖️',
		color: '#b3e5fc',
		noHoursRequired: true,
		flextimeEffect: 'none',
		includeInStats: true,
		maxDaysPerYear: 25
	},
	{
		id: 'avspasering',
		label: 'Avspasering',
		icon: '🛌',
		color: '#ffe0b2',
		noHoursRequired: true,
		flextimeEffect: 'withdraw',
		includeInStats: true
	},
	{
		id: 'egenmelding',
		label: 'Egenmelding',
		icon: '🤒',
		color: '#c8e6c9',
		noHoursRequired: true,
		flextimeEffect: 'none',
		includeInStats: true,
		maxDaysPerYear: 8
	},
	{
		id: 'sykemelding',
		label: 'Sykemelding',
		icon: '🏥',
		color: '#c8e6c9',
		noHoursRequired: true,
		flextimeEffect: 'none',
		includeInStats: true
	},
	{
		id: 'velferdspermisjon',
		label: 'Velferdspermisjon',
		icon: '🏥',
		color: '#e1bee7',
		noHoursRequired: true,
		flextimeEffect: 'none',
		includeInStats: true
	},
	{
		id: 'kurs',
		label: 'Kurs',
		icon: '📚',
		color: '#f8bbd0',
		noHoursRequired: false,
		flextimeEffect: 'accumulate',
		includeInStats: true
	},
	{
		id: 'studie',
		label: 'Studie',
		icon: '📖',
		color: '#f8bbd0',
		noHoursRequired: false,
		flextimeEffect: 'accumulate',
		includeInStats: true
	},
	{
		id: 'helligdag',
		label: 'Helligdag',
		icon: '🎉',
		color: '#ef5350',
		noHoursRequired: true,
		flextimeEffect: 'none',
		includeInStats: true
	}
];

export interface NoteType {
	id: string;
	label: string;
	icon: string;
	folder: string;
	template: string;
	tags: string[];
	filenamePattern: string;
}

export const DEFAULT_SETTINGS: TimeFlowSettings = {
	version: "1.0.0",
	theme: "light",
	hourUnit: "t",
	workPercent: 1.0,
	baseWorkday: 7.5,
	baseWorkweek: 37.5,
	lunchBreakMinutes: 0,
	includeSaturdayInWorkWeek: false, // DEPRECATED
	includeSundayInWorkWeek: false, // DEPRECATED
	workDays: [1, 2, 3, 4, 5], // Monday-Friday by default
	enableAlternatingWeeks: false,
	alternatingWeekWorkDays: [1, 2, 3, 4, 5], // Same as workDays by default
	enableGoalTracking: true, // NEW: Default to goal-based tracking (current behavior)
	enableWeeklyGoals: true,
	maxEgenmeldingDays: 8,
	maxFerieDays: 25,
	updateInterval: 30000,
	clockInterval: 1000,
	dataFilePath: "timeflow/data.md",
	holidaysFilePath: "timeflow/holidays.md",
	dailyNotesFolder: "Daily Notes",
	dailyNotesTemplatePath: "timeflow/templates/daily-notes.md",
	workdaysPerYear: 260,
	workdaysPerMonth: 21,
	workdaysPerWeek: 5,
	consecutiveFlextimeWarningDays: 5,
	defaultExportWeeks: 52,
	heatmapColumns: 48,
	noteTypes: [
		{
			id: "daily",
			label: "Daglig Notat",
			icon: "📅",
			folder: "Daily Notes",
			template: "timeflow/templates/daily-notes.md",
			tags: [],
			filenamePattern: "{YYYY}-{MM}-{DD}"
		},
		{
			id: "meeting",
			label: "Møtenotat",
			icon: "👥",
			folder: "Møter",
			template: "timeflow/templates/meeting-note.md",
			tags: ["#møte", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Møte"
		},
		{
			id: "project",
			label: "Prosjektnotat",
			icon: "📋",
			folder: "Prosjekter",
			template: "timeflow/templates/project-note.md",
			tags: ["#prosjekt", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Prosjekt"
		},
		{
			id: "review",
			label: "Ukesoppsummering",
			icon: "🔍",
			folder: "Oppsummeringer",
			template: "timeflow/templates/weekly-review.md",
			tags: ["#oppsummering", "#uke", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Uke {WEEK}"
		},
		{
			id: "reflection",
			label: "Refleksjonsnotat",
			icon: "💭",
			folder: "Refleksjoner",
			template: "timeflow/templates/reflection-note.md",
			tags: ["#refleksjon", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Refleksjon"
		}
	],
	specialDayBehaviors: DEFAULT_SPECIAL_DAY_BEHAVIORS,
	specialDayColors: {
		avspasering: "#ffe0b2",
		ferie: "#b3e5fc",
		velferdspermisjon: "#e1bee7",
		egenmelding: "#c8e6c9",
		sykemelding: "#c8e6c9",
		kurs: "#f8bbd0",
		studie: "#f8bbd0"
	},
	specialDayLabels: {
		avspasering: "Avspasering",
		ferie: "Ferie",
		velferdspermisjon: "Velferdspermisjon",
		egenmelding: "Egenmelding",
		sykemelding: "Sykemelding",
		kurs: "Kurs",
		studie: "Studie"
	},
	// Advanced configuration settings
	balanceStartDate: "2025-01-01",
	halfDayHours: 4,
	halfDayMode: 'fixed',
	balanceThresholds: {
		criticalLow: -15,
		warningLow: 0,
		warningHigh: 80,
		criticalHigh: 95
	},
	validationThresholds: {
		longRunningTimerHours: 12,
		veryLongSessionHours: 16,
		maxDurationHours: 24,
		highWeeklyTotalHours: 60
	}
};

export class SpecialDayBehaviorModal extends Modal {
	behavior: SpecialDayBehavior | null;
	index: number;
	plugin: TimeFlowPlugin;
	onSave: (behavior: SpecialDayBehavior, index: number) => void;

	constructor(
		app: App,
		plugin: TimeFlowPlugin,
		behavior: SpecialDayBehavior | null,
		index: number,
		onSave: (behavior: SpecialDayBehavior, index: number) => void
	) {
		super(app);
		this.plugin = plugin;
		this.behavior = behavior;
		this.index = index;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.behavior ? 'Edit Special Day Type' : 'Add Special Day Type' });

		// Add Norwegian term explanations if applicable
		if (this.behavior) {
			const norwegianTerms: Record<string, string> = {
				'egenmelding': 'Norwegian self-reported sick leave (max 8 days/year per Norwegian labor law)',
				'velferdspermisjon': 'Norwegian welfare leave for personal/family health matters',
				'avspasering': 'Norwegian term: Time off as compensation for accumulated flextime'
			};

			const explanation = norwegianTerms[this.behavior.id];
			if (explanation) {
				const infoBox = contentEl.createDiv({ cls: 'setting-item-description' });
				infoBox.style.padding = '10px';
				infoBox.style.marginBottom = '15px';
				infoBox.style.background = 'var(--background-secondary)';
				infoBox.style.borderRadius = '5px';
				infoBox.style.fontSize = '0.9em';
				infoBox.innerHTML = `ℹ️ ${explanation}`;
			}
		}

		// Store form values
		const formData = {
			id: this.behavior?.id || '',
			label: this.behavior?.label || '',
			icon: this.behavior?.icon || '',
			color: this.behavior?.color || '#b3e5fc',
			noHoursRequired: this.behavior?.noHoursRequired ?? true,
			flextimeEffect: this.behavior?.flextimeEffect || 'none',
			includeInStats: this.behavior?.includeInStats ?? true,
			maxDaysPerYear: this.behavior?.maxDaysPerYear || undefined
		};

		// ID field (readonly if editing)
		new Setting(contentEl)
			.setName('ID')
			.setDesc('Unique identifier (lowercase, no spaces). Used in holiday file format.')
			.addText(text => {
				text
					.setPlaceholder('ferie')
					.setValue(formData.id)
					.onChange(value => formData.id = value.toLowerCase().replace(/\s+/g, ''));
				if (this.behavior) {
					text.setDisabled(true); // Can't change ID when editing
				}
			});

		// Label field
		new Setting(contentEl)
			.setName('Label')
			.setDesc('Display name shown in the dashboard')
			.addText(text => text
				.setPlaceholder('Ferie')
				.setValue(formData.label)
				.onChange(value => formData.label = value));

		// Icon field
		new Setting(contentEl)
			.setName('Icon')
			.setDesc('Emoji to display')
			.addText(text => text
				.setPlaceholder('🏖️')
				.setValue(formData.icon)
				.onChange(value => formData.icon = value));

		// Color field
		new Setting(contentEl)
			.setName('Color')
			.setDesc('Background color for this day type in calendar')
			.addColorPicker(color => color
				.setValue(formData.color)
				.onChange(value => formData.color = value));

		// No hours required toggle
		new Setting(contentEl)
			.setName('No hours required')
			.setDesc('If enabled, you don\'t need to log any work hours this day (e.g., vacation, sick leave). If disabled, regular workday goal applies.')
			.addToggle(toggle => toggle
				.setValue(formData.noHoursRequired)
				.onChange(value => formData.noHoursRequired = value));

		// Flextime effect dropdown
		new Setting(contentEl)
			.setName('Flextime effect')
			.setDesc('How this day type affects your flextime balance')
			.addDropdown(dropdown => dropdown
				.addOption('none', 'No effect (counts as full workday)')
				.addOption('withdraw', 'Withdraw (uses flextime balance)')
				.addOption('accumulate', 'Accumulate (excess hours add to flextime)')
				.setValue(formData.flextimeEffect)
				.onChange(value => formData.flextimeEffect = value as 'none' | 'withdraw' | 'accumulate'));

		// Include in stats toggle
		new Setting(contentEl)
			.setName('Include in statistics')
			.setDesc('Show this day type in yearly statistics')
			.addToggle(toggle => toggle
				.setValue(formData.includeInStats)
				.onChange(value => formData.includeInStats = value));

		// Max days per year
		new Setting(contentEl)
			.setName('Max days per year (optional)')
			.setDesc('Yearly limit for this day type (e.g., 25 for vacation). Leave empty for no limit.')
			.addText(text => text
				.setPlaceholder('25')
				.setValue(formData.maxDaysPerYear?.toString() || '')
				.onChange(value => {
					const num = parseInt(value);
					formData.maxDaysPerYear = isNaN(num) ? undefined : num;
				}));

		// Buttons
		const buttonDiv = contentEl.createDiv();
		buttonDiv.style.display = 'flex';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.justifyContent = 'flex-end';
		buttonDiv.style.marginTop = '20px';

		const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();

		const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.onclick = () => {
			// Validate
			if (!formData.id) {
				new Notice('⚠️ ID is required');
				return;
			}
			if (!formData.label) {
				new Notice('⚠️ Label is required');
				return;
			}
			if (!formData.icon) {
				new Notice('⚠️ Icon is required');
				return;
			}

			// Check for duplicate IDs (only when adding new or changing ID)
			if (!this.behavior || this.behavior.id !== formData.id) {
				const isDuplicate = this.plugin.settings.specialDayBehaviors.some(
					(b, i) => b.id === formData.id && i !== this.index
				);
				if (isDuplicate) {
					new Notice('⚠️ A special day type with this ID already exists');
					return;
				}
			}

			// Create behavior object
			const behavior: SpecialDayBehavior = {
				id: formData.id,
				label: formData.label,
				icon: formData.icon,
				color: formData.color,
				noHoursRequired: formData.noHoursRequired,
				flextimeEffect: formData.flextimeEffect,
				includeInStats: formData.includeInStats,
				maxDaysPerYear: formData.maxDaysPerYear
			};

			this.onSave(behavior, this.index);
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class TimeFlowSettingTab extends PluginSettingTab {
	plugin: TimeFlowPlugin;

	constructor(app: App, plugin: TimeFlowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async refreshView() {
		const leaves = this.plugin.app.workspace.getLeavesOfType('timeflow-view');
		for (const leaf of leaves) {
			const view = leaf.view as any;
			if (view && typeof view.refresh === 'function') {
				await view.refresh();
			}
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Appearance
		new Setting(containerEl).setName('Appearance').setHeading();

		new Setting(containerEl)
			.setName('Theme')
			.setDesc('Choose the color scheme for TimeFlow cards')
			.addDropdown(dropdown => dropdown
				.addOption('light', 'Light (Colorful gradients)')
				.addOption('system', 'System (Match Obsidian theme)')
				.addOption('dark', 'Dark (Dark gradients)')
				.setValue(this.plugin.settings.theme)
				.onChange(async (value: 'light' | 'dark' | 'system') => {
					this.plugin.settings.theme = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(containerEl)
			.setName('Hour unit')
			.setDesc('Choose the unit symbol for displaying hours: "h" for hours or "t" for timer')
			.addDropdown(dropdown => dropdown
				.addOption('h', 'h (hours)')
				.addOption('t', 't (timer)')
				.setValue(this.plugin.settings.hourUnit)
				.onChange(async (value: 'h' | 't') => {
					this.plugin.settings.hourUnit = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		// Special day types
		new Setting(containerEl)
			.setName('Special day types')
			.setDesc('Configure how different types of special days affect your workday and flextime balance. These settings determine how days are counted in flextime calculations.')
			.setHeading();

		// Helper function to get behavior description
		const getBehaviorDescription = (behavior: SpecialDayBehavior): string => {
			const parts: string[] = [];

			// Workday status
			parts.push(behavior.noHoursRequired ? 'No hours required' : 'Regular workday applies');

			// Flextime effect
			if (behavior.flextimeEffect === 'withdraw') {
				parts.push('withdraws from flextime');
			} else if (behavior.flextimeEffect === 'accumulate') {
				parts.push('excess counts as flextime');
			} else {
				parts.push('no flextime change');
			}

			// Max days
			if (behavior.maxDaysPerYear) {
				parts.push(`max ${behavior.maxDaysPerYear} days/year`);
			}

			return parts.join(', ');
		};

		// List existing behaviors
		this.plugin.settings.specialDayBehaviors.forEach((behavior, index) => {
			const colorDot = containerEl.createEl('span');
			colorDot.style.display = 'inline-block';
			colorDot.style.width = '12px';
			colorDot.style.height = '12px';
			colorDot.style.borderRadius = '50%';
			colorDot.style.backgroundColor = behavior.color;
			colorDot.style.marginRight = '6px';
			colorDot.style.verticalAlign = 'middle';

			new Setting(containerEl)
				.setName(`${behavior.icon} ${behavior.label}`)
				.setDesc(getBehaviorDescription(behavior))
				.addButton(btn => btn
					.setButtonText('Edit')
					.onClick(() => {
						new SpecialDayBehaviorModal(
							this.app,
							this.plugin,
							behavior,
							index,
							async (updatedBehavior, idx) => {
								this.plugin.settings.specialDayBehaviors[idx] = updatedBehavior;
								await this.plugin.saveSettings();
								await this.refreshView();
								this.display(); // Refresh settings panel
							}
						).open();
					}))
				.addButton(btn => btn
					.setButtonText('Delete')
					.setWarning()
					.onClick(async () => {
						// Warn if deleting a behavior with ID that might have historical data
						const confirmation = confirm(
							`Are you sure you want to delete "${behavior.label}"?\n\n` +
							`Note: Historical data in your holidays file using "${behavior.id}" will no longer be recognized.`
						);
						if (confirmation) {
							this.plugin.settings.specialDayBehaviors.splice(index, 1);
							await this.plugin.saveSettings();
							await this.refreshView();
							this.display(); // Refresh settings panel
						}
					}));
		});

		// Add new behavior button
		new Setting(containerEl)
			.setName('Add new special day type')
			.setDesc('Create a custom day type with your own rules')
			.addButton(btn => btn
				.setButtonText('+ Add')
				.setCta()
				.onClick(() => {
					new SpecialDayBehaviorModal(
						this.app,
						this.plugin,
						null, // New behavior
						this.plugin.settings.specialDayBehaviors.length, // Index at end
						async (newBehavior) => {
							this.plugin.settings.specialDayBehaviors.push(newBehavior);
							await this.plugin.saveSettings();
							await this.refreshView();
							this.display(); // Refresh settings panel
						}
					).open();
				}));

		// Work configuration
		new Setting(containerEl).setName('Work configuration').setHeading();

		// Settings sync info
		const syncInfo = containerEl.createDiv();
		syncInfo.style.marginBottom = '15px';
		syncInfo.style.padding = '10px';
		syncInfo.style.background = 'var(--background-secondary)';
		syncInfo.style.borderRadius = '5px';
		syncInfo.style.fontSize = '0.9em';
		syncInfo.innerHTML = `
			<strong>📱 Cross-Device Settings Sync</strong><br>
			Settings are automatically saved to <code>timeflow/data.md</code> and will sync across devices when using Obsidian Sync or any other vault sync solution. When you open the plugin on another device, your settings will be automatically loaded.
		`;

		// Goal Tracking Mode Toggle - MUST be at top of work configuration
		new Setting(containerEl)
			.setName('Enable goal tracking')
			.setDesc('Enable flextime calculations and daily/weekly goals. Disable for simple hour tracking without goals (e.g., shift workers, freelancers).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableGoalTracking)
				.onChange(async (value) => {
					this.plugin.settings.enableGoalTracking = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide dependent settings
					await this.refreshView(); // Refresh dashboard
				}));

		// Only show goal-related settings if goal tracking is enabled
		if (this.plugin.settings.enableGoalTracking) {
			new Setting(containerEl)
				.setName('Base workday hours')
				.setDesc('Standard hours for a full workday (e.g., 7.5 for standard, 6 for 6-hour days)')
				.addText(text => text
					.setPlaceholder('7.5')
					.setValue(this.plugin.settings.baseWorkday.toString())
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.baseWorkday = num;
							await this.plugin.saveSettings();
							await this.refreshView();
						}
					}));

		// Only show work percentage and baseWorkweek if weekly goals are enabled
		if (this.plugin.settings.enableWeeklyGoals) {
			new Setting(containerEl)
				.setName('Work percentage')
				.setDesc('Your employment percentage. Adjusts weekly work goal. Example: 0.8 (80%) = 30h/week if base is 37.5h')
				.addText(text => text
					.setPlaceholder('1.0')
					.setValue(this.plugin.settings.workPercent.toString())
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0 && num <= 1) {
							this.plugin.settings.workPercent = num;
							await this.plugin.saveSettings();
							await this.refreshView();
						}
					}));

			new Setting(containerEl)
				.setName('Base workweek hours')
				.setDesc('Standard hours for a full workweek (e.g., 37.5 for 5 days, 30 for 4 days)')
				.addText(text => text
					.setPlaceholder('37.5')
					.setValue(this.plugin.settings.baseWorkweek.toString())
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.baseWorkweek = num;
							await this.plugin.saveSettings();
							await this.refreshView();
						}
					}));
		}

		new Setting(containerEl)
			.setName('Lunch break duration')
			.setDesc('Daily lunch break in minutes (e.g., 30 for 30 minutes). This will be deducted from your work hours automatically.')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(this.plugin.settings.lunchBreakMinutes.toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.lunchBreakMinutes = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		// Work days selector
		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		const workDaysSetting = new Setting(containerEl)
			.setName('Work days')
			.setDesc('Select which days are part of your work week');

		const workDaysContainer = containerEl.createDiv();
		workDaysContainer.style.display = 'flex';
		workDaysContainer.style.flexWrap = 'wrap';
		workDaysContainer.style.gap = '8px';
		workDaysContainer.style.marginBottom = '15px';

		dayNames.forEach((dayName, dayIndex) => {
			const dayButton = workDaysContainer.createEl('button');
			dayButton.textContent = dayName.substring(0, 3); // Mon, Tue, etc.
			dayButton.className = 'tf-day-button';
			dayButton.style.padding = '8px 12px';
			dayButton.style.border = '1px solid var(--background-modifier-border)';
			dayButton.style.borderRadius = '4px';
			dayButton.style.cursor = 'pointer';
			dayButton.style.background = this.plugin.settings.workDays.includes(dayIndex)
				? 'var(--interactive-accent)'
				: 'var(--background-secondary)';
			dayButton.style.color = this.plugin.settings.workDays.includes(dayIndex)
				? 'var(--text-on-accent)'
				: 'var(--text-normal)';

			dayButton.onclick = async () => {
				const currentWorkDays = [...this.plugin.settings.workDays];
				const index = currentWorkDays.indexOf(dayIndex);

				if (index > -1) {
					currentWorkDays.splice(index, 1);
				} else {
					currentWorkDays.push(dayIndex);
					currentWorkDays.sort((a, b) => a - b);
				}

				this.plugin.settings.workDays = currentWorkDays;
				await this.plugin.saveSettings();
				this.display(); // Refresh to update button states
			};
		});

		// Alternating weeks toggle
		new Setting(containerEl)
			.setName('Enable alternating weeks')
			.setDesc('Enable if you have different work days in alternating weeks (e.g., every other weekend)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAlternatingWeeks)
				.onChange(async (value) => {
					this.plugin.settings.enableAlternatingWeeks = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide alternating week settings
				}));

		// Alternating week work days (only show if enabled)
		if (this.plugin.settings.enableAlternatingWeeks) {
			const altWorkDaysSetting = new Setting(containerEl)
				.setName('Alternating week work days')
				.setDesc('Select which days are work days in the alternating week');

			const altWorkDaysContainer = containerEl.createDiv();
			altWorkDaysContainer.style.display = 'flex';
			altWorkDaysContainer.style.flexWrap = 'wrap';
			altWorkDaysContainer.style.gap = '8px';
			altWorkDaysContainer.style.marginBottom = '15px';

			dayNames.forEach((dayName, dayIndex) => {
				const dayButton = altWorkDaysContainer.createEl('button');
				dayButton.textContent = dayName.substring(0, 3);
				dayButton.className = 'tf-day-button';
				dayButton.style.padding = '8px 12px';
				dayButton.style.border = '1px solid var(--background-modifier-border)';
				dayButton.style.borderRadius = '4px';
				dayButton.style.cursor = 'pointer';
				dayButton.style.background = this.plugin.settings.alternatingWeekWorkDays.includes(dayIndex)
					? 'var(--interactive-accent)'
					: 'var(--background-secondary)';
				dayButton.style.color = this.plugin.settings.alternatingWeekWorkDays.includes(dayIndex)
					? 'var(--text-on-accent)'
					: 'var(--text-normal)';

				dayButton.onclick = async () => {
					const currentAltWorkDays = [...this.plugin.settings.alternatingWeekWorkDays];
					const index = currentAltWorkDays.indexOf(dayIndex);

					if (index > -1) {
						currentAltWorkDays.splice(index, 1);
					} else {
						currentAltWorkDays.push(dayIndex);
						currentAltWorkDays.sort((a, b) => a - b);
					}

					this.plugin.settings.alternatingWeekWorkDays = currentAltWorkDays;
					await this.plugin.saveSettings();
					this.display(); // Refresh to update button states
				};
			});
		}
		} // End of enableGoalTracking conditional

		// Only show weekly/monthly goals toggle if goal tracking is enabled
		if (this.plugin.settings.enableGoalTracking) {
			new Setting(containerEl)
				.setName('Enable weekly/monthly goals')
				.setDesc('Disable if you don\'t have a specific amount of work each week/month. This will hide goal progress bars and weekly/monthly targets.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.enableWeeklyGoals)
					.onChange(async (value) => {
						this.plugin.settings.enableWeeklyGoals = value;
						await this.plugin.saveSettings();
						this.display(); // Refresh to show/hide baseWorkweek
					}));
		}

		// Advanced Configuration
		new Setting(containerEl)
			.setName('Advanced Configuration')
			.setHeading();

		const advancedInfo = containerEl.createDiv();
		advancedInfo.style.marginBottom = '15px';
		advancedInfo.style.padding = '10px';
		advancedInfo.style.background = 'var(--background-secondary)';
		advancedInfo.style.borderRadius = '5px';
		advancedInfo.style.fontSize = '0.9em';
		advancedInfo.innerHTML = `
			<strong>⚙️ Advanced Settings</strong><br>
			These settings affect balance calculations and visual indicators. Settings sync across devices via your data file.
		`;

		// Balance Calculation
		new Setting(containerEl)
			.setName('Balance start date')
			.setDesc('Set the date from which flextime balance is calculated. Earlier entries are ignored in balance calculations. Format: YYYY-MM-DD')
			.addText(text => text
				.setPlaceholder('2025-01-01')
				.setValue(this.plugin.settings.balanceStartDate)
				.onChange(async (value) => {
					// Validate date format
					if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
						const date = new Date(value);
						if (!isNaN(date.getTime())) {
							this.plugin.settings.balanceStartDate = value;
							await this.plugin.saveSettings();
							await this.refreshView();
						}
					}
				}));

		// Half-Day Settings
		new Setting(containerEl)
			.setName('Half-day calculation mode')
			.setDesc('How half-day hours should be calculated')
			.addDropdown(dropdown => dropdown
				.addOption('fixed', 'Fixed hours (set specific value)')
				.addOption('percentage', 'Percentage (half of base workday)')
				.setValue(this.plugin.settings.halfDayMode)
				.onChange(async (value: 'fixed' | 'percentage') => {
					this.plugin.settings.halfDayMode = value;
					await this.plugin.saveSettings();
					await this.refreshView();
					this.display(); // Refresh to show/hide fixed hours input
				}));

		if (this.plugin.settings.halfDayMode === 'fixed') {
			new Setting(containerEl)
				.setName('Half-day hours')
				.setDesc('Hours counted for a half workday')
				.addText(text => text
					.setPlaceholder('4.0')
					.setValue(this.plugin.settings.halfDayHours.toString())
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0 && num < this.plugin.settings.baseWorkday) {
							this.plugin.settings.halfDayHours = num;
							await this.plugin.saveSettings();
							await this.refreshView();
						}
					}));
		}

		// Balance Color Thresholds
		new Setting(containerEl)
			.setName('Balance color thresholds')
			.setDesc('Configure the hour thresholds for balance indicator colors. These control the color-coding of your flextime balance badge: Red = significant under/overtime, Yellow = approaching limits, Green = healthy balance.')
			.setHeading();

		new Setting(containerEl)
			.setName('Critical low threshold (red)')
			.setDesc('Below this many hours = red badge (significant undertime)')
			.addText(text => text
				.setPlaceholder('-15')
				.setValue(this.plugin.settings.balanceThresholds.criticalLow.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num < this.plugin.settings.balanceThresholds.warningLow) {
						this.plugin.settings.balanceThresholds.criticalLow = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		new Setting(containerEl)
			.setName('Warning low threshold (yellow)')
			.setDesc('Below this = yellow badge (approaching undertime)')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(this.plugin.settings.balanceThresholds.warningLow.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > this.plugin.settings.balanceThresholds.criticalLow && num < this.plugin.settings.balanceThresholds.warningHigh) {
						this.plugin.settings.balanceThresholds.warningLow = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		new Setting(containerEl)
			.setName('Warning high threshold (yellow)')
			.setDesc('Above this = yellow badge (approaching overtime limit)')
			.addText(text => text
				.setPlaceholder('80')
				.setValue(this.plugin.settings.balanceThresholds.warningHigh.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > this.plugin.settings.balanceThresholds.warningLow && num < this.plugin.settings.balanceThresholds.criticalHigh) {
						this.plugin.settings.balanceThresholds.warningHigh = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		new Setting(containerEl)
			.setName('Critical high threshold (red)')
			.setDesc('Above this = red badge (significant overtime accumulation)')
			.addText(text => text
				.setPlaceholder('95')
				.setValue(this.plugin.settings.balanceThresholds.criticalHigh.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > this.plugin.settings.balanceThresholds.warningHigh) {
						this.plugin.settings.balanceThresholds.criticalHigh = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		// Data Validation Thresholds
		new Setting(containerEl)
			.setName('Data validation thresholds')
			.setDesc('Automatic data quality checks. Adjust these if you frequently work long hours or want stricter validation.')
			.setHeading();

		new Setting(containerEl)
			.setName('Long-running timer warning (hours)')
			.setDesc('Warn if a timer runs more than X hours without being stopped (default: 12)')
			.addText(text => text
				.setPlaceholder('12')
				.setValue(this.plugin.settings.validationThresholds.longRunningTimerHours.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.validationThresholds.longRunningTimerHours = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Very long session warning (hours)')
			.setDesc('Warn if a work session exceeds X hours (default: 16)')
			.addText(text => text
				.setPlaceholder('16')
				.setValue(this.plugin.settings.validationThresholds.veryLongSessionHours.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.validationThresholds.veryLongSessionHours = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Maximum session duration (hours)')
			.setDesc('Prevent entries longer than X hours - likely a data error (default: 24)')
			.addText(text => text
				.setPlaceholder('24')
				.setValue(this.plugin.settings.validationThresholds.maxDurationHours.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.validationThresholds.maxDurationHours = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('High weekly total info (hours)')
			.setDesc('Show info notice if weekly total exceeds X hours (default: 60)')
			.addText(text => text
				.setPlaceholder('60')
				.setValue(this.plugin.settings.validationThresholds.highWeeklyTotalHours.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.validationThresholds.highWeeklyTotalHours = num;
						await this.plugin.saveSettings();
					}
				}));

		// File paths
		new Setting(containerEl).setName('File paths').setHeading();

		new Setting(containerEl)
			.setName('Data file path')
			.setDesc('Path to the file containing timer data and settings')
			.addText(text => text
				.setPlaceholder('timeflow/data.md')
				.setValue(this.plugin.settings.dataFilePath)
				.onChange(async (value) => {
					this.plugin.settings.dataFilePath = value;
					await this.plugin.saveSettings();
					// Update timer manager to use new path
					this.plugin.timerManager.dataFile = value;
				}));

		new Setting(containerEl)
			.setName('Holidays file path')
			.setDesc('Path to the file containing future planned days/holidays')
			.addText(text => text
				.setPlaceholder('timeflow/holidays.md')
				.setValue(this.plugin.settings.holidaysFilePath)
				.onChange(async (value) => {
					this.plugin.settings.holidaysFilePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Daily notes folder')
			.setDesc('Folder where daily notes are stored')
			.addText(text => text
				.setPlaceholder('Daily Notes')
				.setValue(this.plugin.settings.dailyNotesFolder)
				.onChange(async (value) => {
					this.plugin.settings.dailyNotesFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Daily notes template path')
			.setDesc('Path to the template for daily notes')
			.addText(text => text
				.setPlaceholder('Templates/Daily Notes Template.md')
				.setValue(this.plugin.settings.dailyNotesTemplatePath)
				.onChange(async (value) => {
					this.plugin.settings.dailyNotesTemplatePath = value;
					await this.plugin.saveSettings();
				}));

		// Display settings
		new Setting(containerEl).setName('Display settings').setHeading();

		new Setting(containerEl)
			.setName('Consecutive flextime warning days')
			.setDesc('Number of consecutive days with flextime before showing a warning')
			.addText(text => text
				.setPlaceholder('5')
				.setValue(this.plugin.settings.consecutiveFlextimeWarningDays.toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.consecutiveFlextimeWarningDays = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		new Setting(containerEl)
			.setName('Heatmap columns')
			.setDesc('Number of columns in the heatmap view (adjust for your screen width)')
			.addText(text => text
				.setPlaceholder('48')
				.setValue(this.plugin.settings.heatmapColumns.toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.heatmapColumns = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		new Setting(containerEl)
			.setName('Update interval (ms)')
			.setDesc('How often to update the dashboard data (in milliseconds)')
			.addText(text => text
				.setPlaceholder('30000')
				.setValue(this.plugin.settings.updateInterval.toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 1000) {
						this.plugin.settings.updateInterval = num;
						await this.plugin.saveSettings();
					}
				}));

		// Note types configuration
		new Setting(containerEl)
			.setName('Note types')
			.setDesc('Configure the types of notes available in the calendar context menu. Each note type can have its own template, folder, and filename pattern.')
			.setHeading();

		// Display existing note types
		this.plugin.settings.noteTypes.forEach((noteType, index) => {
			new Setting(containerEl)
				.setName(`${noteType.icon} ${noteType.label}`)
				.setDesc(`Folder: ${noteType.folder} | Template: ${noteType.template}`)
				.addButton(button => button
					.setButtonText('Edit')
					.onClick(() => {
						this.showNoteTypeModal(noteType, index);
					}))
				.addButton(button => button
					.setButtonText('Delete')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.noteTypes.splice(index, 1);
						await this.plugin.saveSettings();
						await this.refreshView();
						this.display(); // Refresh settings display
					}));
		});

		new Setting(containerEl)
			.setName('Add new note type')
			.setDesc('Create a new note type for the context menu')
			.addButton(button => button
				.setButtonText('+ Add note type')
				.setCta()
				.onClick(() => {
					this.showNoteTypeModal(null, -1);
				}));

		// Data management
		new Setting(containerEl).setName('Data management').setHeading();

		new Setting(containerEl)
			.setName('Export data to CSV')
			.setDesc('Export all your time tracking data to a CSV file')
			.addButton(button => button
				.setButtonText('Export CSV')
				.setCta()
				.onClick(async () => {
					this.exportToCSV();
				}));

		new Setting(containerEl)
			.setName('Import Timekeep data')
			.setDesc('Import time tracking data from Timekeep JSON format')
			.addButton(button => button
				.setButtonText('Import data')
				.setCta()
				.onClick(async () => {
					this.showImportModal();
				}));
	}

	exportToCSV(): void {
		// Get all entries from timer manager
		const entries = this.plugin.timerManager.convertToTimeEntries();
		const rows: string[][] = [['Name', 'Start Time', 'End Time', 'Duration (hours)']];

		entries.forEach((entry: any) => {
			if (entry.startTime && entry.endTime) {
				const start = new Date(entry.startTime);
				const end = new Date(entry.endTime);
				const durationHours = ((end.getTime() - start.getTime()) / (1000 * 60 * 60)).toFixed(2);

				rows.push([
					entry.name,
					start.toISOString(),
					end.toISOString(),
					durationHours
				]);
			}
		});

		const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `timeflow-export-${Utils.toLocalDateStr(new Date())}.csv`;
		a.click();
		URL.revokeObjectURL(url);

		new Notice('✅ Exported to CSV');
	}

	showImportModal(): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText('Import Timekeep Data');

		const { contentEl } = modal;

		contentEl.createEl('p', {
			text: 'Paste your Timekeep JSON data below. This can be from a timekeep codeblock or exported data.',
			cls: 'setting-item-description'
		});

		// Text area for JSON input
		const textArea = contentEl.createEl('textarea', {
			attr: {
				rows: '15',
				placeholder: '{"entries":[...]}'
			}
		});
		textArea.style.width = '100%';
		textArea.style.fontFamily = 'monospace';
		textArea.style.fontSize = '12px';
		textArea.style.marginBottom = '15px';

		// Info section
		const infoDiv = contentEl.createDiv();
		infoDiv.style.marginBottom = '15px';
		infoDiv.style.padding = '10px';
		infoDiv.style.background = 'var(--background-secondary)';
		infoDiv.style.borderRadius = '5px';

		infoDiv.createEl('strong', { text: '📋 How to get your data:' });
		const list = infoDiv.createEl('ul');
		list.createEl('li', { text: 'Open your file with Timekeep codeblocks' });
		list.createEl('li', { text: 'Copy the entire JSON from inside the timekeep block' });
		list.createEl('li', { text: 'Paste it in the text area above' });

		// Buttons
		const buttonDiv = contentEl.createDiv();
		buttonDiv.style.display = 'flex';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.justifyContent = 'flex-end';

		const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => modal.close();

		const importBtn = buttonDiv.createEl('button', { text: 'Import', cls: 'mod-cta' });
		importBtn.onclick = async () => {
			const jsonText = textArea.value.trim();
			if (!jsonText) {
				new Notice('⚠️ Please paste your Timekeep data');
				return;
			}

			try {
				// Try to parse JSON
				const data = JSON.parse(jsonText);

				// Validate structure
				if (!data.entries || !Array.isArray(data.entries)) {
					new Notice('⚠️ Invalid format: missing "entries" array');
					return;
				}

				// Validate at least one entry has the right structure
				if (data.entries.length > 0) {
					const firstEntry = data.entries[0];
					if (!firstEntry.hasOwnProperty('name') || !firstEntry.hasOwnProperty('startTime')) {
						new Notice('⚠️ Invalid entry format: missing required fields (name, startTime)');
						return;
					}
				}

				// Import the data (the function will show its own success/duplicate message)
				const success = await this.plugin.timerManager.importTimekeepData(jsonText);

				if (success) {
					modal.close();
					await this.refreshView();
				}

			} catch (error: any) {
				if (error instanceof SyntaxError) {
					new Notice('⚠️ Invalid JSON format. Please check your data.');
				} else {
					new Notice(`❌ Error: ${error.message}`);
				}
				console.error('Import error:', error);
			}
		};

		// Add keyboard shortcut hint
		const hint = contentEl.createEl('div');
		hint.style.marginTop = '10px';
		hint.style.fontSize = '12px';
		hint.style.color = 'var(--text-muted)';
		hint.textContent = '💡 Tip: You can also create "TimeFlow Data.md" manually in your vault root';

		modal.open();
	}

	showNoteTypeModal(noteType: NoteType | null, index: number): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText(noteType ? 'Edit Note Type' : 'Add Note Type');

		const { contentEl } = modal;

		// Create form fields
		const formData = {
			id: noteType?.id || '',
			label: noteType?.label || '',
			icon: noteType?.icon || '📄',
			folder: noteType?.folder || '',
			template: noteType?.template || '',
			tags: noteType?.tags.join(', ') || '',
			filenamePattern: noteType?.filenamePattern || '{YYYY}-{MM}-{DD}'
		};

		// ID field (only for new notes, readonly for existing)
		new Setting(contentEl)
			.setName('ID')
			.setDesc('Unique identifier for this note type (lowercase, no spaces)')
			.addText(text => {
				text.setPlaceholder('meeting')
					.setValue(formData.id)
					.onChange((value) => {
						formData.id = value.toLowerCase().replace(/\s+/g, '-');
					});

				if (noteType) {
					text.inputEl.disabled = true;
				}
			});

		// Label field
		new Setting(contentEl)
			.setName('Label')
			.setDesc('Display name shown in the context menu')
			.addText(text => text
				.setPlaceholder('Møtenotat')
				.setValue(formData.label)
				.onChange((value) => {
					formData.label = value;
				}));

		// Icon field
		new Setting(contentEl)
			.setName('Icon')
			.setDesc('Emoji or icon to display (single character)')
			.addText(text => text
				.setPlaceholder('👥')
				.setValue(formData.icon)
				.onChange((value) => {
					formData.icon = value;
				}));

		// Folder field
		new Setting(contentEl)
			.setName('Folder')
			.setDesc('Folder where notes will be created')
			.addText(text => text
				.setPlaceholder('Møter')
				.setValue(formData.folder)
				.onChange((value) => {
					formData.folder = value;
				}));

		// Template field
		new Setting(contentEl)
			.setName('Template Path')
			.setDesc('Path to the template file (relative to vault root)')
			.addText(text => text
				.setPlaceholder('timeflow/templates/meeting-note.md')
				.setValue(formData.template)
				.onChange((value) => {
					formData.template = value;
				}));

		// Tags field
		new Setting(contentEl)
			.setName('Tags')
			.setDesc('Comma-separated tags to add to notes (e.g., #møte, #timeflow)')
			.addText(text => text
				.setPlaceholder('#møte, #timeflow')
				.setValue(formData.tags)
				.onChange((value) => {
					formData.tags = value;
				}));

		// Filename pattern field
		new Setting(contentEl)
			.setName('Filename Pattern')
			.setDesc('Pattern for note filenames. Available: {YYYY}, {MM}, {DD}, {WEEK}')
			.addText(text => text
				.setPlaceholder('{YYYY}-{MM}-{DD} Møte')
				.setValue(formData.filenamePattern)
				.onChange((value) => {
					formData.filenamePattern = value;
				}));

		// Info section
		const infoDiv = contentEl.createDiv();
		infoDiv.style.marginTop = '15px';
		infoDiv.style.padding = '10px';
		infoDiv.style.background = 'var(--background-secondary)';
		infoDiv.style.borderRadius = '5px';
		infoDiv.style.fontSize = '0.9em';
		infoDiv.innerHTML = `
			<strong>📋 Pattern Variables:</strong>
			<ul style="margin: 8px 0 0 20px;">
				<li><code>{YYYY}</code> - Four-digit year (e.g., 2025)</li>
				<li><code>{MM}</code> - Two-digit month (e.g., 01)</li>
				<li><code>{DD}</code> - Two-digit day (e.g., 15)</li>
				<li><code>{WEEK}</code> - ISO week number (e.g., 07)</li>
			</ul>
		`;

		// Buttons
		const buttonDiv = contentEl.createDiv();
		buttonDiv.style.display = 'flex';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.justifyContent = 'flex-end';
		buttonDiv.style.marginTop = '20px';

		const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => modal.close();

		const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.onclick = async () => {
			// Validate required fields
			if (!formData.id || !formData.label || !formData.folder) {
				new Notice('⚠️ Please fill in all required fields (ID, Label, Folder)');
				return;
			}

			// Parse tags
			const tagsArray = formData.tags
				.split(',')
				.map(t => t.trim())
				.filter(t => t.length > 0);

			const newNoteType: NoteType = {
				id: formData.id,
				label: formData.label,
				icon: formData.icon || '📄',
				folder: formData.folder,
				template: formData.template,
				tags: tagsArray,
				filenamePattern: formData.filenamePattern || '{YYYY}-{MM}-{DD}'
			};

			// Add or update note type
			if (index >= 0) {
				// Edit existing
				this.plugin.settings.noteTypes[index] = newNoteType;
			} else {
				// Check if ID already exists
				const existingIndex = this.plugin.settings.noteTypes.findIndex(nt => nt.id === newNoteType.id);
				if (existingIndex >= 0) {
					new Notice('⚠️ A note type with this ID already exists');
					return;
				}
				// Add new
				this.plugin.settings.noteTypes.push(newNoteType);
			}

			await this.plugin.saveSettings();
			await this.refreshView();
			modal.close();
			this.display(); // Refresh settings display
			new Notice(`✅ Note type ${noteType ? 'updated' : 'added'} successfully`);
		};

		modal.open();
	}
}
