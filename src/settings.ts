import { App, PluginSettingTab, Setting } from 'obsidian';
import TimeFlowPlugin from './main';

export interface TimeFlowSettings {
	version: string;
	theme: 'light' | 'dark' | 'system';
	workPercent: number;
	baseWorkday: number;
	baseWorkweek: number;
	updateInterval: number;
	clockInterval: number;
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
	specialDayColors: {
		avspasering: string;
		ferie: string;
		velferdspermisjon: string;
		egenmelding: string;
		kurs: string;
		studie: string;
	};
	specialDayLabels: {
		avspasering: string;
		ferie: string;
		velferdspermisjon: string;
		egenmelding: string;
		kurs: string;
		studie: string;
	};
}

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
	workPercent: 1.0,
	baseWorkday: 7.5,
	baseWorkweek: 37.5,
	updateInterval: 30000,
	clockInterval: 1000,
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
	specialDayColors: {
		avspasering: "#ffe0b2",
		ferie: "#b3e5fc",
		velferdspermisjon: "#e1bee7",
		egenmelding: "#c8e6c9",
		kurs: "#f8bbd0",
		studie: "#f8bbd0"
	},
	specialDayLabels: {
		avspasering: "Avspasering",
		ferie: "Ferie",
		velferdspermisjon: "Velferdspermisjon",
		egenmelding: "Egenmelding",
		kurs: "Kurs",
		studie: "Studie"
	}
};

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

		containerEl.createEl('h2', { text: 'TimeFlow Settings' });

		// Appearance
		containerEl.createEl('h3', { text: 'Appearance' });

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

		// Special Day Types
		containerEl.createEl('h4', { text: 'Special Day Types' });
		containerEl.createEl('p', {
			text: 'Customize names and colors for different types of special days. These day types affect flextime calculations.',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('Time Off (Compensatory Leave)')
			.setDesc('Day off using banked flextime hours. Withdraws logged hours from flextime balance.')
			.addText(text => text
				.setPlaceholder('Avspasering')
				.setValue(this.plugin.settings.specialDayLabels.avspasering)
				.onChange(async (value) => {
					this.plugin.settings.specialDayLabels.avspasering = value || 'Avspasering';
					await this.plugin.saveSettings();
					await this.refreshView();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.specialDayColors.avspasering)
				.onChange(async (value) => {
					this.plugin.settings.specialDayColors.avspasering = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(containerEl)
			.setName('Vacation')
			.setDesc('Paid vacation day. Counts as a full workday (no flextime change).')
			.addText(text => text
				.setPlaceholder('Ferie')
				.setValue(this.plugin.settings.specialDayLabels.ferie)
				.onChange(async (value) => {
					this.plugin.settings.specialDayLabels.ferie = value || 'Ferie';
					await this.plugin.saveSettings();
					await this.refreshView();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.specialDayColors.ferie)
				.onChange(async (value) => {
					this.plugin.settings.specialDayColors.ferie = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(containerEl)
			.setName('Welfare Leave')
			.setDesc('Personal/family emergency leave. Counts as a full workday (no flextime change).')
			.addText(text => text
				.setPlaceholder('Velferdspermisjon')
				.setValue(this.plugin.settings.specialDayLabels.velferdspermisjon)
				.onChange(async (value) => {
					this.plugin.settings.specialDayLabels.velferdspermisjon = value || 'Velferdspermisjon';
					await this.plugin.saveSettings();
					await this.refreshView();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.specialDayColors.velferdspermisjon)
				.onChange(async (value) => {
					this.plugin.settings.specialDayColors.velferdspermisjon = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(containerEl)
			.setName('Sick Leave (Self-Certified)')
			.setDesc('Sick day without doctor\'s note. Counts as a full workday (no flextime change).')
			.addText(text => text
				.setPlaceholder('Egenmelding')
				.setValue(this.plugin.settings.specialDayLabels.egenmelding)
				.onChange(async (value) => {
					this.plugin.settings.specialDayLabels.egenmelding = value || 'Egenmelding';
					await this.plugin.saveSettings();
					await this.refreshView();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.specialDayColors.egenmelding)
				.onChange(async (value) => {
					this.plugin.settings.specialDayColors.egenmelding = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(containerEl)
			.setName('Course/Training')
			.setDesc('Professional development/training day. Regular workday goal applies - hours beyond workday count as flextime.')
			.addText(text => text
				.setPlaceholder('Kurs')
				.setValue(this.plugin.settings.specialDayLabels.kurs)
				.onChange(async (value) => {
					this.plugin.settings.specialDayLabels.kurs = value || 'Kurs';
					await this.plugin.saveSettings();
					await this.refreshView();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.specialDayColors.kurs)
				.onChange(async (value) => {
					this.plugin.settings.specialDayColors.kurs = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		new Setting(containerEl)
			.setName('Study')
			.setDesc('Educational leave/study day. Regular workday goal applies - hours beyond workday count as flextime.')
			.addText(text => text
				.setPlaceholder('Studie')
				.setValue(this.plugin.settings.specialDayLabels.studie)
				.onChange(async (value) => {
					this.plugin.settings.specialDayLabels.studie = value || 'Studie';
					await this.plugin.saveSettings();
					await this.refreshView();
				}))
			.addColorPicker(color => color
				.setValue(this.plugin.settings.specialDayColors.studie)
				.onChange(async (value) => {
					this.plugin.settings.specialDayColors.studie = value;
					await this.plugin.saveSettings();
					await this.refreshView();
				}));

		// Work Configuration
		containerEl.createEl('h3', { text: 'Work Configuration' });

		new Setting(containerEl)
			.setName('Work Percentage')
			.setDesc('Your employment percentage (1.0 = 100%, 0.8 = 80%, etc.)')
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
			.setName('Base Workday Hours')
			.setDesc('Standard hours for a full workday')
			.addText(text => text
				.setPlaceholder('7.5')
				.setValue(this.plugin.settings.baseWorkday.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.baseWorkday = num;
						this.plugin.settings.baseWorkweek = num * 5;
						await this.plugin.saveSettings();
						await this.refreshView();
					}
				}));

		// File Paths
		containerEl.createEl('h3', { text: 'File Paths' });

		new Setting(containerEl)
			.setName('Holidays File Path')
			.setDesc('Path to the file containing future planned days/holidays')
			.addText(text => text
				.setPlaceholder('timeflow/holidays.md')
				.setValue(this.plugin.settings.holidaysFilePath)
				.onChange(async (value) => {
					this.plugin.settings.holidaysFilePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Daily Notes Folder')
			.setDesc('Folder where daily notes are stored')
			.addText(text => text
				.setPlaceholder('Daily Notes')
				.setValue(this.plugin.settings.dailyNotesFolder)
				.onChange(async (value) => {
					this.plugin.settings.dailyNotesFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Daily Notes Template Path')
			.setDesc('Path to the template for daily notes')
			.addText(text => text
				.setPlaceholder('Templates/Daily Notes Template.md')
				.setValue(this.plugin.settings.dailyNotesTemplatePath)
				.onChange(async (value) => {
					this.plugin.settings.dailyNotesTemplatePath = value;
					await this.plugin.saveSettings();
				}));

		// Display Settings
		containerEl.createEl('h3', { text: 'Display Settings' });

		new Setting(containerEl)
			.setName('Consecutive Flextime Warning Days')
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
			.setName('Heatmap Columns')
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
			.setName('Update Interval (ms)')
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
	}
}
