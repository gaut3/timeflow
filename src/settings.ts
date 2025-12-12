import { App, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import TimeFlowPlugin from './main';
import { Utils } from './utils';
import { ImportModal } from './importModal';
import { setLanguage, t, translateAnnetTemplateName } from './i18n';
import type { TimeEntry } from './dataManager';

export interface TimeFlowSettings {
	version: string;
	language: 'nb' | 'en';
	defaultViewLocation: 'sidebar' | 'main';
	hourUnit: 'h' | 't';
	showWeekNumbers: boolean;
	hideEmptyStats: boolean;
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
	annetTemplates: AnnetTemplate[];
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
	// Work schedule history - periods with different work configurations
	workScheduleHistory?: WorkSchedulePeriod[];
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
	flextimeEffect: 'none' | 'withdraw' | 'accumulate' | 'reduce_goal';
	includeInStats: boolean;       // Count in yearly statistics?
	maxDaysPerYear?: number;       // Optional limit
	countingPeriod?: 'calendar' | 'rolling365'; // How to count max days: calendar year or rolling 365 days
	isWorkType?: boolean;          // True for regular work entry types (jobb), cannot be deleted
	showInTimerDropdown?: boolean; // Show this type in the timer start dropdown menu
}

export const DEFAULT_SPECIAL_DAY_BEHAVIORS: SpecialDayBehavior[] = [
	{
		id: 'jobb',
		label: 'Jobb',
		icon: '💼',
		color: '#4caf50',           // Green for positive flextime (over goal)
		textColor: '#ffffff',
		negativeColor: '#64b5f6',   // Blue for negative flextime (under goal)
		negativeTextColor: '#ffffff',
		simpleColor: '#90caf9',     // Light blue for simple tracking mode
		simpleTextColor: '#000000',
		noHoursRequired: false,
		flextimeEffect: 'accumulate',
		includeInStats: true,
		isWorkType: true,
		showInTimerDropdown: true
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
		noHoursRequired: false,  // Can have hours (partial sick day)
		flextimeEffect: 'reduce_goal',  // Hours reduce daily goal
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
		noHoursRequired: false,  // Can have hours (partial sick day)
		flextimeEffect: 'reduce_goal',  // Hours reduce daily goal
		includeInStats: true
	},
	{
		id: 'velferdspermisjon',
		label: 'Velferdspermisjon',
		icon: '🏥',
		color: '#e1bee7',
		textColor: '#000000',
		noHoursRequired: false,  // Can have hours (partial day)
		flextimeEffect: 'reduce_goal',  // Hours reduce daily goal
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
		includeInStats: true,
		showInTimerDropdown: true
	},
	{
		id: 'studie',
		label: 'Studie',
		icon: '📖',
		color: '#f8bbd0',
		textColor: '#000000',
		noHoursRequired: false,
		flextimeEffect: 'accumulate',
		includeInStats: true,
		showInTimerDropdown: true
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
	},
	{
		id: 'annet',
		label: 'Other',
		icon: '📋',
		color: '#e0e0e0',
		textColor: '#000000',
		noHoursRequired: false,  // Dynamic - determined at parse time based on entry format
		flextimeEffect: 'reduce_goal',  // Dynamic - determined at parse time
		includeInStats: false
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

export interface AnnetTemplate {
	id: string;      // "lege", "tannlege", "begravelse"
	label: string;   // Display name
	icon: string;    // Emoji icon
}

export const DEFAULT_ANNET_TEMPLATES: AnnetTemplate[] = [
	{ id: 'doctor', label: 'Doctor', icon: '🏥' },
	{ id: 'dentist', label: 'Dentist', icon: '🦷' },
	{ id: 'funeral', label: 'Funeral', icon: '⚫' },
];

export interface WorkSchedulePeriod {
	effectiveFrom: string;  // ISO date "YYYY-MM-DD"
	workPercent: number;
	baseWorkday: number;
	baseWorkweek: number;
	workDays: number[];     // 0=Sunday, 1=Monday, ..., 6=Saturday
	halfDayHours: number;
}

export const DEFAULT_SETTINGS: TimeFlowSettings = {
	version: "1.2.2",
	language: "nb",
	defaultViewLocation: "sidebar",
	hourUnit: "t",
	showWeekNumbers: true,
	hideEmptyStats: false,
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
	updateInterval: 30,
	clockInterval: 1,
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
	annetTemplates: DEFAULT_ANNET_TEMPLATES,
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

/**
 * Generic confirmation modal that replaces browser confirm().
 */
export class ConfirmModal extends Modal {
	message: string;
	onConfirm: () => void | Promise<void>;
	title: string;

	constructor(app: App, message: string, onConfirm: () => void | Promise<void>, title?: string) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
		this.title = title || t('buttons.confirm');
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('tf-confirm-modal');

		contentEl.createEl('h3', { text: this.title });
		contentEl.createEl('p', { text: this.message });

		const buttonDiv = contentEl.createDiv({ cls: 'tf-btn-container' });

		const cancelBtn = buttonDiv.createEl('button', { text: t('buttons.cancel') });
		cancelBtn.onclick = () => this.close();

		const confirmBtn = buttonDiv.createEl('button', { text: t('buttons.confirm'), cls: 'mod-cta mod-warning' });
		confirmBtn.onclick = () => {
			this.close();
			void this.onConfirm();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class SpecialDayBehaviorModal extends Modal {
	behavior: SpecialDayBehavior | null;
	index: number;
	plugin: TimeFlowPlugin;
	onSave: (behavior: SpecialDayBehavior, index: number) => void | Promise<void>;

	constructor(
		app: App,
		plugin: TimeFlowPlugin,
		behavior: SpecialDayBehavior | null,
		index: number,
		onSave: (behavior: SpecialDayBehavior, index: number) => void | Promise<void>
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

		contentEl.createEl('h2', { text: isWorkType ? 'Edit work entry type' : (this.behavior ? 'Edit absence type' : 'Add absence type') });

		// Add Norwegian term explanations if applicable
		if (this.behavior && !isWorkType) {
			const norwegianTerms: Record<string, string> = {
				'egenmelding': 'Norwegian self-reported sick leave (max 8 days/year per Norwegian labor law)',
				'velferdspermisjon': 'Norwegian welfare leave for personal/family health matters',
				'avspasering': 'Norwegian term: Time off as compensation for accumulated flextime'
			};

			const explanation = norwegianTerms[this.behavior.id];
			if (explanation) {
				const infoBox = contentEl.createDiv({ cls: 'setting-item-description tf-settings-info-box' });
				infoBox.createSpan({ text: 'ℹ️ ' + explanation });
			}
		}

		// For work types, show a simpler info message
		if (isWorkType) {
			const infoBox = contentEl.createDiv({ cls: 'setting-item-description tf-settings-info-box' });
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
			negativeTextColor: this.behavior?.negativeTextColor || '#ffffff',
			simpleColor: this.behavior?.simpleColor || '#90caf9',
			simpleTextColor: this.behavior?.simpleTextColor || '#000000',
			noHoursRequired: this.behavior?.noHoursRequired ?? false,
			flextimeEffect: this.behavior?.flextimeEffect || 'none',
			includeInStats: this.behavior?.includeInStats ?? true,
			maxDaysPerYear: this.behavior?.maxDaysPerYear || undefined,
			countingPeriod: this.behavior?.countingPeriod || 'calendar',
			isWorkType: isWorkType,
			// Default to true for jobb, studie, kurs if not explicitly set
			showInTimerDropdown: this.behavior?.showInTimerDropdown ?? ['jobb', 'studie', 'kurs'].includes(this.behavior?.id || '')
		};

		// ID field (readonly if editing, hidden for work types)
		if (!isWorkType) {
			new Setting(contentEl)
				.setName('ID')
				.setDesc('Unique identifier (lowercase, no spaces). Used in holiday file format.')
				.addText(text => {
					text
						.setPlaceholder('Vacation')
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
				cls: 'setting-item-description tf-settings-info-box mb-10',
				text: 'These colors are used when goal tracking is disabled.'
			});

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
			// Regular color field for absence types
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
					.addOption('reduce_goal', 'Reduce goal (hours reduce daily goal, for sick days)')
					.setValue(formData.flextimeEffect)
					.onChange(value => formData.flextimeEffect = value as 'none' | 'withdraw' | 'accumulate' | 'reduce_goal'));

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
				.setDesc('How to count the max days limit. The calendar year option resets each january 1st, while rolling 365 days counts backwards from today.')
				.addDropdown(dropdown => dropdown
					.addOption('calendar', 'Calendar year')
					.addOption('rolling365', 'Rolling 365 days')
					.setValue(formData.countingPeriod)
					.onChange(value => formData.countingPeriod = value as 'calendar' | 'rolling365'));
		}

		// Show in timer dropdown toggle (available for all types)
		new Setting(contentEl)
			.setName('Show in timer dropdown')
			.setDesc('Include this type in the quick-start timer menu')
			.addToggle(toggle => toggle
				.setValue(formData.showInTimerDropdown)
				.onChange(value => formData.showInTimerDropdown = value));

		// Buttons
		const buttonDiv = contentEl.createDiv({ cls: 'tf-settings-button-row' });

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
				new Notice('⚠️ a label is required');
				return;
			}
			if (!formData.icon) {
				new Notice('⚠️ an icon is required');
				return;
			}

			// Check for duplicate IDs (only when adding new or changing ID)
			if (!this.behavior || this.behavior.id !== formData.id) {
				const isDuplicate = this.plugin.settings.specialDayBehaviors.some(
					(b, i) => b.id === formData.id && i !== this.index
				);
				if (isDuplicate) {
					new Notice('⚠️ an absence type with this ID already exists');
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
				countingPeriod: formData.isWorkType ? undefined : formData.countingPeriod,
				isWorkType: formData.isWorkType,
				showInTimerDropdown: formData.showInTimerDropdown
			};

			void this.onSave(behavior, this.index);
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class AnnetTemplateModal extends Modal {
	template: AnnetTemplate | null;
	index: number;
	plugin: TimeFlowPlugin;
	onSave: (template: AnnetTemplate, index: number) => void | Promise<void>;

	constructor(
		app: App,
		plugin: TimeFlowPlugin,
		template: AnnetTemplate | null,
		index: number,
		onSave: (template: AnnetTemplate, index: number) => void | Promise<void>
	) {
		super(app);
		this.plugin = plugin;
		this.template = template;
		this.index = index;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.template ? t('annet.editTemplate') : t('annet.addTemplate') });

		// Info box explaining annet templates
		const infoBox = contentEl.createDiv({ cls: 'setting-item-description tf-settings-info-box' });
		infoBox.createSpan({ text: t('annet.templateDescription') });

		// Store form values
		const formData = {
			id: this.template?.id || '',
			label: this.template?.label || '',
			icon: this.template?.icon || '📋',
		};

		// ID field (readonly if editing)
		new Setting(contentEl)
			.setName('ID')
			.setDesc(t('annet.idDesc'))
			.addText(text => {
				text
					.setPlaceholder('Doctor')
					.setValue(formData.id)
					.onChange(value => formData.id = value.toLowerCase().replace(/\s+/g, ''));
				if (this.template) {
					text.setDisabled(true); // Can't change ID when editing
				}
			});

		// Label field
		new Setting(contentEl)
			.setName(t('annet.labelField'))
			.setDesc(t('annet.labelDesc'))
			.addText(text => text
				.setPlaceholder(t('annet.labelPlaceholder'))
				.setValue(formData.label)
				.onChange(value => formData.label = value));

		// Icon field
		new Setting(contentEl)
			.setName(t('annet.iconField'))
			.setDesc(t('annet.iconDesc'))
			.addText(text => text
				.setPlaceholder('🏥')
				.setValue(formData.icon)
				.onChange(value => formData.icon = value));

		// Buttons
		const buttonDiv = contentEl.createDiv({ cls: 'tf-settings-button-row' });

		const cancelBtn = buttonDiv.createEl('button', { text: t('common.cancel') });
		cancelBtn.onclick = () => this.close();

		const saveBtn = buttonDiv.createEl('button', { text: t('common.save'), cls: 'mod-cta' });
		saveBtn.onclick = () => {
			// Validate
			if (!formData.id) {
				new Notice(t('annet.idRequired'));
				return;
			}
			if (!formData.label) {
				new Notice(t('annet.labelRequired'));
				return;
			}
			if (!formData.icon) {
				new Notice(t('annet.iconRequired'));
				return;
			}

			// Check for duplicate IDs (only when adding new)
			if (!this.template) {
				const isDuplicate = this.plugin.settings.annetTemplates.some(
					(tmpl) => tmpl.id === formData.id
				);
				if (isDuplicate) {
					new Notice(t('annet.duplicateId'));
					return;
				}
			}

			// Create template object
			const template: AnnetTemplate = {
				id: this.template ? this.template.id : formData.id, // Keep original ID if editing
				label: formData.label,
				icon: formData.icon,
			};

			void this.onSave(template, this.index);
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class WorkSchedulePeriodModal extends Modal {
	period: WorkSchedulePeriod | null;
	index: number;
	plugin: TimeFlowPlugin;
	onSave: (period: WorkSchedulePeriod, index: number) => void | Promise<void>;

	constructor(
		app: App,
		plugin: TimeFlowPlugin,
		period: WorkSchedulePeriod | null,
		index: number,
		onSave: (period: WorkSchedulePeriod, index: number) => void | Promise<void>
	) {
		super(app);
		this.plugin = plugin;
		this.period = period;
		this.index = index;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.period ? 'Edit work schedule period' : 'Add work schedule period' });

		// Info box
		const infoBox = contentEl.createDiv({ cls: 'setting-item-description tf-settings-info-box' });
		infoBox.createSpan({ text: 'Define a work schedule period. Historical time entries will use the schedule that was active on their date.' });

		// Store form values
		const formData = {
			effectiveFrom: this.period?.effectiveFrom || Utils.toLocalDateStr(new Date()),
			workPercent: this.period?.workPercent ?? this.plugin.settings.workPercent,
			baseWorkday: this.period?.baseWorkday ?? this.plugin.settings.baseWorkday,
			baseWorkweek: this.period?.baseWorkweek ?? this.plugin.settings.baseWorkweek,
			workDays: this.period?.workDays ? [...this.period.workDays] : [...this.plugin.settings.workDays],
			halfDayHours: this.period?.halfDayHours ?? this.plugin.settings.halfDayHours
		};

		// We need to define updateImpactPreview before using it in onChange handlers
		// So we'll create a placeholder that gets assigned later
		let updateImpactPreview: () => void = () => {};

		// Effective from date
		new Setting(contentEl)
			.setName('Effective from')
			.setDesc('Date when this schedule becomes active (yyyy-mm-dd)')
			.addText(text => text
				.setPlaceholder('Yyyy-mm-dd')
				.setValue(formData.effectiveFrom)
				.onChange(value => {
					formData.effectiveFrom = value;
					updateImpactPreview();
				}));

		// Work percentage
		new Setting(contentEl)
			.setName('Work percentage')
			.setDesc('Employment percentage (0-1, e.g., 0.8 = 80%)')
			.addText(text => text
				.setPlaceholder('1.0')
				.setValue(formData.workPercent.toString())
				.onChange(value => {
					const num = parseFloat(value);
					if (!isNaN(num)) {
						formData.workPercent = num;
						updateImpactPreview();
					}
				}));

		// Base workday hours
		new Setting(contentEl)
			.setName('Base workday hours')
			.setDesc('Standard hours for a full workday')
			.addText(text => text
				.setPlaceholder('7.5')
				.setValue(formData.baseWorkday.toString())
				.onChange(value => {
					const num = parseFloat(value);
					if (!isNaN(num)) {
						formData.baseWorkday = num;
						updateImpactPreview();
					}
				}));

		// Base workweek hours
		new Setting(contentEl)
			.setName('Base workweek hours')
			.setDesc('Standard hours for a full workweek')
			.addText(text => text
				.setPlaceholder('37.5')
				.setValue(formData.baseWorkweek.toString())
				.onChange(value => {
					const num = parseFloat(value);
					if (!isNaN(num)) formData.baseWorkweek = num;
				}));

		// Half-day hours
		new Setting(contentEl)
			.setName('Half-day hours')
			.setDesc('Hours counted for a half workday')
			.addText(text => text
				.setPlaceholder('4')
				.setValue(formData.halfDayHours.toString())
				.onChange(value => {
					const num = parseFloat(value);
					if (!isNaN(num)) formData.halfDayHours = num;
				}));

		// Work days selector
		new Setting(contentEl)
			.setName('Work days')
			.setDesc('Select which days are part of this work week');

		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const workDaysContainer = contentEl.createDiv({ cls: 'tf-settings-workdays-container' });

		dayNames.forEach((dayName, dayIndex) => {
			const dayButton = workDaysContainer.createEl('button', { cls: 'tf-settings-day-button' });
			dayButton.textContent = dayName;
			if (formData.workDays.includes(dayIndex)) {
				dayButton.addClass('is-selected');
			}

			dayButton.onclick = () => {
				const index = formData.workDays.indexOf(dayIndex);
				if (index > -1) {
					formData.workDays.splice(index, 1);
				} else {
					formData.workDays.push(dayIndex);
					formData.workDays.sort((a, b) => a - b);
				}
				// Update button style
				dayButton.toggleClass('is-selected', formData.workDays.includes(dayIndex));
				// Update impact preview
				updateImpactPreview();
			};
		});

		// Impact preview box
		const impactPreview = contentEl.createDiv({ cls: 'tf-settings-impact-preview' });

		// Assign the actual implementation
		updateImpactPreview = () => {
			impactPreview.empty();

			// Validate date first
			if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.effectiveFrom)) {
				impactPreview.createEl('div', {
					text: 'Enter a valid date to see impact preview',
					cls: 'setting-item-description'
				});
				return;
			}

			const periodDate = formData.effectiveFrom;
			const history = this.plugin.settings.workScheduleHistory || [];
			const timerManager = this.plugin.timerManager;

			if (!timerManager || !timerManager.data || !timerManager.data.entries) {
				impactPreview.createEl('div', { text: 'Loading data...' });
				return;
			}

			// Count days with data that would be affected by this period
			const entries = timerManager.data.entries;
			let affectedDays = new Set<string>();
			const today = Utils.toLocalDateStr(new Date());

			// Find the next period's start date (to know when this period ends)
			const sortedHistory = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
			let nextPeriodDate: string | null = null;
			for (const p of sortedHistory) {
				if (p.effectiveFrom > periodDate && (this.index === -1 || p.effectiveFrom !== this.period?.effectiveFrom)) {
					nextPeriodDate = p.effectiveFrom;
					break;
				}
			}

			// Count entries in this period's date range
			entries.forEach((entry) => {
				if (!entry.startTime) return;
				const entryDate = Utils.toLocalDateStr(new Date(entry.startTime));
				if (entryDate >= periodDate && (!nextPeriodDate || entryDate < nextPeriodDate)) {
					affectedDays.add(entryDate);
				}
			});

			// Calculate estimated impact on balance
			const currentDailyGoal = this.plugin.settings.baseWorkday * this.plugin.settings.workPercent;
			const newDailyGoal = formData.baseWorkday * formData.workPercent;
			const goalDifference = newDailyGoal - currentDailyGoal;

			// Count how many of the affected days are workdays in old vs new schedule
			let oldWorkdays = 0;
			let newWorkdays = 0;
			const currentWorkDays = this.plugin.settings.workDays;

			affectedDays.forEach(dateStr => {
				const date = new Date(dateStr);
				const dayOfWeek = date.getDay();
				if (currentWorkDays.includes(dayOfWeek)) oldWorkdays++;
				if (formData.workDays.includes(dayOfWeek)) newWorkdays++;
			});

			// Build preview
			const title = impactPreview.createEl('div', { cls: 'tf-settings-impact-title' });
			title.textContent = `Impact preview`;

			const affectedText = impactPreview.createEl('div', { cls: 'tf-settings-impact-item' });
			affectedText.textContent = `• Affects ${affectedDays.size} days with existing data`;

			if (affectedDays.size > 0) {
				const workdayChange = impactPreview.createEl('div', { cls: 'tf-settings-impact-item' });
				if (oldWorkdays !== newWorkdays) {
					workdayChange.textContent = `• Workdays in period: ${oldWorkdays} → ${newWorkdays}`;
				} else {
					workdayChange.textContent = `• Workdays in period: ${newWorkdays}`;
				}

				if (Math.abs(goalDifference) > 0.1) {
					const goalChange = impactPreview.createEl('div', { cls: 'tf-settings-impact-item' });
					const sign = goalDifference > 0 ? '+' : '';
					goalChange.textContent = `• Daily goal: ${currentDailyGoal.toFixed(1)}h → ${newDailyGoal.toFixed(1)}h (${sign}${goalDifference.toFixed(1)}h)`;
				}

				// Change in required hours (positive = more hours required, negative = fewer)
				const requiredHoursChange = (newWorkdays - oldWorkdays) * newDailyGoal + oldWorkdays * goalDifference;
				if (Math.abs(requiredHoursChange) > 0.5) {
					const changeEl = impactPreview.createEl('div', { cls: 'tf-settings-impact-item' });
					const sign = requiredHoursChange > 0 ? '+' : '';
					changeEl.textContent = `• Required hours change: ${sign}${requiredHoursChange.toFixed(1)}h`;

					// Flextime balance impact (inverse of required hours change)
					const balanceImpact = -requiredHoursChange;
					const balanceEl = impactPreview.createEl('div', {
						cls: balanceImpact > 0 ? 'tf-settings-impact-balance-positive' : 'tf-settings-impact-balance-negative'
					});
					const balanceSign = balanceImpact > 0 ? '+' : '';
					balanceEl.textContent = `• Flextime balance impact: ${balanceSign}${balanceImpact.toFixed(1)}h`;
				}
			}

			if (periodDate > today) {
				const futureNote = impactPreview.createEl('div', { cls: 'tf-settings-future-note' });
				futureNote.textContent = 'This is a future period - will apply from ' + periodDate;
			}
		};

		// Initial preview
		updateImpactPreview();

		// Buttons
		const buttonDiv = contentEl.createDiv({ cls: 'tf-settings-button-row' });

		const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();

		const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.onclick = () => {
			// Validate date format
			if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.effectiveFrom)) {
				new Notice('Invalid date format, use yyyy-mm-dd');
				return;
			}

			// Validate work days
			if (formData.workDays.length === 0) {
				new Notice('At least one work day is required');
				return;
			}

			// Validate numeric values
			if (formData.workPercent <= 0 || formData.workPercent > 2) {
				new Notice('Work percentage must be between 0 and 2');
				return;
			}
			if (formData.baseWorkday <= 0 || formData.baseWorkday > 24) {
				new Notice('Base workday must be between 0 and 24 hours');
				return;
			}
			if (formData.halfDayHours <= 0 || formData.halfDayHours > formData.baseWorkday) {
				new Notice('Half-day hours must be between 0 and base workday');
				return;
			}

			const period: WorkSchedulePeriod = {
				effectiveFrom: formData.effectiveFrom,
				workPercent: formData.workPercent,
				baseWorkday: formData.baseWorkday,
				baseWorkweek: formData.baseWorkweek,
				workDays: formData.workDays,
				halfDayHours: formData.halfDayHours
			};

			void this.onSave(period, this.index);
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
			const view = leaf.view as { refresh?: () => Promise<void> };
			if (view && typeof view.refresh === 'function') {
				await view.refresh();
			}
		}
	}

	/**
	 * Sync current work settings to the most recent (active) schedule period.
	 * This ensures that when a user changes settings in the main Work Configuration,
	 * those changes are reflected in the currently active period.
	 */
	private syncCurrentSettingsToActivePeriod(): void {
		const history = this.plugin.settings.workScheduleHistory;
		if (!history || history.length === 0) return;

		// Find the most recent period (the one currently active)
		const todayStr = Utils.toLocalDateStr(new Date());
		const sortedHistory = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

		// Find the period that applies today
		let activeIndex = -1;
		for (let i = 0; i < sortedHistory.length; i++) {
			if (sortedHistory[i].effectiveFrom <= todayStr) {
				activeIndex = i;
			} else {
				break;
			}
		}

		// If no period applies (all are in the future), update the earliest one
		if (activeIndex === -1) {
			activeIndex = 0;
		}

		// Find the original index in the unsorted array
		const activePeriod = sortedHistory[activeIndex];
		const originalIndex = history.findIndex(p => p.effectiveFrom === activePeriod.effectiveFrom);

		if (originalIndex !== -1) {
			// Sync current settings to this period
			history[originalIndex].workPercent = this.plugin.settings.workPercent;
			history[originalIndex].baseWorkday = this.plugin.settings.baseWorkday;
			history[originalIndex].baseWorkweek = this.plugin.settings.baseWorkweek;
			history[originalIndex].workDays = [...this.plugin.settings.workDays];
			history[originalIndex].halfDayHours = this.plugin.settings.halfDayHours;
		}
	}

	private addResetButton<K extends keyof TimeFlowSettings>(setting: Setting, settingKey: K, defaultValue: TimeFlowSettings[K], refreshCallback?: () => void): void {
		setting.addExtraButton(button => button
			.setIcon("reset")
			.setTooltip("Reset to default")
			.onClick(async () => {
				this.plugin.settings[settingKey] = defaultValue;
				await this.plugin.saveSettings();
				this.display(); // Refresh settings UI
				if (refreshCallback) {
					refreshCallback();
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
			new Notice("❌ balance start date: format must be yyyy-mm-dd");
			return false;
		}

		const date = new Date(dateStr + 'T00:00:00');
		if (isNaN(date.getTime())) {
			new Notice("❌ balance start date: invalid date");
			return false;
		}

		if (date > new Date()) {
			new Notice("❌ balance start date: cannot be in the future");
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

		// Settings heading removed per Obsidian guidelines (should not include plugin name or "settings")

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
					setting.removeClass('tf-hidden');
				} else {
					setting.addClass('tf-hidden');
				}
			});
		});

		// ============================================================
		// SECTION 1: QUICK START
		// ============================================================
		new Setting(settingsContainer)
			.setName('Quick start')
			.setDesc('Essential settings to get started with timeflow')
			.setHeading();

		// Settings sync info
		const syncInfo = settingsContainer.createDiv({ cls: 'tf-settings-info-box' });
		syncInfo.createEl('strong', { text: '📱 cross-device settings sync' });
		syncInfo.createEl('br');
		syncInfo.appendText('Settings are automatically saved to ');
		syncInfo.createEl('code', { text: 'timeflow/data.md' });
		syncInfo.appendText(' and will sync across devices when using Obsidian Sync or any other vault sync solution. When you open the plugin on another device, your settings will be automatically loaded.');

		// Language selector
		new Setting(settingsContainer)
			.setName('Language')
			.setDesc('Interface language')
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
			.setName('Work configuration')
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
							this.syncCurrentSettingsToActivePeriod();
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
								this.syncCurrentSettingsToActivePeriod();
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
								this.syncCurrentSettingsToActivePeriod();
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
			new Setting(settingsContainer)
				.setName('Work days')
				.setDesc('Select which days are part of your work week');

			const workDaysContainer = settingsContainer.createDiv({ cls: 'tf-settings-workdays-container' });

			dayNames.forEach((dayName, dayIndex) => {
				const dayButton = workDaysContainer.createEl('button', { cls: 'tf-settings-day-button' });
				dayButton.textContent = dayName.substring(0, 3); // Mon, Tue, etc.
				if (this.plugin.settings.workDays.includes(dayIndex)) {
					dayButton.addClass('is-selected');
				}

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
					this.syncCurrentSettingsToActivePeriod();
					await this.plugin.saveSettings();

					// Update button style directly instead of refreshing entire page
					dayButton.toggleClass('is-selected', currentWorkDays.includes(dayIndex));
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
				new Setting(settingsContainer)
					.setName('Alternating week work days')
					.setDesc('Select which days are work days in the alternating week');

				const altWorkDaysContainer = settingsContainer.createDiv({ cls: 'tf-settings-workdays-container' });

				dayNames.forEach((dayName, dayIndex) => {
					const dayButton = altWorkDaysContainer.createEl('button', { cls: 'tf-settings-day-button' });
					dayButton.textContent = dayName.substring(0, 3);
					if (this.plugin.settings.alternatingWeekWorkDays.includes(dayIndex)) {
						dayButton.addClass('is-selected');
					}

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

						// Update button style directly instead of refreshing entire page
						dayButton.toggleClass('is-selected', currentAltWorkDays.includes(dayIndex));
					};
				});
			}
		} // End of enableGoalTracking conditional

		// Work Schedule History subsection (collapsible)
		const scheduleHistorySection = this.createCollapsibleSubsection(
			settingsContainer,
			'Work schedule history',
			false
		);

		const scheduleHistoryInfo = scheduleHistorySection.content.createDiv({ cls: 'tf-settings-info-box' });
		scheduleHistoryInfo.createEl('strong', { text: 'Track changes to your work schedule' });
		scheduleHistoryInfo.createEl('br');
		scheduleHistoryInfo.appendText('If you change roles or work hours, add a new period to preserve accurate historical calculations. ');
		scheduleHistoryInfo.appendText('Each period defines the schedule that was active from its effective date.');

		// Get schedule history, sorted by date (most recent first)
		const scheduleHistory = [...(this.plugin.settings.workScheduleHistory || [])];
		scheduleHistory.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

		// Display current settings as the active period
		const currentSettingsInfo = scheduleHistorySection.content.createDiv({ cls: 'tf-settings-current-info' });

		const currentLabel = currentSettingsInfo.createEl('div', { cls: 'tf-settings-current-label' });
		currentLabel.textContent = 'Current settings (active)';

		const currentDetails = currentSettingsInfo.createEl('div', { cls: 'tf-settings-current-details' });
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const currentWorkDaysStr = this.plugin.settings.workDays.map(d => dayNames[d]).join(', ');
		currentDetails.textContent = `${(this.plugin.settings.workPercent * 100).toFixed(0)}% · ${this.plugin.settings.baseWorkday}h/day · ${this.plugin.settings.baseWorkweek}h/week · ${currentWorkDaysStr}`;

		// List historical periods
		if (scheduleHistory.length > 0) {
			scheduleHistory.forEach((period, arrayIndex) => {
				// Find the actual index in the settings array
				const originalIndex = this.plugin.settings.workScheduleHistory!.findIndex(
					p => p.effectiveFrom === period.effectiveFrom
				);

				const periodDiv = scheduleHistorySection.content.createDiv({ cls: 'tf-settings-period-item' });

				const infoDiv = periodDiv.createDiv();
				const dateLabel = infoDiv.createEl('div', { cls: 'tf-settings-period-date' });
				dateLabel.textContent = `From ${period.effectiveFrom}`;

				const details = infoDiv.createEl('div', { cls: 'tf-settings-period-details' });
				const workDaysStr = period.workDays.map(d => dayNames[d]).join(', ');
				details.textContent = `${(period.workPercent * 100).toFixed(0)}% · ${period.baseWorkday}h/day · ${period.baseWorkweek}h/week · ${workDaysStr}`;

				const buttonsDiv = periodDiv.createDiv({ cls: 'tf-settings-period-buttons' });

				const editBtn = buttonsDiv.createEl('button', { text: 'Edit' });
				editBtn.onclick = () => {
					new WorkSchedulePeriodModal(
						this.app,
						this.plugin,
						period,
						originalIndex,
						async (updatedPeriod, idx) => {
							this.plugin.settings.workScheduleHistory![idx] = updatedPeriod;
							// Re-sort the array by date
							this.plugin.settings.workScheduleHistory!.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
							await this.plugin.saveSettings();
							await this.refreshView();
							this.display();
						}
					).open();
				};

				// Only show delete button if there's more than one period
				if (scheduleHistory.length > 1) {
					const deleteBtn = buttonsDiv.createEl('button', { text: 'Delete', cls: 'tf-settings-delete-btn' });
					deleteBtn.onclick = () => {
						new ConfirmModal(this.app, `Delete schedule period from ${period.effectiveFrom}?`, async () => {
							this.plugin.settings.workScheduleHistory!.splice(originalIndex, 1);
							await this.plugin.saveSettings();
							await this.refreshView();
							this.display();
						}).open();
					};
				}
			});
		} else {
			const noPeriods = scheduleHistorySection.content.createDiv({ cls: 'tf-settings-no-periods' });
			noPeriods.textContent = 'No historical periods defined. Add a period when your schedule changes.';
		}

		// Add new period button
		new Setting(scheduleHistorySection.content)
			.setName('Add historical period')
			.setDesc('Add a period for when your work schedule was different')
			.addButton(btn => btn
				.setButtonText('+ add period')
				.setCta()
				.onClick(() => {
					new WorkSchedulePeriodModal(
						this.app,
						this.plugin,
						null,
						-1,
						async (newPeriod) => {
							if (!this.plugin.settings.workScheduleHistory) {
								this.plugin.settings.workScheduleHistory = [];
							}
							this.plugin.settings.workScheduleHistory.push(newPeriod);
							// Sort by effective date
							this.plugin.settings.workScheduleHistory.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
							await this.plugin.saveSettings();
							await this.refreshView();
							this.display();
						}
					).open();
				}));

		// Compliance warnings subsection
		const complianceSection = this.createCollapsibleSubsection(
			settingsContainer,
			'Work time limits',
			false
		);
		complianceSection.content.addClass('tf-compliance-settings');

		new Setting(complianceSection.content)
			.setName('Enable compliance warnings')
			.setDesc('Show warnings when approaching or exceeding labor law limits')
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
			.setDesc('Maximum hours per day before showing a warning (default: 9 hours)')
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
			.setDesc('Maximum hours per week before showing a warning (default: 40 hours)')
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
			.setName('Rest period between shifts')
			.setDesc('Hours of rest required between work sessions, 11 by default')
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

		// Separate work types from absence types
		const workTypes = this.plugin.settings.specialDayBehaviors.filter(b => b.isWorkType || b.id === 'jobb');
		const absenceTypes = this.plugin.settings.specialDayBehaviors.filter(b => !b.isWorkType && b.id !== 'jobb');

		// Work Entry Types section
		new Setting(settingsContainer)
			.setName('Work entry type')
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

		// Absence Types section
		new Setting(settingsContainer)
			.setName('Absence types')
			.setDesc(t('settings.absenceTypesDesc'))
			.setHeading();

		// List absence type behaviors (excluding work types)
		absenceTypes.forEach((behavior) => {
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
					.onClick(() => {
						// Warn if deleting a behavior with ID that might have historical data
						new ConfirmModal(
							this.app,
							`Are you sure you want to delete "${behavior.label}"?\n\n` +
							`Note: Historical data in your holidays file using "${behavior.id}" will no longer be recognized.`,
							async () => {
								this.plugin.settings.specialDayBehaviors.splice(index, 1);
								await this.plugin.saveSettings();
								await this.refreshView();
								this.display(); // Refresh settings panel
							}
						).open();
					}));
		});

		// Add new absence type button
		new Setting(settingsContainer)
			.setName(t('settings.addAbsenceType'))
			.addButton(btn => btn
				.setButtonText('+ ' + t('common.add'))
				.setCta()
				.onClick(() => {
					new SpecialDayBehaviorModal(
						this.app,
						this.plugin,
						null, // New absence type
						this.plugin.settings.specialDayBehaviors.length, // Index at end
						async (newBehavior) => {
							this.plugin.settings.specialDayBehaviors.push(newBehavior);
							await this.plugin.saveSettings();
							await this.refreshView();
							this.display(); // Refresh settings panel
						}
					).open();
				}));

		// Annet Templates section
		new Setting(settingsContainer)
			.setName(t('annet.templatesSection'))
			.setDesc(t('annet.templatesDesc'))
			.setHeading();

		// List annet templates
		this.plugin.settings.annetTemplates.forEach((template, index) => {
			const translatedName = translateAnnetTemplateName(template.id, template.label);
			new Setting(settingsContainer)
				.setName(`${template.icon} ${translatedName}`)
				.setDesc(`ID: ${template.id}`)
				.addButton(btn => btn
					.setButtonText(t('common.edit'))
					.onClick(() => {
						new AnnetTemplateModal(
							this.app,
							this.plugin,
							template,
							index,
							async (updatedTemplate, idx) => {
								this.plugin.settings.annetTemplates[idx] = updatedTemplate;
								await this.plugin.saveSettings();
								await this.refreshView();
								this.display(); // Refresh settings panel
							}
						).open();
					}))
				.addButton(btn => btn
					.setButtonText(t('common.delete'))
					.setWarning()
					.onClick(() => {
						new ConfirmModal(
							this.app,
							`Are you sure you want to delete "${translatedName}"?\n\n` +
							`Note: Historical data using "annet:${template.id}" will still work but show a generic icon.`,
							async () => {
								this.plugin.settings.annetTemplates.splice(index, 1);
								await this.plugin.saveSettings();
								await this.refreshView();
								this.display(); // Refresh settings panel
							}
						).open();
					}));
		});

		// Add new template button
		new Setting(settingsContainer)
			.setName(t('annet.addTemplate'))
			.addButton(btn => btn
				.setButtonText('+ ' + t('common.add'))
				.setCta()
				.onClick(() => {
					new AnnetTemplateModal(
						this.app,
						this.plugin,
						null, // New template
						this.plugin.settings.annetTemplates.length, // Index at end
						async (newTemplate) => {
							this.plugin.settings.annetTemplates.push(newTemplate);
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
			.setName('Display & interface')
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
				.addOption('h', 'H')
				.addOption('t', 'T')
				.setValue(this.plugin.settings.hourUnit)
				.onChange(async (value: 'h' | 't') => {
					this.plugin.settings.hourUnit = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(settingsContainer)
			.setName('Show week numbers')
			.setDesc('Show week numbers in calendar and week card')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showWeekNumbers ?? true)
				.onChange(async (value) => {
					this.plugin.settings.showWeekNumbers = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(settingsContainer)
			.setName(t('settings.hideEmptyStats'))
			.setDesc(t('settings.hideEmptyStatsDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideEmptyStats ?? false)
				.onChange(async (value) => {
					this.plugin.settings.hideEmptyStats = value;
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
			.setName('Heatmap absence colors')
			.setDesc('Show absence colors (ferie, egenmelding, etc.) instead of flextime gradient in heatmap')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.heatmapShowSpecialDayColors)
				.onChange(async (value) => {
					this.plugin.settings.heatmapShowSpecialDayColors = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(settingsContainer)
			.setName('Update interval (seconds)')
			.setDesc('How often to update the dashboard data (in seconds)')
			.addText(text => text
				.setPlaceholder('30')
				.setValue(this.plugin.settings.updateInterval.toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 1) {
						this.plugin.settings.updateInterval = num;
						await this.plugin.saveSettings();
					}
				}));

		// ============================================================
		// SECTION 5: FILE PATHS & TEMPLATES
		// ============================================================
		new Setting(settingsContainer)
			.setName('File paths & templates')
			.setDesc('Configure file paths and note templates')
			.setHeading();

		new Setting(settingsContainer)
			.setName('Daily notes folder')
			.setDesc('Folder where daily notes are stored')
			.addText(text => text
				.setPlaceholder('Daily notes')
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
				.setButtonText('+ add note type')
				.setCta()
				.onClick(() => {
					this.showNoteTypeModal(null, -1);
				}));

		// ============================================================
		// SECTION 6: DATA MANAGEMENT
		// ============================================================
		new Setting(settingsContainer)
			.setName('Data management')
			.setDesc('Import and export your time tracking data')
			.setHeading();

		new Setting(settingsContainer)
			.setName('Export data to CSV')
			.setDesc('Export all your time tracking data to a CSV file')
			.addButton(button => button
				.setButtonText('Export CSV')
				.setCta()
				.onClick(() => {
					this.exportToCSV();
				}));

		new Setting(settingsContainer)
			.setName(t('settings.importData'))
			.setDesc(t('settings.importDataDesc'))
			.addButton(button => button
				.setButtonText(t('settings.importData'))
				.setCta()
				.onClick(() => {
					this.showImportModal();
				}));

		// ============================================================
		// SECTION 7: ADVANCED SETTINGS
		// ============================================================
		new Setting(settingsContainer)
			.setName('Advanced')
			.setDesc('Fine-tune balance calculations, thresholds, and visual customization')
			.setHeading();

		const advancedInfo = settingsContainer.createDiv({ cls: 'tf-settings-info-box' });
		advancedInfo.createEl('strong', { text: '⚙️ advanced configuration' });
		advancedInfo.createEl('br');
		advancedInfo.appendText('These settings affect balance calculations and visual indicators. Settings sync across devices via your data file.');

		// Balance Calculation subsection (collapsible)
		const balanceCalcSection = this.createCollapsibleSubsection(
			settingsContainer,
			'Balance calculation',
			false
		);

		new Setting(balanceCalcSection.content)
			.setName('Balance start date')
			.setDesc('Set the date from which flextime balance is calculated. Earlier entries are ignored in balance calculations. Format: yyyy-mm-dd')
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
							this.syncCurrentSettingsToActivePeriod();
							await this.plugin.saveSettings();
							await this.refreshView();
						}
					}));
		}

		// Balance Thresholds subsection (collapsible)
		const balanceThresholdsSection = this.createCollapsibleSubsection(
			settingsContainer,
			'Balance color thresholds',
			false
		);

		new Setting(balanceThresholdsSection.content)
			.setName('Balance color thresholds')
			.setDesc('Configure the hour thresholds for balance indicator colors. These control the color-coding of your flextime balance badge: red = significant under/overtime, yellow = approaching limits, green = healthy balance.');

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
			'Data validation thresholds',
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
			'Custom colors',
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

		entries.forEach((entry: TimeEntry) => {
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

		new Notice('✅ exported to CSV');
	}

	showImportModal(): void {
		new ImportModal(this.app, this.plugin.timerManager, async () => {
			await this.refreshView();
		}).open();
	}

	showNoteTypeModal(noteType: NoteType | null, index: number): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText(noteType ? 'Edit note type' : 'Add note type');

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
				text.setPlaceholder('Meeting')
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
			.setName('Template path')
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
			.setName('Filename pattern')
			.setDesc('Pattern for note filenames. Available: {YYYY}, {MM}, {DD}, {WEEK}')
			.addText(text => text
				.setPlaceholder('{YYYY}-{MM}-{DD} Møte')
				.setValue(formData.filenamePattern)
				.onChange((value) => {
					formData.filenamePattern = value;
				}));

		// Info section
		const infoDiv = contentEl.createDiv({ cls: 'tf-settings-info-box' });
		infoDiv.createEl('strong', { text: '📋 pattern variables:' });
		const ul = infoDiv.createEl('ul', { cls: 'tf-settings-info-list' });
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
		const buttonDiv = contentEl.createDiv({ cls: 'tf-settings-button-row' });

		const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => modal.close();

		const saveBtn = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.onclick = async () => {
			// Validate required fields
			if (!formData.id || !formData.label || !formData.folder) {
				new Notice('⚠️ please fill in all required fields (ID, label, folder)');
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
					new Notice('⚠️ a note type with this ID already exists');
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
