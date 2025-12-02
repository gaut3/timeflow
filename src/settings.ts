import { App, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import TimeFlowPlugin from './main';
import { Utils } from './utils';
import { ImportModal } from './importModal';
import { setLanguage, t } from './i18n';

export interface TimeFlowSettings {
	version: string;
	language: 'nb' | 'en';
	defaultViewLocation: 'sidebar' | 'main';
	hourUnit: 'h' | 't';
	showWeekNumbers: boolean;
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
	heatmapShowSpecialDayColors: boolean;
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
	// NEW: Custom colors
	customColors?: {
		balanceOk?: string;        // Default: #4caf50
		balanceWarning?: string;   // Default: #ff9800
		balanceCritical?: string;  // Default: #f44336
		progressBar?: string;      // Default: #4caf50
	};
	// Norwegian labor law compliance settings
	complianceSettings?: {
		enableWarnings: boolean;       // Enable/disable compliance warnings
		dailyHoursLimit: number;       // Max daily hours (default: 9)
		weeklyHoursLimit: number;      // Max weekly hours (default: 40)
		minimumRestHours: number;      // Minimum rest between sessions (default: 11)
	};
	// Migration flags
	hasTimestampMigration?: boolean; // True if UTC timestamps have been converted to local
}

export interface SpecialDayBehavior {
	id: string;                    // Unique identifier (e.g., "ferie")
	label: string;                 // Display name
	icon: string;                  // Emoji
	color: string;                 // Hex color for background (positive flextime for work types)
	textColor?: string;            // Hex color for text (default: #000000)
	negativeColor?: string;        // Hex color for negative flextime (work types only)
	negativeTextColor?: string;    // Hex color for text on negative flextime background
	simpleColor?: string;          // Hex color for work days when goal tracking is disabled
	simpleTextColor?: string;      // Hex color for text when goal tracking is disabled
	noHoursRequired?: boolean;     // No work hours required this day?
	countsAsWorkday?: boolean;     // Legacy: equivalent to noHoursRequired (for backwards compatibility)
	flextimeEffect: 'none' | 'withdraw' | 'accumulate';
	includeInStats: boolean;       // Count in yearly statistics?
	maxDaysPerYear?: number;       // Optional limit
	countingPeriod?: 'calendar' | 'rolling365'; // How to count max days: calendar year or rolling 365 days
	isWorkType?: boolean;          // True for regular work entry types (jobb), cannot be deleted
}

export const DEFAULT_SPECIAL_DAY_BEHAVIORS: SpecialDayBehavior[] = [
	{
		id: 'jobb',
		label: 'Jobb',
		icon: '💼',
		color: '#4caf50',           // Green for positive flextime (over goal)
		textColor: '#ffffff',
		negativeColor: '#64b5f6',   // Blue for negative flextime (under goal)
		negativeTextColor: '#000000',
		simpleColor: '#90caf9',     // Light blue for simple tracking mode
		simpleTextColor: '#000000',
		noHoursRequired: false,
		flextimeEffect: 'accumulate',
		includeInStats: true,
		isWorkType: true
	},
	{
		id: 'ferie',
		label: 'Ferie',
		icon: '🏖️',
		color: '#b3e5fc',
		textColor: '#000000',
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
		textColor: '#000000',
		noHoursRequired: true,
		flextimeEffect: 'withdraw',
		includeInStats: true
	},
	{
		id: 'egenmelding',
		label: 'Egenmelding',
		icon: '🤒',
		color: '#c8e6c9',
		textColor: '#000000',
		noHoursRequired: true,
		flextimeEffect: 'none',
		includeInStats: true,
		maxDaysPerYear: 24,
		countingPeriod: 'rolling365'
	},
	{
		id: 'sykemelding',
		label: 'Sykemelding',
		icon: '🏥',
		color: '#c8e6c9',
		textColor: '#000000',
		noHoursRequired: true,
		flextimeEffect: 'none',
		includeInStats: true
	},
	{
		id: 'velferdspermisjon',
		label: 'Velferdspermisjon',
		icon: '🏥',
		color: '#e1bee7',
		textColor: '#000000',
		noHoursRequired: true,
		flextimeEffect: 'none',
		includeInStats: true
	},
	{
		id: 'kurs',
		label: 'Kurs',
		icon: '📚',
		color: '#f8bbd0',
		textColor: '#000000',
		noHoursRequired: false,
		flextimeEffect: 'accumulate',
		includeInStats: true
	},
	{
		id: 'studie',
		label: 'Studie',
		icon: '📖',
		color: '#f8bbd0',
		textColor: '#000000',
		noHoursRequired: false,
		flextimeEffect: 'accumulate',
		includeInStats: true
	},
	{
		id: 'helligdag',
		label: 'Helligdag',
		icon: '🎉',
		color: '#ef5350',
		textColor: '#ffffff',
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
	language: "nb",
	defaultViewLocation: "sidebar",
	hourUnit: "t",
	showWeekNumbers: true,
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
	heatmapShowSpecialDayColors: false,
	noteTypes: [
		{
			id: "daily",
			label: "Daily Note",
			icon: "📅",
			folder: "Daily Notes",
			template: "timeflow/templates/daily-notes.md",
			tags: [],
			filenamePattern: "{YYYY}-{MM}-{DD}"
		},
		{
			id: "meeting",
			label: "Meeting Note",
			icon: "👥",
			folder: "Meetings",
			template: "timeflow/templates/meeting-note.md",
			tags: ["#meeting", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Meeting"
		},
		{
			id: "project",
			label: "Project Note",
			icon: "📋",
			folder: "Projects",
			template: "timeflow/templates/project-note.md",
			tags: ["#project", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Project"
		},
		{
			id: "review",
			label: "Weekly Review",
			icon: "🔍",
			folder: "Reviews",
			template: "timeflow/templates/weekly-review.md",
			tags: ["#review", "#weekly", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Week {WEEK}"
		},
		{
			id: "reflection",
			label: "Reflection Note",
			icon: "💭",
			folder: "Reflections",
			template: "timeflow/templates/reflection-note.md",
			tags: ["#reflection", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Reflection"
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
		highWeeklyTotalHours: 50
	},
	// NEW: Custom colors
	customColors: {
		balanceOk: "#4caf50",
		balanceWarning: "#ff9800",
		balanceCritical: "#f44336",
		progressBar: "#4caf50"
	},
	// Norwegian labor law compliance settings
	complianceSettings: {
		enableWarnings: true,
		dailyHoursLimit: 9,
		weeklyHoursLimit: 40,
		minimumRestHours: 11
	},
	// Migration flags
	hasTimestampMigration: false
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

		const isWorkType = this.behavior?.isWorkType ?? false;

		contentEl.createEl('h2', { text: isWorkType ? 'Edit Work Entry Type' : (this.behavior ? 'Edit Special Day Type' : 'Add Special Day Type') });

		// Add Norwegian term explanations if applicable
		if (this.behavior && !isWorkType) {
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
				infoBox.createSpan({ text: 'ℹ️ ' + explanation });
			}
		}

		// For work types, show a simpler info message
		if (isWorkType) {
			const infoBox = contentEl.createDiv({ cls: 'setting-item-description' });
			infoBox.style.padding = '10px';
			infoBox.style.marginBottom = '15px';
			infoBox.style.background = 'var(--background-secondary)';
			infoBox.style.borderRadius = '5px';
			infoBox.style.fontSize = '0.9em';
			infoBox.createSpan({ text: '💼 This is your regular work entry type. Customize its appearance in the calendar.' });
		}

		// Store form values
		const formData = {
			id: this.behavior?.id || '',
			label: this.behavior?.label || '',
			icon: this.behavior?.icon || '',
			color: this.behavior?.color || '#b3e5fc',
			textColor: this.behavior?.textColor || '#000000',
			negativeColor: this.behavior?.negativeColor || '#64b5f6',
			negativeTextColor: this.behavior?.negativeTextColor || '#000000',
			simpleColor: this.behavior?.simpleColor || '#90caf9',
			simpleTextColor: this.behavior?.simpleTextColor || '#000000',
			noHoursRequired: this.behavior?.noHoursRequired ?? true,
			flextimeEffect: this.behavior?.flextimeEffect || 'none',
			includeInStats: this.behavior?.includeInStats ?? true,
			maxDaysPerYear: this.behavior?.maxDaysPerYear || undefined,
			countingPeriod: this.behavior?.countingPeriod || 'calendar',
			isWorkType: isWorkType
		};

		// ID field (readonly if editing, hidden for work types)
		if (!isWorkType) {
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
		}

		// Label field
		new Setting(contentEl)
			.setName('Label')
			.setDesc('Display name shown in the dashboard')
			.addText(text => text
				.setPlaceholder(isWorkType ? 'Jobb' : 'Ferie')
				.setValue(formData.label)
				.onChange(value => formData.label = value));

		// Icon field
		new Setting(contentEl)
			.setName('Icon')
			.setDesc('Emoji to display')
			.addText(text => text
				.setPlaceholder(isWorkType ? '💼' : '🏖️')
				.setValue(formData.icon)
				.onChange(value => formData.icon = value));

		// Color fields - different labels for work types
		if (isWorkType) {
			// Positive flextime color (over goal)
			new Setting(contentEl)
				.setName('Positive flextime color')
				.setDesc('Background color when hours exceed daily goal (green gradient base)')
				.addColorPicker(color => color
					.setValue(formData.color)
					.onChange(value => formData.color = value));

			new Setting(contentEl)
				.setName('Positive flextime text color')
				.setDesc('Text color for positive flextime days')
				.addColorPicker(color => color
					.setValue(formData.textColor)
					.onChange(value => formData.textColor = value));

			// Negative flextime color (under goal)
			new Setting(contentEl)
				.setName('Negative flextime color')
				.setDesc('Background color when hours are below daily goal (blue gradient base)')
				.addColorPicker(color => color
					.setValue(formData.negativeColor)
					.onChange(value => formData.negativeColor = value));

			new Setting(contentEl)
				.setName('Negative flextime text color')
				.setDesc('Text color for negative flextime days')
				.addColorPicker(color => color
					.setValue(formData.negativeTextColor)
					.onChange(value => formData.negativeTextColor = value));

			// Separator for simple tracking mode colors
			contentEl.createEl('h4', { text: 'Simple tracking mode colors' });
			contentEl.createDiv({
				cls: 'setting-item-description',
				text: 'These colors are used when goal tracking is disabled.'
			}).style.marginBottom = '10px';

			new Setting(contentEl)
				.setName('Work day color')
				.setDesc('Background color for work days in simple tracking mode')
				.addColorPicker(color => color
					.setValue(formData.simpleColor)
					.onChange(value => formData.simpleColor = value));

			new Setting(contentEl)
				.setName('Work day text color')
				.setDesc('Text color for work days in simple tracking mode')
				.addColorPicker(color => color
					.setValue(formData.simpleTextColor)
					.onChange(value => formData.simpleTextColor = value));
		} else {
			// Regular color field for special days
			new Setting(contentEl)
				.setName('Color')
				.setDesc('Background color for this day type in calendar')
				.addColorPicker(color => color
					.setValue(formData.color)
					.onChange(value => formData.color = value));

			// Text color field
			new Setting(contentEl)
				.setName('Text color')
				.setDesc('Text color for this day type (use white for dark backgrounds)')
				.addColorPicker(color => color
					.setValue(formData.textColor)
					.onChange(value => formData.textColor = value));
		}

		// The following settings are hidden for work types
		if (!isWorkType) {
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

			// Counting period dropdown (only show if maxDaysPerYear is set)
			new Setting(contentEl)
				.setName('Counting period')
				.setDesc('How to count the max days limit. Calendar year resets each January 1st. Rolling 365 days counts backwards from today.')
				.addDropdown(dropdown => dropdown
					.addOption('calendar', 'Calendar year')
					.addOption('rolling365', 'Rolling 365 days')
					.setValue(formData.countingPeriod)
					.onChange(value => formData.countingPeriod = value as 'calendar' | 'rolling365'));
		}

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
				id: formData.isWorkType ? this.behavior!.id : formData.id, // Keep original ID for work types
				label: formData.label,
				icon: formData.icon,
				color: formData.color,
				textColor: formData.textColor,
				negativeColor: formData.isWorkType ? formData.negativeColor : undefined,
				negativeTextColor: formData.isWorkType ? formData.negativeTextColor : undefined,
				simpleColor: formData.isWorkType ? formData.simpleColor : undefined,
				simpleTextColor: formData.isWorkType ? formData.simpleTextColor : undefined,
				noHoursRequired: formData.isWorkType ? false : formData.noHoursRequired,
				flextimeEffect: formData.isWorkType ? 'accumulate' : formData.flextimeEffect,
				includeInStats: formData.isWorkType ? true : formData.includeInStats,
				maxDaysPerYear: formData.isWorkType ? undefined : formData.maxDaysPerYear,
				countingPeriod: formData.isWorkType ? undefined : formData.countingPeriod as 'calendar' | 'rolling365',
				isWorkType: formData.isWorkType
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

	private addResetButton(setting: Setting, settingKey: keyof TimeFlowSettings, defaultValue: any, refreshCallback?: () => void): void {
		setting.addExtraButton(button => button
			.setIcon("reset")
			.setTooltip("Reset to default")
			.onClick(async () => {
				(this.plugin.settings as any)[settingKey] = defaultValue;
				await this.plugin.saveSettings();
				this.display(); // Refresh settings UI
				if (refreshCallback) {
					await refreshCallback();
				}
			})
		);
	}

	private validateNumber(value: string, min: number, max: number, settingName: string): number | null {
		const num = parseFloat(value);

		if (isNaN(num)) {
			new Notice(`❌ ${settingName}: Please enter a valid number`);
			return null;
		}
		if (num < min) {
			new Notice(`❌ ${settingName}: Value must be at least ${min}`);
			return null;
		}
		if (num > max) {
			new Notice(`❌ ${settingName}: Value must be at most ${max}`);
			return null;
		}

		return num;
	}

	private validateDateFormat(dateStr: string): boolean {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
			new Notice("❌ Balance start date: Format must be YYYY-MM-DD");
			return false;
		}

		const date = new Date(dateStr + 'T00:00:00');
		if (isNaN(date.getTime())) {
			new Notice("❌ Balance start date: Invalid date");
			return false;
		}

		if (date > new Date()) {
			new Notice("❌ Balance start date: Cannot be in the future");
			return false;
		}

		return true;
	}

	private createCollapsibleSubsection(
		container: HTMLElement,
		title: string,
		startOpen: boolean = false
	): { header: HTMLElement; content: HTMLElement } {
		const header = container.createDiv({
			cls: startOpen ? 'tf-collapsible-subsection open' : 'tf-collapsible-subsection'
		});
		header.createSpan({ text: title });

		const content = container.createDiv({
			cls: startOpen ? 'tf-collapsible-content open' : 'tf-collapsible-content'
		});

		header.onclick = () => {
			header.classList.toggle('open');
			content.classList.toggle('open');
		};

		return { header, content };
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "timeflow Settings" });

		// NEW: Search box
		const searchContainer = containerEl.createDiv({ cls: "tf-settings-search" });
		const searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "🔍 Search settings...",
			cls: "tf-search-input"
		});

		// Container for all settings (will be filtered)
		const settingsContainer = containerEl.createDiv({ cls: "tf-settings-container" });

		// Add search logic
		searchInput.addEventListener("input", () => {
			const query = searchInput.value.toLowerCase();
			const allSettings = settingsContainer.querySelectorAll(".setting-item");

			allSettings.forEach((setting: HTMLElement) => {
				const name = setting.querySelector(".setting-item-name")?.textContent?.toLowerCase() || "";
				const desc = setting.querySelector(".setting-item-description")?.textContent?.toLowerCase() || "";

				if (name.includes(query) || desc.includes(query)) {
					setting.style.display = "";
				} else {
					setting.style.display = "none";
				}
			});
		});

		// ============================================================
		// SECTION 1: QUICK START
		// ============================================================
		new Setting(settingsContainer)
			.setName('Quick Start')
			.setDesc('Essential settings to get started with timeflow')
			.setHeading();

		// Settings sync info
		const syncInfo = settingsContainer.createDiv();
		syncInfo.style.marginBottom = '15px';
		syncInfo.style.padding = '10px';
		syncInfo.style.background = 'var(--background-secondary)';
		syncInfo.style.borderRadius = '5px';
		syncInfo.style.fontSize = '0.9em';
		syncInfo.createEl('strong', { text: '📱 Cross-Device Settings Sync' });
		syncInfo.createEl('br');
		syncInfo.appendText('Settings are automatically saved to ');
		syncInfo.createEl('code', { text: 'timeflow/data.md' });
		syncInfo.appendText(' and will sync across devices when using Obsidian Sync or any other vault sync solution. When you open the plugin on another device, your settings will be automatically loaded.');

		// Language selector
		new Setting(settingsContainer)
			.setName('Language / Språk')
			.setDesc('Interface language / Grensesnittspråk')
			.addDropdown(dropdown => dropdown
				.addOption('nb', 'Norsk')
				.addOption('en', 'English')
				.setValue(this.plugin.settings.language)
				.onChange(async (value: 'nb' | 'en') => {
					this.plugin.settings.language = value;
					setLanguage(value);
					await this.plugin.saveSettings();
					this.display(); // Refresh settings UI
					await this.refreshView(); // Refresh dashboard
				}));

		new Setting(settingsContainer)
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

		new Setting(settingsContainer)
			.setName('Holidays file path')
			.setDesc('Path to the file containing future planned days/holidays')
			.addText(text => text
				.setPlaceholder('timeflow/holidays.md')
				.setValue(this.plugin.settings.holidaysFilePath)
				.onChange(async (value) => {
					this.plugin.settings.holidaysFilePath = value;
					await this.plugin.saveSettings();
				}));

		// ============================================================
		// SECTION 2: WORK CONFIGURATION
		// ============================================================
		new Setting(settingsContainer)
			.setName('Work Configuration')
			.setDesc('Configure your work schedule and goals')
			.setHeading();

		// Goal Tracking Mode Toggle - MUST be at top of work configuration
		new Setting(settingsContainer)
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
			new Setting(settingsContainer)
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

			// Only show weekly goals toggle if goal tracking is enabled
			new Setting(settingsContainer)
				.setName('Enable weekly goals')
				.setDesc('Disable if you don\'t have a specific amount of work each week. This will hide goal progress bars and weekly targets.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.enableWeeklyGoals)
					.onChange(async (value) => {
						this.plugin.settings.enableWeeklyGoals = value;
						await this.plugin.saveSettings();
						this.display(); // Refresh to show/hide baseWorkweek
					}));

			// Only show work percentage and baseWorkweek if weekly goals are enabled
			if (this.plugin.settings.enableWeeklyGoals) {
				new Setting(settingsContainer)
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

				new Setting(settingsContainer)
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

			new Setting(settingsContainer)
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
			const workDaysSetting = new Setting(settingsContainer)
				.setName('Work days')
				.setDesc('Select which days are part of your work week');

			const workDaysContainer = settingsContainer.createDiv();
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
			new Setting(settingsContainer)
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
				const altWorkDaysSetting = new Setting(settingsContainer)
					.setName('Alternating week work days')
					.setDesc('Select which days are work days in the alternating week');

				const altWorkDaysContainer = settingsContainer.createDiv();
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

		// Compliance warnings subsection
		const complianceSection = this.createCollapsibleSubsection(
			settingsContainer,
			'Work Time Limits',
			false
		);
		complianceSection.content.addClass('tf-compliance-settings');

		new Setting(complianceSection.content)
			.setName('Enable compliance warnings')
			.setDesc('Show warnings when approaching or exceeding Norwegian labor law limits')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.complianceSettings?.enableWarnings ?? true)
				.onChange(async (value) => {
					if (!this.plugin.settings.complianceSettings) {
						this.plugin.settings.complianceSettings = {
							enableWarnings: true,
							dailyHoursLimit: 9,
							weeklyHoursLimit: 40,
							minimumRestHours: 11
						};
					}
					this.plugin.settings.complianceSettings.enableWarnings = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(complianceSection.content)
			.setName('Daily hours limit')
			.setDesc('Maximum hours per day before showing a warning (Norwegian law: 9 hours)')
			.addText(text => text
				.setPlaceholder('9')
				.setValue((this.plugin.settings.complianceSettings?.dailyHoursLimit ?? 9).toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						if (!this.plugin.settings.complianceSettings) {
							this.plugin.settings.complianceSettings = {
								enableWarnings: true,
								dailyHoursLimit: 9,
								weeklyHoursLimit: 40,
								minimumRestHours: 11
							};
						}
						this.plugin.settings.complianceSettings.dailyHoursLimit = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		new Setting(complianceSection.content)
			.setName('Weekly hours limit')
			.setDesc('Maximum hours per week before showing a warning (Norwegian law: 40 hours)')
			.addText(text => text
				.setPlaceholder('40')
				.setValue((this.plugin.settings.complianceSettings?.weeklyHoursLimit ?? 40).toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						if (!this.plugin.settings.complianceSettings) {
							this.plugin.settings.complianceSettings = {
								enableWarnings: true,
								dailyHoursLimit: 9,
								weeklyHoursLimit: 40,
								minimumRestHours: 11
							};
						}
						this.plugin.settings.complianceSettings.weeklyHoursLimit = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		new Setting(complianceSection.content)
			.setName('Minimum rest hours')
			.setDesc('Minimum consecutive hours of rest between work sessions (Norwegian law: 11 hours)')
			.addText(text => text
				.setPlaceholder('11')
				.setValue((this.plugin.settings.complianceSettings?.minimumRestHours ?? 11).toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						if (!this.plugin.settings.complianceSettings) {
							this.plugin.settings.complianceSettings = {
								enableWarnings: true,
								dailyHoursLimit: 9,
								weeklyHoursLimit: 40,
								minimumRestHours: 11
							};
						}
						this.plugin.settings.complianceSettings.minimumRestHours = num;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		// ============================================================
		// SECTION 3: ENTRY TYPES
		// ============================================================

		// Helper function to get behavior description
		const getBehaviorDescription = (behavior: SpecialDayBehavior): string => {
			const parts: string[] = [];

			// Workday status
			if (behavior.isWorkType) {
				parts.push('Regular work entry');
			} else {
				parts.push(behavior.noHoursRequired ? 'No hours required' : 'Regular workday applies');
			}

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

		// Separate work types from special day types
		const workTypes = this.plugin.settings.specialDayBehaviors.filter(b => b.isWorkType || b.id === 'jobb');
		const specialDays = this.plugin.settings.specialDayBehaviors.filter(b => !b.isWorkType && b.id !== 'jobb');

		// Work Entry Types section
		new Setting(settingsContainer)
			.setName('Work Entry Type')
			.setDesc('Configure the appearance of your regular work entries')
			.setHeading();

		workTypes.forEach((behavior) => {
			const index = this.plugin.settings.specialDayBehaviors.findIndex(b => b.id === behavior.id);

			new Setting(settingsContainer)
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
					}));
		});

		// Special Day Types section
		new Setting(settingsContainer)
			.setName('Special Day Types')
			.setDesc('Configure how different types of special days affect your workday and flextime balance. These settings determine how days are counted in flextime calculations.')
			.setHeading();

		// List special day behaviors (excluding work types)
		specialDays.forEach((behavior) => {
			const index = this.plugin.settings.specialDayBehaviors.findIndex(b => b.id === behavior.id);

			new Setting(settingsContainer)
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
		new Setting(settingsContainer)
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

		// ============================================================
		// SECTION 4: DISPLAY & INTERFACE
		// ============================================================
		new Setting(settingsContainer)
			.setName('Display & Interface')
			.setDesc('Customize the appearance and behavior of the timeflow interface')
			.setHeading();

		new Setting(settingsContainer)
			.setName('Default view location')
			.setDesc('Choose where timeflow opens by default')
			.addDropdown(dropdown => dropdown
				.addOption('sidebar', 'Sidebar (right panel)')
				.addOption('main', 'Main area (as a tab)')
				.setValue(this.plugin.settings.defaultViewLocation)
				.onChange(async (value: 'sidebar' | 'main') => {
					this.plugin.settings.defaultViewLocation = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainer)
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

		new Setting(settingsContainer)
			.setName('Show week numbers')
			.setDesc('Show week numbers in calendar and week card (ISO 8601 week numbers)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showWeekNumbers ?? true)
				.onChange(async (value) => {
					this.plugin.settings.showWeekNumbers = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(settingsContainer)
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

		new Setting(settingsContainer)
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

		new Setting(settingsContainer)
			.setName('Heatmap special day colors')
			.setDesc('Show special day colors (ferie, egenmelding, etc.) instead of flextime gradient in heatmap')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.heatmapShowSpecialDayColors)
				.onChange(async (value) => {
					this.plugin.settings.heatmapShowSpecialDayColors = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(settingsContainer)
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

		// ============================================================
		// SECTION 5: FILE PATHS & TEMPLATES
		// ============================================================
		new Setting(settingsContainer)
			.setName('File Paths & Templates')
			.setDesc('Configure file paths and note templates')
			.setHeading();

		new Setting(settingsContainer)
			.setName('Daily notes folder')
			.setDesc('Folder where daily notes are stored')
			.addText(text => text
				.setPlaceholder('Daily Notes')
				.setValue(this.plugin.settings.dailyNotesFolder)
				.onChange(async (value) => {
					this.plugin.settings.dailyNotesFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainer)
			.setName('Daily notes template path')
			.setDesc('Path to the template for daily notes')
			.addText(text => text
				.setPlaceholder('Templates/Daily Notes Template.md')
				.setValue(this.plugin.settings.dailyNotesTemplatePath)
				.onChange(async (value) => {
					this.plugin.settings.dailyNotesTemplatePath = value;
					await this.plugin.saveSettings();
				}));

		// Note types configuration
		new Setting(settingsContainer)
			.setName('Note types')
			.setDesc('Configure the types of notes available in the calendar context menu. Each note type can have its own template, folder, and filename pattern.')
			.setHeading();

		// Display existing note types
		this.plugin.settings.noteTypes.forEach((noteType, index) => {
			new Setting(settingsContainer)
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

		new Setting(settingsContainer)
			.setName('Add new note type')
			.setDesc('Create a new note type for the context menu')
			.addButton(button => button
				.setButtonText('+ Add note type')
				.setCta()
				.onClick(() => {
					this.showNoteTypeModal(null, -1);
				}));

		// ============================================================
		// SECTION 6: DATA MANAGEMENT
		// ============================================================
		new Setting(settingsContainer)
			.setName('Data Management')
			.setDesc('Import and export your time tracking data')
			.setHeading();

		new Setting(settingsContainer)
			.setName('Export data to CSV')
			.setDesc('Export all your time tracking data to a CSV file')
			.addButton(button => button
				.setButtonText('Export CSV')
				.setCta()
				.onClick(async () => {
					this.exportToCSV();
				}));

		new Setting(settingsContainer)
			.setName(t('settings.importData'))
			.setDesc(t('settings.importDataDesc'))
			.addButton(button => button
				.setButtonText(t('settings.importData'))
				.setCta()
				.onClick(async () => {
					this.showImportModal();
				}));

		// ============================================================
		// SECTION 7: ADVANCED SETTINGS
		// ============================================================
		new Setting(settingsContainer)
			.setName('Advanced Settings')
			.setDesc('Fine-tune balance calculations, thresholds, and visual customization')
			.setHeading();

		const advancedInfo = settingsContainer.createDiv();
		advancedInfo.style.marginBottom = '15px';
		advancedInfo.style.padding = '10px';
		advancedInfo.style.background = 'var(--background-secondary)';
		advancedInfo.style.borderRadius = '5px';
		advancedInfo.style.fontSize = '0.9em';
		advancedInfo.createEl('strong', { text: '⚙️ Advanced Settings' });
		advancedInfo.createEl('br');
		advancedInfo.appendText('These settings affect balance calculations and visual indicators. Settings sync across devices via your data file.');

		// Balance Calculation subsection (collapsible)
		const balanceCalcSection = this.createCollapsibleSubsection(
			settingsContainer,
			'Balance Calculation',
			false
		);

		new Setting(balanceCalcSection.content)
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

		new Setting(balanceCalcSection.content)
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
			new Setting(balanceCalcSection.content)
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

		// Balance Thresholds subsection (collapsible)
		const balanceThresholdsSection = this.createCollapsibleSubsection(
			settingsContainer,
			'Balance Color Thresholds',
			false
		);

		new Setting(balanceThresholdsSection.content)
			.setName('Balance color thresholds')
			.setDesc('Configure the hour thresholds for balance indicator colors. These control the color-coding of your flextime balance badge: Red = significant under/overtime, Yellow = approaching limits, Green = healthy balance.');

		new Setting(balanceThresholdsSection.content)
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

		new Setting(balanceThresholdsSection.content)
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

		new Setting(balanceThresholdsSection.content)
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

		new Setting(balanceThresholdsSection.content)
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

		// Data Validation subsection (collapsible)
		const dataValidationSection = this.createCollapsibleSubsection(
			settingsContainer,
			'Data Validation Thresholds',
			false
		);

		new Setting(dataValidationSection.content)
			.setName('Data validation thresholds')
			.setDesc('Automatic data quality checks. Adjust these if you frequently work long hours or want stricter validation.');

		new Setting(dataValidationSection.content)
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

		new Setting(dataValidationSection.content)
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

		new Setting(dataValidationSection.content)
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

		new Setting(dataValidationSection.content)
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

		// Custom Colors subsection (collapsible)
		const customColorsSection = this.createCollapsibleSubsection(
			settingsContainer,
			'Custom Colors',
			false
		);

		const balanceOkSetting = new Setting(customColorsSection.content)
			.setName('Balance OK color')
			.setDesc('Color when flextime balance is in acceptable range')
			.addText(text => text
				.setPlaceholder('#4caf50')
				.setValue(this.plugin.settings.customColors?.balanceOk || '#4caf50')
				.onChange(async (value) => {
					if (!this.plugin.settings.customColors) {
						this.plugin.settings.customColors = {};
					}
					this.plugin.settings.customColors.balanceOk = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));
		balanceOkSetting.addExtraButton(button => button
			.setIcon("reset")
			.setTooltip("Reset to default")
			.onClick(async () => {
				if (!this.plugin.settings.customColors) {
					this.plugin.settings.customColors = {};
				}
				this.plugin.settings.customColors.balanceOk = DEFAULT_SETTINGS.customColors!.balanceOk!;
				await this.plugin.saveSettings();
				this.display();
				await this.refreshView();
			})
		);

		const balanceWarningSetting = new Setting(customColorsSection.content)
			.setName('Balance warning color')
			.setDesc('Color when flextime balance is approaching limits')
			.addText(text => text
				.setPlaceholder('#ff9800')
				.setValue(this.plugin.settings.customColors?.balanceWarning || '#ff9800')
				.onChange(async (value) => {
					if (!this.plugin.settings.customColors) {
						this.plugin.settings.customColors = {};
					}
					this.plugin.settings.customColors.balanceWarning = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));
		balanceWarningSetting.addExtraButton(button => button
			.setIcon("reset")
			.setTooltip("Reset to default")
			.onClick(async () => {
				if (!this.plugin.settings.customColors) {
					this.plugin.settings.customColors = {};
				}
				this.plugin.settings.customColors.balanceWarning = DEFAULT_SETTINGS.customColors!.balanceWarning!;
				await this.plugin.saveSettings();
				this.display();
				await this.refreshView();
			})
		);

		const balanceCriticalSetting = new Setting(customColorsSection.content)
			.setName('Balance critical color')
			.setDesc('Color when flextime balance is critically out of range')
			.addText(text => text
				.setPlaceholder('#f44336')
				.setValue(this.plugin.settings.customColors?.balanceCritical || '#f44336')
				.onChange(async (value) => {
					if (!this.plugin.settings.customColors) {
						this.plugin.settings.customColors = {};
					}
					this.plugin.settings.customColors.balanceCritical = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));
		balanceCriticalSetting.addExtraButton(button => button
			.setIcon("reset")
			.setTooltip("Reset to default")
			.onClick(async () => {
				if (!this.plugin.settings.customColors) {
					this.plugin.settings.customColors = {};
				}
				this.plugin.settings.customColors.balanceCritical = DEFAULT_SETTINGS.customColors!.balanceCritical!;
				await this.plugin.saveSettings();
				this.display();
				await this.refreshView();
			})
		);

		const progressBarSetting = new Setting(customColorsSection.content)
			.setName('Progress bar color')
			.setDesc('Color for progress bars showing daily/weekly completion')
			.addText(text => text
				.setPlaceholder('#4caf50')
				.setValue(this.plugin.settings.customColors?.progressBar || '#4caf50')
				.onChange(async (value) => {
					if (!this.plugin.settings.customColors) {
						this.plugin.settings.customColors = {};
					}
					this.plugin.settings.customColors.progressBar = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));
		progressBarSetting.addExtraButton(button => button
			.setIcon("reset")
			.setTooltip("Reset to default")
			.onClick(async () => {
				if (!this.plugin.settings.customColors) {
					this.plugin.settings.customColors = {};
				}
				this.plugin.settings.customColors.progressBar = DEFAULT_SETTINGS.customColors!.progressBar!;
				await this.plugin.saveSettings();
				this.display();
				await this.refreshView();
			})
		);
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
		new ImportModal(this.app, this.plugin.timerManager, async () => {
			await this.refreshView();
		}).open();
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
		infoDiv.createEl('strong', { text: '📋 Pattern Variables:' });
		const ul = infoDiv.createEl('ul');
		ul.style.margin = '8px 0 0 20px';
		const patterns = [
			['{YYYY}', 'Four-digit year (e.g., 2025)'],
			['{MM}', 'Two-digit month (e.g., 01)'],
			['{DD}', 'Two-digit day (e.g., 15)'],
			['{WEEK}', 'ISO week number (e.g., 07)']
		];
		patterns.forEach(([code, desc]) => {
			const li = ul.createEl('li');
			li.createEl('code', { text: code });
			li.appendText(' - ' + desc);
		});

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
