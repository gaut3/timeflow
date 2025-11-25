import { App, PluginSettingTab, Setting } from 'obsidian';
import TimeFlowPlugin from './main';

export interface TimeFlowSettings {
	version: string;
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
	workPercent: 1.0,
	baseWorkday: 7.5,
	baseWorkweek: 37.5,
	updateInterval: 30000,
	clockInterval: 1000,
	holidaysFilePath: "01. timeflow/timeflow/Fremtidige dager.md",
	dailyNotesFolder: "Daily Notes",
	dailyNotesTemplatePath: "01. timeflow/timeflow/Administrasjon/Templates/Daily Notes Template.md",
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
			template: "01. timeflow/timeflow/Administrasjon/Templates/Daily Notes Template.md",
			tags: [],
			filenamePattern: "{YYYY}-{MM}-{DD}"
		},
		{
			id: "meeting",
			label: "Møtenotat",
			icon: "👥",
			folder: "Møter",
			template: "01. timeflow/timeflow/Administrasjon/Templates/Meeting Note template.md",
			tags: ["#møte", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Møte"
		},
		{
			id: "project",
			label: "Prosjektnotat",
			icon: "📋",
			folder: "Prosjekter",
			template: "01. timeflow/timeflow/Administrasjon/Templates/Project Note template.md",
			tags: ["#prosjekt", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Prosjekt"
		},
		{
			id: "review",
			label: "Ukesoppsummering",
			icon: "🔍",
			folder: "Oppsummeringer",
			template: "01. timeflow/timeflow/Administrasjon/Templates/Weekly Review template.md",
			tags: ["#oppsummering", "#uke", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Uke {WEEK}"
		},
		{
			id: "reflection",
			label: "Refleksjonsnotat",
			icon: "💭",
			folder: "Refleksjoner",
			template: "01. timeflow/timeflow/Administrasjon/Templates/Reflection Note template.md",
			tags: ["#refleksjon", "#timeflow"],
			filenamePattern: "{YYYY}-{MM}-{DD} Refleksjon"
		}
	]
};

export class TimeFlowSettingTab extends PluginSettingTab {
	plugin: TimeFlowPlugin;

	constructor(app: App, plugin: TimeFlowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'TimeFlow Settings' });

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
					}
				}));

		// File Paths
		containerEl.createEl('h3', { text: 'File Paths' });

		new Setting(containerEl)
			.setName('Holidays File Path')
			.setDesc('Path to the file containing future planned days/holidays')
			.addText(text => text
				.setPlaceholder('01. timeflow/timeflow/Fremtidige dager.md')
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
