import { App, TFile, Notice } from 'obsidian';
import { DataManager } from './dataManager';
import { TimeFlowSettings, SpecialDayBehavior } from './settings';
import { TimerManager, Timer } from './timerManager';
import { Utils, getSpecialDayColors, getSpecialDayTextColors } from './utils';
import type TimeFlowPlugin from './main';
import { t, formatDate, formatTime, getDayNamesShort, getLocale, getMonthName, translateSpecialDayName, translateNoteTypeName } from './i18n';

export class UIBuilder {
	data: DataManager;
	container: HTMLElement;
	intervals: number[] = [];
	today: Date;
	statsTimeframe: string = "total";
	selectedYear: number;
	selectedMonth: number;
	historyView: string = "list";
	currentMonthOffset: number = 0;
	historyFilter: string[] = []; // empty = all, or list of type IDs to filter by
	inlineEditMode: boolean = false; // toggle for inline editing in wide view
	systemStatus: any;
	settings: TimeFlowSettings;
	app: App;
	timerManager: TimerManager;
	plugin: TimeFlowPlugin;
	elements: {
		badge: HTMLElement | null;
		complianceBadge: HTMLElement | null;
		timerBadge: HTMLButtonElement | null;
		clock: HTMLElement | null;
		dayCard: HTMLElement | null;
		weekCard: HTMLElement | null;
		statsCard: HTMLElement | null;
		monthCard: HTMLElement | null;
	};

	constructor(dataManager: DataManager, systemStatus: any, settings: TimeFlowSettings, app: App, timerManager: TimerManager, plugin: TimeFlowPlugin) {
		this.data = dataManager;
		this.systemStatus = systemStatus;
		this.settings = settings;
		this.app = app;
		this.timerManager = timerManager;
		this.plugin = plugin;
		this.container = this.createContainer();
		this.today = new Date();
		this.selectedYear = this.today.getFullYear();
		this.selectedMonth = this.today.getMonth();
		this.elements = {
			badge: null,
			complianceBadge: null,
			timerBadge: null,
			clock: null,
			dayCard: null,
			weekCard: null,
			statsCard: null,
			monthCard: null,
		};
	}

	getBalanceColor(balance: number): string {
		const t = this.settings.balanceThresholds;
		const colors = this.settings.customColors;

		if (balance < t.criticalLow || balance > t.criticalHigh)
			return colors?.balanceCritical || '#f44336';
		if (balance < t.warningLow || balance > t.warningHigh)
			return colors?.balanceWarning || '#ff9800';
		return colors?.balanceOk || '#4caf50';
	}

	private darkenColor(color: string, percent: number): string {
		// Simple darkening: extract RGB and reduce by percent
		const hex = color.replace('#', '');
		const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - percent);
		const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - percent);
		const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - percent);
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	}

	createContainer(): HTMLElement {
		const container = document.createElement("div");
		container.style.fontFamily = "sans-serif";
		container.style.maxWidth = "1200px";
		container.style.margin = "0 auto";
		container.style.padding = "20px";
		container.style.boxSizing = "border-box";
		return container;
	}

	injectStyles(): void {
		const styleId = 'timeflow-styles';
		if (document.getElementById(styleId)) return;

		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = `
			/* timeflow Dashboard Styles */
			.timeflow-dashboard {
				font-family: var(--font-text);
				padding: 20px;
				width: 100%;
			}

			.timeflow-error, .timeflow-warning {
				padding: 15px;
				border-radius: 5px;
				margin: 10px 0;
			}

			.timeflow-error {
				background: var(--background-modifier-error);
				color: var(--text-error);
			}

			.timeflow-warning {
				background: var(--background-modifier-warning);
				color: var(--text-warning);
			}

			/* Pulse animation for active entry indicator */
			@keyframes pulse {
				0%, 100% {
					opacity: 1;
					transform: scale(1);
				}
				50% {
					opacity: 0.6;
					transform: scale(1.1);
				}
			}

			.tf-badge-section {
				display: flex;
				align-items: stretch;
				gap: 12px;
				margin: 16px 0;
				flex-wrap: wrap;
			}

			/* Default flex behavior for all badges */
			.tf-compliance-badge {
				flex: 0 0 auto;
				margin-left: auto;
			}
			.tf-timer-badge {
				flex: 0 1 auto;
			}

			/* At narrower widths: badges split into 2 rows */
			@container dashboard (max-width: 650px) {
				/* Row 1: Timesaldo (50%) and Clock (50%) */
				.tf-badge {
					flex: 1 1 calc(50% - 6px);
				}
				.tf-clock {
					flex: 1 1 calc(50% - 6px);
				}

				/* Row 2: Compliance badge and timer button move down together */
				.tf-compliance-badge {
					margin-left: 0;
					flex: 0 0 auto;
				}
				.tf-timer-badge {
					flex: 1 1 0;
				}
			}

			.tf-badge {
				padding: 10px 18px;
				border-radius: 12px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				white-space: normal;
				text-align: center;
				max-width: 100%;
				min-height: 44px;
				font-weight: bold;
				box-shadow: 0 2px 8px rgba(0,0,0,0.1);
			}

			/* Light theme - Clock badge uses the same gradient as other light elements */
			.tf-clock {
				padding: 10px 18px;
				border-radius: 12px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				white-space: normal;
				text-align: center;
				max-width: 100%;
				min-height: 44px;
				background: var(--background-primary-alt);
				color: var(--text-normal);
				font-weight: bold;
				font-variant-numeric: tabular-nums;
				box-shadow: 0 2px 8px rgba(0,0,0,0.1);
				border: 1px solid var(--background-modifier-border);
			}

			.tf-timer-badge {
				padding: 10px 18px;
				border-radius: 12px;
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 8px;
				white-space: normal;
				text-align: center;
				min-height: 44px;
				min-width: 0;
				cursor: pointer;
				transition: all 0.2s;
				border: none;
				font-family: inherit;
				font-size: inherit;
				font-weight: bold;
				box-shadow: 0 2px 8px rgba(0,0,0,0.1);
				/* Background colors are set dynamically based on timer state */
			}

			.tf-timer-badge:hover {
				transform: translateY(-1px);
				box-shadow: 0 4px 12px rgba(0,0,0,0.2);
			}

			.tf-timer-badge:active {
				transform: translateY(0);
			}

			/* Child elements inside timer badge should fill space */
			.tf-timer-badge > div:first-child {
				flex: 1;
			}

			.tf-compliance-badge {
				padding: 10px 14px;
				border-radius: 12px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-height: 44px;
				font-weight: bold;
				font-size: inherit;
				box-shadow: 0 2px 8px rgba(0,0,0,0.1);
				cursor: pointer;
			}

			/* Enable container queries on the dashboard container */
			.timeflow-dashboard {
				container-type: inline-size;
				container-name: dashboard;
			}

			/* Main cards container - wraps summary cards AND stats card for responsive layout */
			.tf-main-cards-wrapper {
				display: grid;
				gap: 15px;
				margin-bottom: 20px;
				width: 100%;
				box-sizing: border-box;
			}

			/* Mobile default: everything stacked */
			.tf-main-cards-wrapper {
				grid-template-columns: 1fr;
			}
			.tf-card-day { grid-column: 1; grid-row: 1; }
			.tf-card-week { grid-column: 1; grid-row: 2; }
			.tf-card-month { grid-column: 1; grid-row: 3; }
			.tf-card-stats { grid-column: 1; grid-row: 4; }

			/* Reduce gap and padding on very narrow containers */
			@container dashboard (max-width: 500px) {
				.tf-main-cards-wrapper { gap: 12px; }
				.tf-card { padding: 16px; }
			}

			/* Reduce side padding on mobile */
			@container dashboard (max-width: 400px) {
				.timeflow-dashboard {
					padding: 12px 8px;
				}
				.tf-card {
					padding: 12px;
				}
				.tf-badge-section {
					gap: 8px;
					margin: 12px 0;
				}
				.tf-badge, .tf-clock, .tf-timer-badge {
					padding: 8px 12px;
					min-height: 40px;
				}
			}

			/* Medium width: Day/Week side by side, Month and Stats stacked full width */
			@container dashboard (min-width: 400px) {
				.tf-main-cards-wrapper {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}
				.tf-card-day { grid-column: 1; grid-row: 1; }
				.tf-card-week { grid-column: 2; grid-row: 1; }
				.tf-card-month { grid-column: 1 / -1; grid-row: 2; }
				.tf-card-stats { grid-column: 1 / -1; grid-row: 3; }
			}

			/* Wide layout: 2x2 grid - Day/Week top, Month/Stats side by side bottom */
			@container dashboard (min-width: 750px) {
				.tf-card-month { grid-column: 1; grid-row: 2; }
				.tf-card-stats { grid-column: 2; grid-row: 2; }
			}

			/* Default card styling - used for month card */
			.tf-card {
				padding: 20px;
				border-radius: 12px;
				background: var(--background-primary-alt);
				color: var(--text-normal);
				box-shadow: 0 4px 12px rgba(0,0,0,0.15);
				box-sizing: border-box;
				min-width: 0;
				overflow: hidden;
				border: 1px solid var(--background-modifier-border);
			}

			.tf-card-spaced {
				margin-top: 24px;
			}

			.tf-card h3 {
				margin-top: 0;
				margin-bottom: 15px;
				font-size: 18px;
				color: var(--text-normal);
			}

			/* Daily and Weekly cards use dynamic backgrounds set in updateDayCard/updateWeekCard */
			.tf-card-day,
			.tf-card-week {
				/* Background and color set dynamically based on progress */
				position: relative;
			}

			/* Stats and history cards */
			.tf-card-stats,
			.tf-card-history {
				background: var(--background-primary-alt);
				color: var(--text-normal);
			}

			.tf-card-stats h3,
			.tf-card-history h3 {
				color: var(--text-normal);
			}

			.tf-stat-item {
				background: var(--background-secondary);
				color: var(--text-normal);
			}

			.tf-stat-label,
			.tf-stat-value {
				color: var(--text-normal);
			}

			.tf-stat-item div,
			.tf-stat-item .tf-stat-label {
				color: var(--text-normal);
			}

			.tf-card-stats .tf-stat-label {
				color: var(--text-normal);
			}

			/* Colored stat items should always have white text */
			.tf-stat-colored,
			.tf-stat-colored div,
			.tf-stat-colored .tf-stat-label,
			.tf-stat-colored .tf-stat-value {
				color: white !important;
			}

			/* Progress bar */
			.tf-progress-bar {
				width: 100%;
				height: 12px;
				background: var(--background-secondary);
				border-radius: 6px;
				overflow: hidden;
				margin: 10px 0;
			}

			/* Light theme - Progress fill uses green gradient from timeflow.js */
			.tf-progress-fill {
				height: 100%;
				background: linear-gradient(90deg, #4caf50, #2e7d32);
				transition: width 0.3s ease;
			}

			.tf-month-grid {
				display: grid;
				grid-template-columns: repeat(7, minmax(0, 1fr));
				gap: 12px;
				margin-top: 15px;
				width: 100%;
				box-sizing: border-box;
				min-width: 0;
			}

			/* Week number column in calendar */
			.tf-month-grid.with-week-numbers {
				grid-template-columns: clamp(16px, 5cqw, 28px) repeat(7, minmax(0, 1fr));
			}

			.tf-week-number-cell {
				font-size: clamp(9px, 2cqw, 11px);
				color: var(--text-normal);
				display: flex;
				align-items: center;
				justify-content: center;
				min-width: 0;
				border-radius: 4px;
				font-weight: 500;
			}

			/* Week compliance colors */
			.tf-week-number-cell.week-ok {
				background: linear-gradient(135deg, #c8e6c9, #a5d6a7);
				color: #ffffff;
			}
			.tf-week-number-cell.week-over {
				background: linear-gradient(135deg, #ffe0b2, #ffcc80);
				color: #000000;
			}
			.tf-week-number-cell.week-under {
				background: linear-gradient(135deg, #ffcdd2, #ef9a9a);
				color: #ffffff;
			}
			.tf-week-number-cell.week-partial {
				background: linear-gradient(135deg, #e0e0e0, #bdbdbd);
				color: #000000;
			}
			.tf-week-number-cell.week-future {
				background: transparent;
				color: var(--text-muted);
				opacity: 0.5;
			}

			.tf-week-number-header {
				font-size: clamp(8px, 2cqw, 10px);
				color: var(--text-muted);
				display: flex;
				align-items: center;
				justify-content: center;
				font-weight: bold;
				min-width: 0;
			}

			/* Week number badge in week card */
			.tf-week-badge {
				position: absolute;
				top: 12px;
				right: 12px;
				font-size: 12px;
				padding: 2px 8px;
				border-radius: 10px;
				background: rgba(255, 255, 255, 0.2);
				color: inherit;
				font-weight: normal;
			}

			/* Reduce gap linearly on narrow containers (below 400px) */
			@container dashboard (max-width: 400px) {
				.tf-month-grid {
					gap: clamp(2px, 2cqw, 8px);
				}
			}

			/* Day cells - consistent text colors across all themes since backgrounds are always the same */
			.tf-day-cell {
				aspect-ratio: 1;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 6px;
				font-size: clamp(10px, 2.5vw, 16px);
				font-weight: bold;
				cursor: pointer;
				transition: all 0.2s;
				position: relative;
				border: 2px solid transparent;
				text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
				min-width: 0;
				overflow: hidden;
			}

			/* Days with entries - text color set dynamically based on special day */
			.tf-day-cell.has-entry {
				color: var(--text-normal);
			}

			/* Days without entries */
			.tf-day-cell.no-entry {
				color: var(--text-muted);
			}

			.tf-day-cell:hover {
				transform: scale(1.05);
				box-shadow: 0 2px 8px rgba(0,0,0,0.2);
			}

			.tf-day-cell.today {
				border-color: var(--interactive-accent);
				font-weight: bold;
			}

			.tf-stats-grid {
				display: grid;
				grid-template-columns: 1fr;
				gap: 15px;
				margin-top: 15px;
			}

			/* Stats grid 2 columns at same breakpoint as day/week cards */
			@container dashboard (min-width: 400px) {
				.tf-stats-grid {
					grid-template-columns: repeat(2, 1fr);
				}
			}

			/* Future planned days list - only shown in wide layout */
			.tf-future-days-list {
				display: none;
			}

			@container dashboard (min-width: 750px) {
				.tf-future-days-list {
					display: block;
					margin-top: 20px;
					padding-top: 15px;
					border-top: 1px solid var(--background-modifier-border);
				}

				.tf-future-days-list h4 {
					margin: 0 0 10px 0;
					font-size: 14px;
					font-weight: 600;
					opacity: 0.8;
				}

				.tf-future-day-item {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 6px 0;
					font-size: 13px;
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.tf-future-day-item:last-child {
					border-bottom: none;
				}

				.tf-future-day-date {
					font-weight: 500;
				}

				.tf-future-day-type {
					padding: 2px 8px;
					border-radius: 4px;
					font-size: 12px;
					color: white;
				}
			}

			/* Stat items */
			.tf-stat-item {
				padding: 15px;
				background: var(--background-secondary);
				border-radius: 8px;
				color: var(--text-normal);
			}

			.tf-stat-label {
				font-size: 12px;
				margin-bottom: 5px;
				color: var(--text-muted);
			}

			.tf-stat-value {
				font-size: 20px;
				font-weight: bold;
				color: var(--text-normal);
			}

			/* Timeframe label styling */
			.tf-timeframe-label {
				color: var(--text-normal);
			}

			.tf-tabs {
				display: flex;
				gap: 8px;
				margin-bottom: 15px;
				border-bottom: 2px solid var(--background-modifier-border);
			}

			.tf-tab {
				padding: 6px 12px;
				cursor: pointer;
				border: none;
				background: var(--background-secondary);
				color: var(--text-normal);
				font-size: 0.9em;
				border-radius: 6px;
				transition: all 0.2s;
				font-weight: 500;
			}

			.tf-tab.active {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				font-weight: bold;
			}

			.tf-tab:hover {
				background: var(--background-modifier-hover);
				color: var(--text-normal);
			}

			.tf-button {
				padding: clamp(3px, 1.5cqw, 8px) clamp(6px, 3cqw, 16px);
				border-radius: 4px;
				border: 1px solid var(--background-modifier-border);
				background: var(--interactive-normal);
				color: var(--text-normal);
				cursor: pointer;
				font-size: clamp(10px, 3cqw, 14px);
				transition: all 0.2s;
				white-space: nowrap;
				min-width: 0;
				flex-shrink: 1;
			}

			.tf-button:hover {
				background: var(--interactive-hover);
			}

			/* Make buttons smaller on mobile */
			@media (max-width: 500px) {
				.tf-button {
					padding: 4px 8px;
					font-size: 11px;
					min-width: unset;
				}
			}

			.tf-heatmap {
				display: grid;
				gap: 2px;
				margin-top: 15px;
			}

			.tf-heatmap-cell {
				width: 100%;
				aspect-ratio: 1;
				border-radius: 4px;
				cursor: pointer;
				transition: transform 0.2s;
			}

			.tf-heatmap-cell:hover {
				transform: scale(1.2);
			}

			/* Make heatmap cells larger on mobile */
			@media (max-width: 600px) {
				.tf-heatmap {
					grid-template-columns: repeat(20, 1fr) !important;
				}
			}

			/* Context menu - uses same styling as submenu for consistency */
			/* Context menu - uses Obsidian native styling for all themes */
			.tf-context-menu {
				position: fixed;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 8px;
				box-shadow: 0 4px 12px rgba(0,0,0,0.3);
				padding: 4px;
				z-index: 1000;
				min-width: 200px;
				max-width: calc(100vw - 20px);
				display: flex;
				gap: 0;
				box-sizing: border-box;
			}

			.tf-context-menu-main {
				flex: 0 0 auto;
				min-width: 200px;
				box-sizing: border-box;
			}

			.tf-context-menu-info {
				flex: 0 0 auto;
				width: 250px;
				padding: 12px;
				border-left: 1px solid var(--background-modifier-border);
				background: var(--background-secondary);
				font-size: 0.85em;
				line-height: 1.4;
				box-sizing: border-box;
			}

			/* On mobile, stack menu vertically and make it full width */
			@media (max-width: 500px) {
				.tf-context-menu {
					flex-direction: column;
					width: calc(100vw - 20px);
					max-height: calc(100vh - 40px);
					overflow-y: auto;
				}

				.tf-context-menu-main {
					width: 100%;
				}

				.tf-context-menu-info {
					width: 100%;
					border-left: none;
					border-top: 1px solid var(--background-modifier-border);
				}
			}

			.tf-context-menu-info h4 {
				margin: 0 0 8px 0;
				font-size: 0.95em;
				color: var(--text-normal);
			}

			.tf-context-menu-info p {
				margin: 4px 0;
				color: var(--text-muted);
			}

			.tf-context-menu-info strong {
				color: var(--text-normal);
			}

			/* Compliance info panel */
			.tf-compliance-info-panel {
				position: fixed;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 8px;
				box-shadow: 0 4px 12px rgba(0,0,0,0.3);
				padding: 12px 16px;
				z-index: 1000;
				min-width: 220px;
				max-width: 300px;
			}

			.tf-compliance-info-panel h4 {
				margin: 0 0 10px 0;
				font-size: 0.95em;
				color: var(--text-normal);
			}

			.tf-compliance-info-panel p {
				margin: 6px 0;
				color: var(--text-muted);
				font-size: 0.9em;
			}

			.tf-compliance-info-panel strong {
				color: var(--text-normal);
			}

			.tf-menu-item {
				padding: 8px 16px;
				cursor: pointer;
				transition: background 0.2s;
				display: flex;
				align-items: center;
				gap: 10px;
				color: var(--text-normal);
			}

			.tf-menu-item:hover {
				background: var(--background-modifier-hover);
			}

			.tf-menu-separator {
				height: 1px;
				background: var(--background-modifier-border);
				margin: 4px 0;
			}

			/* Submenu styles */
			.tf-menu-item-with-submenu {
				position: relative;
				display: flex;
				justify-content: space-between;
				align-items: center;
			}

			.tf-submenu {
				display: none;
				position: absolute;
				left: 100%;
				top: 0;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 8px;
				box-shadow: 0 4px 12px rgba(0,0,0,0.3);
				padding: 4px;
				min-width: 180px;
				z-index: 1001;
			}

			.tf-menu-item-with-submenu:hover .tf-submenu {
				display: block;
			}

			.tf-submenu-arrow {
				font-size: 0.8em;
				opacity: 0.7;
			}

			.tf-status-bar {
				margin-top: 20px;
				padding: 15px;
				background: var(--background-secondary-alt);
				border-radius: 6px;
				border-left: 4px solid var(--interactive-accent);
			}

			.tf-collapsible {
				cursor: pointer;
				user-select: none;
			}

			.tf-collapsible-content {
				max-height: 0;
				overflow: hidden;
				transition: max-height 0.3s ease;
			}

			.tf-collapsible-content.open {
				max-height: none;
				overflow: visible;
			}

			/* Info section two-column grid */
			.tf-info-grid {
				display: grid;
				grid-template-columns: 1fr;
				gap: 20px;
				margin-top: 15px;
			}

			.tf-info-column {
				display: flex;
				flex-direction: column;
				gap: 15px;
			}

			.tf-info-box {
				padding: 12px;
				background: var(--background-primary);
				border-radius: 8px;
			}

			.tf-info-box h4 {
				margin: 0 0 10px 0;
				font-size: 0.95em;
			}

			/* Two columns when dashboard is wide enough */
			@container dashboard (min-width: 500px) {
				.tf-info-grid {
					grid-template-columns: 1fr 1fr;
				}
			}

			/* History header layout */
			.tf-history-header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 10px;
			}

			.tf-history-controls {
				display: flex;
				align-items: center;
				gap: 10px;
				flex: 0 0 auto;
			}

			/* History filter chips */
			.tf-history-filters {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
				padding: 10px 0;
				border-bottom: 1px solid var(--background-modifier-border);
				margin-bottom: 10px;
			}

			.tf-filter-chip {
				padding: 4px 12px;
				border-radius: 16px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: 0.85em;
				transition: all 0.15s ease;
			}

			.tf-filter-chip:hover {
				background: var(--background-secondary);
			}

			.tf-filter-chip.active {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border-color: var(--interactive-accent);
			}

			/* History table - shared styles for consistent column widths */
			.tf-history-table-wide,
			.tf-history-table-narrow {
				width: 100%;
				border-collapse: collapse;
				margin-bottom: 15px;
				table-layout: fixed;
			}

			.tf-history-table-wide th,
			.tf-history-table-wide td,
			.tf-history-table-narrow th,
			.tf-history-table-narrow td {
				padding: 8px;
				color: var(--text-normal);
				border-bottom: 1px solid var(--background-modifier-border);
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.tf-history-table-wide thead tr,
			.tf-history-table-narrow thead tr {
				background: var(--background-secondary);
			}

			/* Fixed column widths for wide table */
			.tf-history-table-wide th:nth-child(1),
			.tf-history-table-wide td:nth-child(1) { width: 100px; } /* Dato */
			.tf-history-table-wide th:nth-child(2),
			.tf-history-table-wide td:nth-child(2) { width: 120px; } /* Type */
			.tf-history-table-wide th:nth-child(3),
			.tf-history-table-wide td:nth-child(3) { width: 80px; } /* Start */
			.tf-history-table-wide th:nth-child(4),
			.tf-history-table-wide td:nth-child(4) { width: 80px; } /* Slutt */
			.tf-history-table-wide th:nth-child(5),
			.tf-history-table-wide td:nth-child(5) { width: 70px; } /* Timer */
			.tf-history-table-wide th:nth-child(6),
			.tf-history-table-wide td:nth-child(6) { width: 80px; } /* Fleksitid */
			.tf-history-table-wide th:nth-child(7),
			.tf-history-table-wide td:nth-child(7) { width: 40px; } /* Delete */

			/* Fixed column widths for narrow table */
			.tf-history-table-narrow th:nth-child(1),
			.tf-history-table-narrow td:nth-child(1) { width: 100px; } /* Dato */
			.tf-history-table-narrow th:nth-child(2),
			.tf-history-table-narrow td:nth-child(2) { width: auto; } /* Type */
			.tf-history-table-narrow th:nth-child(3),
			.tf-history-table-narrow td:nth-child(3) { width: 70px; } /* Timer */
			.tf-history-table-narrow th:nth-child(4),
			.tf-history-table-narrow td:nth-child(4) { width: 80px; } /* Fleksitid */
			.tf-history-table-narrow th:nth-child(5),
			.tf-history-table-narrow td:nth-child(5) { width: 50px; } /* Handling */

			.tf-history-table-wide input[type="time"] {
				padding: 4px 6px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				color: var(--text-normal);
				font-size: 0.9em;
				width: 100%;
				box-sizing: border-box;
			}

			.tf-history-table-wide select {
				padding: 4px 6px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				color: var(--text-normal);
				font-size: 0.9em;
				width: 100%;
				box-sizing: border-box;
			}

			.tf-history-table-wide input:focus,
			.tf-history-table-wide select:focus {
				outline: none;
				border-color: var(--interactive-accent);
			}

			.tf-history-edit-btn {
				padding: 4px 10px;
				border-radius: 4px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: 0.85em;
				white-space: nowrap;
				min-width: 80px;
			}

			.tf-history-edit-btn:hover {
				background: var(--background-secondary);
			}

			.tf-history-edit-btn.active {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border-color: var(--interactive-accent);
			}

			/* Hide edit button in narrow mode */
			.tf-history-edit-btn.tf-hide-narrow {
				display: none;
			}

			.tf-history-delete-btn {
				padding: 4px 8px;
				border: none;
				background: transparent;
				color: var(--text-muted);
				cursor: pointer;
				font-size: 1em;
				opacity: 0.7;
				transition: opacity 0.15s ease;
			}

			.tf-history-delete-btn:hover {
				opacity: 1;
				color: #f44336;
			}

			.tf-history-add-row {
				cursor: pointer;
			}

			.tf-history-add-row td {
				text-align: center;
				color: var(--text-muted);
				padding: 8px;
			}

			.tf-history-add-row:hover td {
				background: var(--background-secondary);
				color: var(--text-normal);
			}

			/* Delete confirmation dialog */
			.tf-confirm-overlay {
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				background: rgba(0, 0, 0, 0.5);
				display: flex;
				align-items: center;
				justify-content: center;
				z-index: 10000;
			}

			.tf-confirm-dialog {
				background: var(--background-primary);
				border-radius: 8px;
				padding: 20px;
				max-width: 400px;
				width: 90%;
				box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
			}

			.tf-confirm-title {
				font-size: 16px;
				font-weight: bold;
				margin-bottom: 12px;
				color: var(--text-normal);
			}

			.tf-confirm-message {
				font-size: 14px;
				color: var(--text-muted);
				margin-bottom: 8px;
			}

			.tf-confirm-details {
				background: var(--background-secondary);
				padding: 10px;
				border-radius: 4px;
				margin-bottom: 16px;
				font-size: 13px;
			}

			.tf-confirm-buttons {
				display: flex;
				gap: 10px;
				justify-content: flex-end;
			}

			.tf-confirm-cancel {
				padding: 8px 16px;
				border-radius: 4px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-secondary);
				color: var(--text-normal);
				cursor: pointer;
			}

			.tf-confirm-delete {
				padding: 8px 16px;
				border-radius: 4px;
				border: none;
				background: #f44336;
				color: white;
				cursor: pointer;
				font-weight: bold;
			}

			.tf-confirm-delete:hover {
				background: #d32f2f;
			}
		`;
		document.head.appendChild(style);
	}

	buildBadgeSection(): HTMLElement {
		const section = document.createElement("div");
		section.className = "tf-badge-section";

		// NEW: Hide badge in simple tracking mode
		if (!this.settings.enableGoalTracking) {
			section.style.display = 'none';
			return section;
		}

		const badge = document.createElement("div");
		badge.className = "tf-badge";
		this.elements.badge = badge;

		const clock = document.createElement("div");
		clock.className = "tf-clock";
		this.elements.clock = clock;

		// Compliance status badge
		const complianceBadge = document.createElement("div");
		complianceBadge.className = "tf-compliance-badge";
		this.elements.complianceBadge = complianceBadge;

		// Timer control badge
		const timerBadge = document.createElement("button");
		timerBadge.className = "tf-timer-badge";
		this.elements.timerBadge = timerBadge;

		section.appendChild(badge);
		section.appendChild(clock);
		section.appendChild(complianceBadge);
		section.appendChild(timerBadge);

		this.updateBadge();
		this.updateComplianceBadge();
		this.updateTimerBadge();
		this.updateClock();

		return section;
	}

	updateTimerBadge(): void {
		if (!this.elements.timerBadge) return;

		const activeTimers = this.timerManager.getActiveTimers();

		if (activeTimers.length === 0) {
			// Segmented start button: main part starts "jobb", arrow opens menu
			this.elements.timerBadge.empty();
			this.elements.timerBadge.style.background = "transparent";
			this.elements.timerBadge.style.display = "inline-flex";
			this.elements.timerBadge.style.alignItems = "stretch";
			this.elements.timerBadge.style.gap = "0";
			this.elements.timerBadge.style.padding = "0";
			this.elements.timerBadge.style.position = "relative";
			this.elements.timerBadge.onclick = null;

			// Main "Start" button (starts jobb)
			const startBtn = document.createElement("div");
			startBtn.textContent = "Start";
			startBtn.style.background = "#4caf50";
			startBtn.style.color = "white";
			startBtn.style.padding = "8px 12px";
			startBtn.style.cursor = "pointer";
			startBtn.style.borderRadius = "12px 0 0 12px";
			startBtn.style.display = "flex";
			startBtn.style.alignItems = "center";
			startBtn.style.justifyContent = "center";
			startBtn.style.transition = "filter 0.2s";
			startBtn.onmouseover = () => {
				startBtn.style.filter = "brightness(1.1)";
			};
			startBtn.onmouseout = () => {
				startBtn.style.filter = "";
			};
			startBtn.onclick = async (e) => {
				e.stopPropagation();
				await this.timerManager.startTimer('jobb');
				this.updateTimerBadge();
			};

			// Arrow dropdown button
			const arrowBtn = document.createElement("div");
			arrowBtn.textContent = "▼";
			arrowBtn.style.background = "#388e3c";
			arrowBtn.style.color = "white";
			arrowBtn.style.padding = "8px 8px";
			arrowBtn.style.cursor = "pointer";
			arrowBtn.style.borderRadius = "0 12px 12px 0";
			arrowBtn.style.fontSize = "0.8em";
			arrowBtn.style.display = "flex";
			arrowBtn.style.alignItems = "center";
			arrowBtn.style.borderLeft = "1px solid rgba(255,255,255,0.3)";
			arrowBtn.style.transition = "filter 0.2s";
			arrowBtn.onmouseover = () => {
				arrowBtn.style.filter = "brightness(1.1)";
			};
			arrowBtn.onmouseout = () => {
				arrowBtn.style.filter = "";
			};
			arrowBtn.onclick = (e) => {
				e.stopPropagation();
				this.showTimerTypeMenu(arrowBtn);
			};

			this.elements.timerBadge.appendChild(startBtn);
			this.elements.timerBadge.appendChild(arrowBtn);
		} else {
			// Stop button badge (active timer)
			this.elements.timerBadge.empty();
			this.elements.timerBadge.textContent = "Stopp";
			this.elements.timerBadge.style.background = "#f44336";
			this.elements.timerBadge.style.color = "white";
			this.elements.timerBadge.style.display = "inline-flex";
			this.elements.timerBadge.style.alignItems = "center";
			this.elements.timerBadge.style.justifyContent = "center";
			this.elements.timerBadge.style.padding = "";
			this.elements.timerBadge.onclick = async () => {
				// Stop all active timers
				for (const timer of activeTimers) {
					await this.timerManager.stopTimer(timer);
				}
				this.updateTimerBadge();
			};
		}
	}

	showTimerTypeMenu(button: HTMLElement): void {
		// Remove any existing menu
		const existingMenu = document.querySelector('.tf-timer-type-menu');
		if (existingMenu) {
			existingMenu.remove();
			return;
		}

		const menu = document.createElement('div');
		menu.className = 'tf-timer-type-menu';
		menu.style.position = 'fixed';
		menu.style.background = 'var(--background-primary)';
		menu.style.border = '1px solid var(--background-modifier-border)';
		menu.style.borderRadius = '8px';
		menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
		menu.style.zIndex = '1000';
		menu.style.minWidth = '150px';
		menu.style.overflow = 'hidden';

		const timerTypes = [
			{ name: 'jobb', icon: '💼', label: translateSpecialDayName('jobb') },
			{ name: 'kurs', icon: '📚', label: translateSpecialDayName('kurs') },
			{ name: 'studie', icon: '🎓', label: translateSpecialDayName('studie') }
		];

		timerTypes.forEach(type => {
			const item = document.createElement('div');
			item.style.padding = '10px 15px';
			item.style.cursor = 'pointer';
			item.style.display = 'flex';
			item.style.alignItems = 'center';
			item.style.gap = '8px';
			item.style.transition = 'background 0.2s';
			item.createSpan({ text: type.icon });
			item.createSpan({ text: type.label });

			item.onmouseover = () => {
				item.style.background = 'var(--background-modifier-hover)';
			};
			item.onmouseout = () => {
				item.style.background = '';
			};

			item.onclick = async () => {
				await this.timerManager.startTimer(type.name);
				this.updateTimerBadge();
				menu.remove();
			};

			menu.appendChild(item);
		});

		document.body.appendChild(menu);

		// Position the menu below the button with viewport boundary checks
		const rect = button.getBoundingClientRect();
		const menuRect = menu.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const margin = 10;

		let top = rect.bottom + 5;
		let left = rect.left;

		// Check if menu overflows bottom
		if (top + menuRect.height + margin > viewportHeight) {
			// Position above button instead
			top = rect.top - menuRect.height - 5;
		}

		// Check if menu overflows right
		if (left + menuRect.width + margin > viewportWidth) {
			// Align to right edge
			left = viewportWidth - menuRect.width - margin;
		}

		// Check if menu overflows left
		if (left < margin) {
			left = margin;
		}

		// Check if menu overflows top (after possible repositioning)
		if (top < margin) {
			top = margin;
		}

		menu.style.top = `${top}px`;
		menu.style.left = `${left}px`;

		// Close menu when clicking outside
		const closeMenu = (e: MouseEvent) => {
			if (!menu.contains(e.target as Node)) {
				menu.remove();
				document.removeEventListener('click', closeMenu);
			}
		};
		setTimeout(() => document.addEventListener('click', closeMenu), 0);
	}

	buildSummaryCards(): HTMLElement {
		const container = document.createElement("div");
		container.className = "tf-summary-cards";

		container.appendChild(this.createDayCard());
		container.appendChild(this.createWeekCard());
		container.appendChild(this.createMonthCard());

		return container;
	}

	createDayCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card tf-card-day";
		this.elements.dayCard = card;
		this.updateDayCard();
		return card;
	}

	createWeekCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card tf-card-week";
		this.elements.weekCard = card;
		this.updateWeekCard();
		return card;
	}

	createMonthCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card tf-card-month";

		const header = document.createElement("div");
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";
		header.style.marginBottom = "15px";
		header.style.flexWrap = "wrap";
		header.style.gap = "8px";

		const title = document.createElement("h3");
		title.textContent = t('ui.calendar');
		title.style.margin = "0";
		title.style.flexShrink = "1";
		title.style.minWidth = "0";

		const controls = document.createElement("div");
		controls.style.display = "flex";
		controls.style.gap = "5px";
		controls.style.flexShrink = "0";

		const prevBtn = document.createElement("button");
		prevBtn.textContent = "◄";
		prevBtn.className = "tf-button";
		prevBtn.onclick = () => {
			this.currentMonthOffset--;
			this.updateMonthCard();
		};

		const todayBtn = document.createElement("button");
		todayBtn.textContent = t('ui.today');
		todayBtn.className = "tf-button";
		todayBtn.onclick = () => {
			this.currentMonthOffset = 0;
			this.updateMonthCard();
		};

		const nextBtn = document.createElement("button");
		nextBtn.textContent = "►";
		nextBtn.className = "tf-button";
		nextBtn.onclick = () => {
			this.currentMonthOffset++;
			this.updateMonthCard();
		};

		controls.appendChild(prevBtn);
		controls.appendChild(todayBtn);
		controls.appendChild(nextBtn);

		header.appendChild(title);
		header.appendChild(controls);
		card.appendChild(header);

		const gridContainer = document.createElement("div");
		this.elements.monthCard = gridContainer;
		card.appendChild(gridContainer);

		// Container for future planned days list (only shown in wide layout)
		const futureDaysContainer = document.createElement("div");
		futureDaysContainer.className = "tf-future-days-list";
		card.appendChild(futureDaysContainer);

		this.updateMonthCard();

		return card;
	}

	createStatsCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card tf-card-stats";

		// Content wrapper for collapsible content (defined early so tabs can reference it)
		const contentWrapper = document.createElement("div");
		contentWrapper.className = "tf-collapsible-content open";

		// Header with title and tabs (collapsible)
		const headerRow = document.createElement("div");
		headerRow.className = "tf-collapsible";
		headerRow.style.display = "flex";
		headerRow.style.justifyContent = "space-between";
		headerRow.style.alignItems = "center";
		headerRow.style.flexWrap = "wrap";
		headerRow.style.gap = "10px";

		const header = document.createElement("h3");
		header.textContent = t('ui.statistics');
		header.style.margin = "0";
		headerRow.appendChild(header);

		const tabs = document.createElement("div");
		tabs.className = "tf-tabs";
		tabs.style.marginBottom = "0";
		tabs.style.borderBottom = "none";

		const timeframes = ["total", "year", "month"];
		const labels = { total: t('timeframes.total'), year: t('timeframes.year'), month: t('timeframes.month') };

		timeframes.forEach(tf => {
			const tab = document.createElement("button");
			tab.className = `tf-tab ${tf === this.statsTimeframe ? 'active' : ''}`;
			tab.textContent = labels[tf as keyof typeof labels];
			tab.onclick = () => {
				this.statsTimeframe = tf;
				// Update active state
				tabs.querySelectorAll('.tf-tab').forEach(t => t.classList.remove('active'));
				tab.classList.add('active');
				// Open section if collapsed
				if (!contentWrapper.classList.contains('open')) {
					contentWrapper.classList.add('open');
				}
				this.updateStatsCard();
			};
			tabs.appendChild(tab);
		});

		headerRow.appendChild(tabs);
		card.appendChild(headerRow);

		// Timeframe selector container
		const timeframeSelectorContainer = document.createElement("div");
		timeframeSelectorContainer.className = "tf-timeframe-selector";
		timeframeSelectorContainer.style.marginBottom = "15px";
		timeframeSelectorContainer.style.display = "flex";
		timeframeSelectorContainer.style.gap = "10px";
		timeframeSelectorContainer.style.alignItems = "center";
		timeframeSelectorContainer.style.flexWrap = "wrap";
		contentWrapper.appendChild(timeframeSelectorContainer);

		const statsContainer = document.createElement("div");
		statsContainer.className = "tf-stats-grid";
		this.elements.statsCard = statsContainer;
		contentWrapper.appendChild(statsContainer);

		card.appendChild(contentWrapper);

		// Add click handler to toggle collapsible (only on header, not tabs)
		header.onclick = () => {
			contentWrapper.classList.toggle('open');
		};
		header.style.cursor = 'pointer';

		this.updateStatsCard();

		return card;
	}

	buildInfoCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card tf-card-spaced";

		const header = document.createElement("div");
		header.className = "tf-collapsible";
		const h3 = header.createEl('h3', { text: t('ui.information') });
		h3.style.margin = '0';

		const content = document.createElement("div");
		content.className = "tf-collapsible-content";

		// Build special day info dynamically from settings (excluding jobb work type)
		const specialDayInfo = this.settings.specialDayBehaviors
			.filter(b => !b.isWorkType) // Exclude jobb from this list
			.map(behavior => ({
				key: behavior.id,
				emoji: behavior.icon,
				desc: this.getFlextimeEffectDescription(behavior)
			}));

		// Add system entry for days with no data
		specialDayInfo.push({ key: t('ui.noRegistration'), emoji: "⚪", desc: t('ui.noDataForDay') });

		// Build info grid using DOM API
		const infoGrid = content.createDiv({ cls: 'tf-info-grid' });

		// Left Column: Day types and colors
		const leftColumn = infoGrid.createDiv({ cls: 'tf-info-column' });

		// Special day types box
		const specialDaysBox = leftColumn.createDiv({ cls: 'tf-info-box' });
		specialDaysBox.createEl('h4', { text: t('info.specialDayTypes') });
		const specialDaysList = specialDaysBox.createEl('ul');
		specialDaysList.style.listStyle = 'none';
		specialDaysList.style.paddingLeft = '0';
		specialDaysList.style.margin = '0';

		specialDayInfo.forEach(item => {
			const color = getSpecialDayColors(this.settings)[item.key] || "transparent";
			const label = translateSpecialDayName(item.key);
			const li = specialDaysList.createEl('li');
			li.style.display = 'flex';
			li.style.alignItems = 'center';
			li.style.marginBottom = '8px';
			li.style.fontSize = '0.9em';

			const colorBox = li.createDiv();
			colorBox.style.width = '16px';
			colorBox.style.height = '16px';
			colorBox.style.background = color;
			colorBox.style.borderRadius = '3px';
			colorBox.style.border = '1px solid var(--background-modifier-border)';
			colorBox.style.marginRight = '8px';
			colorBox.style.flexShrink = '0';

			const textSpan = li.createSpan({ text: item.emoji + ' ' });
			textSpan.createEl('strong', { text: label });
			textSpan.appendText(': ' + item.desc);
		});

		// Work days gradient box
		const gradientBox = leftColumn.createDiv({ cls: 'tf-info-box' });
		gradientBox.createEl('h4', { text: t('info.workDaysGradient') });
		const gradientP = gradientBox.createEl('p', { text: t('info.colorShowsFlextime') + ' (' + this.settings.baseWorkday + 'h):' });
		gradientP.style.margin = '0 0 10px 0';
		gradientP.style.fontSize = '0.9em';

		// Positive gradient
		const posGradient = gradientBox.createDiv();
		posGradient.style.height = '16px';
		posGradient.style.borderRadius = '8px';
		posGradient.style.background = `linear-gradient(to right, ${this.flextimeColor(0)}, ${this.flextimeColor(1.5)}, ${this.flextimeColor(3)})`;
		posGradient.style.margin = '4px 0';
		posGradient.style.border = '1px solid var(--background-modifier-border)';

		const posLabels = gradientBox.createDiv();
		posLabels.style.display = 'flex';
		posLabels.style.justifyContent = 'space-between';
		posLabels.style.fontSize = '0.8em';
		posLabels.style.color = 'var(--text-muted)';
		posLabels.style.marginBottom = '10px';
		posLabels.createSpan({ text: '0h' });
		posLabels.createSpan({ text: '+1.5h' });
		posLabels.createSpan({ text: '+3h' });

		// Negative gradient
		const negGradient = gradientBox.createDiv();
		negGradient.style.height = '16px';
		negGradient.style.borderRadius = '8px';
		negGradient.style.background = `linear-gradient(to right, ${this.flextimeColor(-3)}, ${this.flextimeColor(-1.5)}, ${this.flextimeColor(0)})`;
		negGradient.style.margin = '4px 0';
		negGradient.style.border = '1px solid var(--background-modifier-border)';

		const negLabels = gradientBox.createDiv();
		negLabels.style.display = 'flex';
		negLabels.style.justifyContent = 'space-between';
		negLabels.style.fontSize = '0.8em';
		negLabels.style.color = 'var(--text-muted)';
		negLabels.createSpan({ text: '-3h' });
		negLabels.createSpan({ text: '-1.5h' });
		negLabels.createSpan({ text: '0h' });

		// Right Column: Calendar and balance
		const rightColumn = infoGrid.createDiv({ cls: 'tf-info-column' });

		// Calendar context menu box
		const calendarBox = rightColumn.createDiv({ cls: 'tf-info-box' });
		calendarBox.createEl('h4', { text: t('info.calendarContextMenu') });
		const calendarP = calendarBox.createEl('p', { text: t('info.clickDayFor') });
		calendarP.style.margin = '0 0 8px 0';
		calendarP.style.fontSize = '0.9em';
		const calendarList = calendarBox.createEl('ul');
		calendarList.style.margin = '0 0 0 16px';
		calendarList.style.fontSize = '0.9em';
		calendarList.style.paddingLeft = '0';
		calendarList.style.listStylePosition = 'inside';
		calendarList.createEl('li', { text: t('info.createDailyNote') });
		calendarList.createEl('li', { text: t('info.editFlextimeManually') });
		calendarList.createEl('li', { text: t('info.registerSpecialDays') });

		// Helper to create color indicator rows
		const createColorRow = (container: HTMLElement, color: string, label: string, desc: string) => {
			const row = container.createDiv();
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '8px';
			const colorSpan = row.createSpan();
			colorSpan.style.display = 'inline-block';
			colorSpan.style.width = '16px';
			colorSpan.style.height = '16px';
			colorSpan.style.borderRadius = '3px';
			colorSpan.style.background = color;
			colorSpan.style.flexShrink = '0';
			const textSpan = row.createSpan();
			textSpan.createEl('strong', { text: label + ':' });
			textSpan.appendText(' ' + desc);
		};

		// Flextime balance zones box
		const balanceBox = rightColumn.createDiv({ cls: 'tf-info-box' });
		balanceBox.createEl('h4', { text: t('info.flextimeBalanceZones') });
		const balanceContainer = balanceBox.createDiv();
		balanceContainer.style.display = 'flex';
		balanceContainer.style.flexDirection = 'column';
		balanceContainer.style.gap = '6px';
		balanceContainer.style.fontSize = '0.9em';
		createColorRow(balanceContainer, this.settings.customColors?.balanceOk || '#4caf50', t('info.green'), this.settings.balanceThresholds.warningLow + 'h ' + t('info.to') + ' +' + this.settings.balanceThresholds.warningHigh + 'h');
		createColorRow(balanceContainer, this.settings.customColors?.balanceWarning || '#ff9800', t('info.yellow'), this.settings.balanceThresholds.criticalLow + 'h ' + t('info.to') + ' ' + (this.settings.balanceThresholds.warningLow - 1) + 'h / +' + this.settings.balanceThresholds.warningHigh + 'h ' + t('info.to') + ' +' + this.settings.balanceThresholds.criticalHigh + 'h');
		createColorRow(balanceContainer, this.settings.customColors?.balanceCritical || '#f44336', t('info.red'), '<' + this.settings.balanceThresholds.criticalLow + 'h / >+' + this.settings.balanceThresholds.criticalHigh + 'h');

		// Week number compliance box
		const weekBox = rightColumn.createDiv({ cls: 'tf-info-box' });
		weekBox.createEl('h4', { text: t('info.weekNumberCompliance') });
		const weekContainer = weekBox.createDiv();
		weekContainer.style.display = 'flex';
		weekContainer.style.flexDirection = 'column';
		weekContainer.style.gap = '6px';
		weekContainer.style.fontSize = '0.9em';
		createColorRow(weekContainer, 'linear-gradient(135deg, #c8e6c9, #a5d6a7)', t('info.green'), t('info.reachedGoal') + ' (±0.5h)');
		createColorRow(weekContainer, 'linear-gradient(135deg, #ffe0b2, #ffcc80)', t('info.orange'), t('info.overGoal'));
		createColorRow(weekContainer, 'linear-gradient(135deg, #ffcdd2, #ef9a9a)', t('info.red'), t('info.underGoal'));
		createColorRow(weekContainer, 'linear-gradient(135deg, #e0e0e0, #bdbdbd)', t('info.gray'), t('info.weekInProgress'));
		const weekTip = weekBox.createEl('p');
		weekTip.style.margin = '8px 0 0 0';
		weekTip.style.fontSize = '0.8em';
		weekTip.style.opacity = '0.8';
		weekTip.createEl('em', { text: t('info.clickWeekForDetails') });

		header.onclick = () => {
			content.classList.toggle('open');
		};

		card.appendChild(header);
		card.appendChild(content);

		return card;
	}

	buildHistoryCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card tf-card-history tf-card-spaced";

		// Collapsible header with title and tabs
		const header = document.createElement("div");
		header.className = "tf-collapsible tf-history-header";

		// Left side: title
		const title = document.createElement("h3");
		title.textContent = t('ui.history');
		title.style.margin = "0";
		title.style.flex = "1 1 auto";
		header.appendChild(title);

		// Right side container for edit button and tabs
		const rightControls = document.createElement("div");
		rightControls.className = "tf-history-controls";

		// Collapsible content container
		const content = document.createElement("div");
		content.className = "tf-collapsible-content"; // Start closed (no 'open' class)

		// Create details element (for the actual content)
		const detailsElement = document.createElement("div");
		detailsElement.className = "tf-history-content";
		detailsElement.style.maxHeight = "500px";
		detailsElement.style.overflow = "auto";

		// Edit toggle button (to the LEFT of tabs so tabs don't shift)
		const editToggle = document.createElement("button");
		editToggle.className = `tf-history-edit-btn ${this.inlineEditMode ? 'active' : ''}`;
		editToggle.textContent = this.inlineEditMode ? `✓ ${t('buttons.done')}` : `✏️ ${t('buttons.edit')}`;
		editToggle.onclick = (e) => {
			e.stopPropagation(); // Don't trigger header collapse
			this.inlineEditMode = !this.inlineEditMode;
			editToggle.textContent = this.inlineEditMode ? `✓ ${t('buttons.done')}` : `✏️ ${t('buttons.edit')}`;
			editToggle.classList.toggle('active', this.inlineEditMode);
			this.refreshHistoryView(detailsElement);
		};
		rightControls.appendChild(editToggle);

		// View tabs in header (matching stats card style)
		const tabs = document.createElement("div");
		tabs.className = "tf-tabs";
		tabs.style.marginBottom = "0";
		tabs.style.borderBottom = "none";

		const views = [
			{ id: "list", label: t('buttons.list') },
			{ id: "heatmap", label: t('buttons.heatmap') }
		];

		views.forEach(view => {
			const tab = document.createElement("button");
			tab.textContent = view.label;
			tab.className = `tf-tab ${this.historyView === view.id ? 'active' : ''}`;
			tab.onclick = (e) => {
				e.stopPropagation(); // Don't trigger header collapse
				this.historyView = view.id;
				// Exit edit mode when switching views
				this.inlineEditMode = false;
				editToggle.textContent = `✏️ ${t('buttons.edit')}`;
				editToggle.classList.remove('active');
				// Update active state
				tabs.querySelectorAll('.tf-tab').forEach(t => t.classList.remove('active'));
				tab.classList.add('active');
				// Open section if collapsed
				if (!content.classList.contains('open')) {
					content.classList.add('open');
				}
				this.refreshHistoryView(detailsElement);
			};
			tabs.appendChild(tab);
		});

		rightControls.appendChild(tabs);
		header.appendChild(rightControls);

		// Store references for width detection
		(card as any)._editToggle = editToggle;
		(card as any)._detailsElement = detailsElement;

		content.appendChild(detailsElement);

		// Toggle collapse on header click (like Informasjon section)
		header.onclick = () => {
			content.classList.toggle('open');
		};
		header.style.cursor = 'pointer';

		card.appendChild(header);
		card.appendChild(content);

		this.refreshHistoryView(detailsElement);

		// Use requestAnimationFrame to check width after render
		requestAnimationFrame(() => {
			this.updateEditToggleVisibility(detailsElement);
		});

		return card;
	}

	buildStatusBar(): HTMLElement {
		const bar = document.createElement("div");
		bar.className = "tf-status-bar";

		const status = this.systemStatus;
		const hasErrors = status.validation?.hasErrors;
		const hasWarnings = status.validation?.hasWarnings;
		const statusIcon = hasErrors ? "❌" : hasWarnings ? "⚠️" : "✅";
		const hasIssues = hasErrors || hasWarnings;

		// Helper function to build issues into a container
		const buildIssuesContent = (container: HTMLElement) => {
			if (hasIssues && status.validation?.issues) {
				const errors = status.validation.issues.errors || [];
				const warnings = status.validation.issues.warnings || [];

				if (errors.length > 0) {
					const errorHeader = container.createDiv();
					errorHeader.style.marginTop = '8px';
					const errorStrong = errorHeader.createEl('strong');
					errorStrong.style.color = '#f44336';
					errorStrong.textContent = `Feil (${errors.length}):`;

					errors.slice(0, 5).forEach((err: any) => {
						const errorItem = container.createDiv();
						errorItem.style.cssText = 'font-size: 12px; margin-left: 12px; color: #f44336;';
						errorItem.textContent = `• ${err.type}: ${err.description}${err.date ? ` (${err.date})` : ''}`;
					});
					if (errors.length > 5) {
						const moreErrors = container.createDiv();
						moreErrors.style.cssText = 'font-size: 11px; margin-left: 12px; color: var(--text-muted);';
						moreErrors.textContent = `...og ${errors.length - 5} flere feil`;
					}
				}

				if (warnings.length > 0) {
					const warningHeader = container.createDiv();
					warningHeader.style.marginTop = '8px';
					const warningStrong = warningHeader.createEl('strong');
					warningStrong.style.color = '#ff9800';
					warningStrong.textContent = `Advarsler (${warnings.length}):`;

					warnings.slice(0, 5).forEach((warn: any) => {
						const warningItem = container.createDiv();
						warningItem.style.cssText = 'font-size: 12px; margin-left: 12px; color: #ff9800;';
						warningItem.textContent = `• ${warn.type}: ${warn.description}${warn.date ? ` (${warn.date})` : ''}`;
					});
					if (warnings.length > 5) {
						const moreWarnings = container.createDiv();
						moreWarnings.style.cssText = 'font-size: 11px; margin-left: 12px; color: var(--text-muted);';
						moreWarnings.textContent = `...og ${warnings.length - 5} flere advarsler`;
					}
				}
			}
		};

		// Create header using DOM API
		const header = document.createElement("div");
		header.style.cssText = "display: flex; align-items: center; gap: 10px; cursor: pointer;";

		header.createSpan({ text: statusIcon });

		const headerContent = header.createDiv();
		headerContent.style.flex = '1';

		const titleRow = headerContent.createDiv();
		titleRow.createEl('strong', { text: t('status.systemStatus') });
		if (hasIssues) {
			const clickHint = titleRow.createSpan({ text: ` (${t('status.clickForDetails')})` });
			clickHint.style.cssText = 'font-size: 11px; opacity: 0.7;';
		}

		const statusRow = headerContent.createDiv();
		statusRow.style.cssText = 'font-size: 12px; color: var(--text-muted);';
		statusRow.textContent = `${status.holiday?.message || t('status.holidayNotLoaded')} • ${status.activeTimers || 0} ${t('status.activeTimers')} • ${status.validation?.issues?.stats?.totalEntries || 0} ${t('status.entriesChecked')}`;

		if (hasIssues) {
			const toggle = header.createSpan({ cls: 'tf-status-toggle', text: '▶' });
			toggle.style.cssText = 'font-size: 10px; transition: transform 0.2s;';
		}

		bar.appendChild(header);

		// Create collapsible details section
		if (hasIssues) {
			const details = document.createElement("div");
			details.className = "tf-status-details";
			details.style.cssText = "max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out; opacity: 0;";

			const detailsInner = details.createDiv();
			detailsInner.style.cssText = 'padding-top: 10px; border-top: 1px solid var(--background-modifier-border); margin-top: 10px;';
			buildIssuesContent(detailsInner);

			bar.appendChild(details);

			// Toggle click handler
			let isOpen = false;
			header.onclick = () => {
				isOpen = !isOpen;
				const toggle = header.querySelector('.tf-status-toggle') as HTMLElement;
				if (toggle) {
					toggle.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
				}
				if (isOpen) {
					details.style.maxHeight = details.scrollHeight + 'px';
					details.style.opacity = '1';
				} else {
					details.style.maxHeight = '0';
					details.style.opacity = '0';
				}
			};
		}

		return bar;
	}

	buildViewToggle(): HTMLElement {
		const container = document.createElement("div");
		container.style.cssText = "display: flex; justify-content: flex-end; margin-top: 8px;";

		const viewToggle = document.createElement("button");
		const isInSidebar = this.isViewInSidebar();
		viewToggle.className = "tf-view-toggle";
		viewToggle.style.cssText = `
			background: var(--background-secondary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px;
			padding: 6px 10px;
			cursor: pointer;
			font-size: 12px;
			display: flex;
			align-items: center;
			gap: 6px;
			color: var(--text-normal);
			transition: background 0.2s, border-color 0.2s;
			font-weight: 500;
		`;
		const iconSpan = viewToggle.createSpan();
		iconSpan.style.fontSize = '14px';
		iconSpan.textContent = isInSidebar ? '⊞' : '◧';
		viewToggle.appendText(' ' + (isInSidebar ? t('buttons.moveToMain') : t('buttons.moveToSidebar')));
		viewToggle.title = isInSidebar ? t('buttons.moveToMain') : t('buttons.moveToSidebar');

		viewToggle.onmouseenter = () => {
			viewToggle.style.background = "var(--background-modifier-hover)";
			viewToggle.style.borderColor = "var(--interactive-accent)";
		};
		viewToggle.onmouseleave = () => {
			viewToggle.style.background = "var(--background-secondary)";
			viewToggle.style.borderColor = "var(--background-modifier-border)";
		};

		viewToggle.onclick = (e) => {
			e.stopPropagation();
			const newLocation = isInSidebar ? 'main' : 'sidebar';
			this.plugin.moveViewToLocation(newLocation);
		};

		container.appendChild(viewToggle);
		return container;
	}

	updateClock(): void {
		if (!this.elements.clock) return;
		const now = new Date();
		this.elements.clock.textContent = now.toLocaleTimeString('nb-NO', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	updateBadge(): void {
		if (!this.elements.badge) return;
		const balance = this.data.getCurrentBalance();
		const formatted = Utils.formatHoursToHM(Math.abs(balance), this.settings.hourUnit);
		const sign = balance >= 0 ? "+" : "-";

		const color = this.getBalanceColor(balance);

		this.elements.badge.style.background = color;
		this.elements.badge.style.color = "white";
		this.elements.badge.textContent = `${t('ui.flextimeBalance')}: ${sign}${formatted}`;
	}

	/**
	 * Check if the current view is in the sidebar (right or left)
	 */
	isViewInSidebar(): boolean {
		const leaves = this.app.workspace.getLeavesOfType('timeflow-view');
		if (leaves.length === 0) return true; // Default assumption
		const leaf = leaves[0];
		const root = leaf.getRoot();
		// Check if the leaf is in a side dock (right or left sidebar)
		return root === this.app.workspace.rightSplit || root === this.app.workspace.leftSplit;
	}

	/**
	 * Get compliance status: 'ok' | 'approaching' | 'exceeded'
	 * Based on daily and weekly hours compared to limits
	 */
	getComplianceStatus(): { status: 'ok' | 'approaching' | 'exceeded'; dailyStatus: 'ok' | 'approaching' | 'exceeded'; weeklyStatus: 'ok' | 'approaching' | 'exceeded'; tooltip: string } {
		if (!this.settings.complianceSettings?.enableWarnings) {
			return { status: 'ok', dailyStatus: 'ok', weeklyStatus: 'ok', tooltip: '' };
		}

		const today = new Date();
		const todayHours = this.data.getTodayHours(today);
		const weekHours = this.data.getCurrentWeekHours(today);

		const dailyLimit = this.settings.complianceSettings?.dailyHoursLimit ?? 9;
		const weeklyLimit = this.settings.complianceSettings?.weeklyHoursLimit ?? 40;
		const dailyApproaching = this.settings.baseWorkday * this.settings.workPercent;
		const weeklyApproaching = this.settings.baseWorkweek * this.settings.workPercent;

		let dailyStatus: 'ok' | 'approaching' | 'exceeded' = 'ok';
		let weeklyStatus: 'ok' | 'approaching' | 'exceeded' = 'ok';

		if (todayHours >= dailyLimit) {
			dailyStatus = 'exceeded';
		} else if (todayHours >= dailyApproaching) {
			dailyStatus = 'approaching';
		}

		if (weekHours >= weeklyLimit) {
			weeklyStatus = 'exceeded';
		} else if (weekHours >= weeklyApproaching) {
			weeklyStatus = 'approaching';
		}

		// Overall status is the worst of daily and weekly
		let status: 'ok' | 'approaching' | 'exceeded' = 'ok';
		if (dailyStatus === 'exceeded' || weeklyStatus === 'exceeded') {
			status = 'exceeded';
		} else if (dailyStatus === 'approaching' || weeklyStatus === 'approaching') {
			status = 'approaching';
		}

		// Build tooltip
		const tooltipParts: string[] = [];
		if (dailyStatus === 'exceeded') {
			tooltipParts.push(`${t('ui.today')}: ${todayHours.toFixed(1)}${this.settings.hourUnit} (max ${dailyLimit}${this.settings.hourUnit})`);
		} else if (dailyStatus === 'approaching') {
			tooltipParts.push(`${t('ui.today')}: ${todayHours.toFixed(1)}${this.settings.hourUnit} (${t('status.approachingLimits')} ${dailyLimit}${this.settings.hourUnit})`);
		}
		if (weeklyStatus === 'exceeded') {
			tooltipParts.push(`${t('ui.week')}: ${weekHours.toFixed(1)}${this.settings.hourUnit} (max ${weeklyLimit}${this.settings.hourUnit})`);
		} else if (weeklyStatus === 'approaching') {
			tooltipParts.push(`${t('ui.week')}: ${weekHours.toFixed(1)}${this.settings.hourUnit} (${t('status.approachingLimits')} ${weeklyLimit}${this.settings.hourUnit})`);
		}
		if (tooltipParts.length === 0 && status === 'ok') {
			tooltipParts.push(`${t('ui.today')}: ${todayHours.toFixed(1)}${this.settings.hourUnit}, ${t('ui.week')}: ${weekHours.toFixed(1)}${this.settings.hourUnit} - ${t('status.withinLimits')}`);
		}

		return { status, dailyStatus, weeklyStatus, tooltip: tooltipParts.join('\n') };
	}

	/**
	 * Update compliance status badge
	 */
	updateComplianceBadge(): void {
		if (!this.elements.complianceBadge) return;

		if (!this.settings.complianceSettings?.enableWarnings) {
			this.elements.complianceBadge.style.display = 'none';
			return;
		}

		const { status } = this.getComplianceStatus();

		this.elements.complianceBadge.style.display = '';
		this.elements.complianceBadge.style.cursor = 'pointer';

		if (status === 'ok') {
			this.elements.complianceBadge.style.background = 'rgba(76, 175, 80, 0.2)';
			this.elements.complianceBadge.style.border = '1px solid rgba(76, 175, 80, 0.4)';
			this.elements.complianceBadge.textContent = '🟩 OK';
		} else if (status === 'approaching') {
			this.elements.complianceBadge.style.background = 'rgba(255, 152, 0, 0.2)';
			this.elements.complianceBadge.style.border = '1px solid rgba(255, 152, 0, 0.4)';
			this.elements.complianceBadge.textContent = '🟨 Nær';
		} else {
			this.elements.complianceBadge.style.background = 'rgba(244, 67, 54, 0.2)';
			this.elements.complianceBadge.style.border = '1px solid rgba(244, 67, 54, 0.4)';
			this.elements.complianceBadge.textContent = '🟥 Over';
		}

		// Add click handler to show info panel
		this.elements.complianceBadge.onclick = (e) => {
			e.stopPropagation();
			this.showComplianceInfoPanel();
		};
	}

	/**
	 * Show compliance info panel with detailed information
	 */
	showComplianceInfoPanel(): void {
		// Remove existing panel if open
		const existingPanel = document.querySelector('.tf-compliance-info-panel');
		if (existingPanel) {
			existingPanel.remove();
			return; // Toggle behavior: click again to close
		}

		const today = new Date();
		const todayStr = Utils.toLocalDateStr(today);
		const todayHours = this.data.getTodayHours(today);
		const weekHours = this.data.getCurrentWeekHours(today);

		const dailyLimit = this.settings.complianceSettings?.dailyHoursLimit ?? 9;
		const weeklyLimit = this.settings.complianceSettings?.weeklyHoursLimit ?? 40;
		const minimumRest = this.settings.complianceSettings?.minimumRestHours ?? 11;

		const { dailyStatus, weeklyStatus } = this.getComplianceStatus();

		// Check rest period violation for today
		const restCheck = this.data.checkRestPeriodViolation(todayStr);

		// Create panel
		const panel = document.createElement('div');
		panel.className = 'tf-compliance-info-panel';

		// Build content using DOM API
		panel.createEl('h4', { text: `⚖️ ${t('compliance.title')}` });

		// Daily hours
		const dailyIcon = dailyStatus === 'ok' ? '🟩' : dailyStatus === 'approaching' ? '🟨' : '🟥';
		const dailyP = panel.createEl('p');
		dailyP.createEl('strong', { text: `${t('ui.today')}: ` });
		dailyP.appendText(`${dailyIcon} ${todayHours.toFixed(1)}t / ${dailyLimit}t`);

		// Weekly hours
		const weeklyIcon = weeklyStatus === 'ok' ? '🟩' : weeklyStatus === 'approaching' ? '🟨' : '🟥';
		const weeklyP = panel.createEl('p');
		weeklyP.createEl('strong', { text: `${t('ui.thisWeek')}: ` });
		weeklyP.appendText(`${weeklyIcon} ${weekHours.toFixed(1)}t / ${weeklyLimit}t`);

		// Rest period
		if (restCheck.violated && restCheck.restHours !== null) {
			const restP = panel.createEl('p', { cls: 'tf-rest-warning' });
			restP.createEl('strong', { text: `${t('ui.restPeriod')}: ` });
			restP.appendText(`🟥 ${restCheck.restHours.toFixed(1)}t (${t('ui.minimum')} ${minimumRest}t)`);
		} else if (restCheck.restHours !== null) {
			const restP = panel.createEl('p');
			restP.createEl('strong', { text: `${t('ui.restPeriod')}: ` });
			restP.appendText(`🟩 ${restCheck.restHours.toFixed(1)}t (${t('ui.minimum')} ${minimumRest}t)`);
		}

		// Add status explanation
		const hr = panel.createEl('hr');
		hr.style.cssText = 'margin: 10px 0; border: none; border-top: 1px solid var(--background-modifier-border);';

		let statusText: string;
		if (dailyStatus === 'exceeded' || weeklyStatus === 'exceeded' || restCheck.violated) {
			statusText = `${t('compliance.exceeds')} ${t('compliance.limit')}.`;
		} else if (dailyStatus === 'approaching' || weeklyStatus === 'approaching') {
			statusText = `${t('status.approachingLimits')} ${t('compliance.limit')}.`;
		} else {
			statusText = t('status.allLimitsOk');
		}
		const statusP = panel.createEl('p', { text: statusText });
		statusP.style.cssText = 'font-size: 12px; color: var(--text-muted);';

		// Position panel near the badge
		const badgeRect = this.elements.complianceBadge!.getBoundingClientRect();
		panel.style.position = 'fixed';
		panel.style.top = `${badgeRect.bottom + 8}px`;
		panel.style.right = `${window.innerWidth - badgeRect.right}px`;

		document.body.appendChild(panel);

		// Close when clicking outside
		const closeHandler = (e: MouseEvent) => {
			if (!panel.contains(e.target as Node) && e.target !== this.elements.complianceBadge) {
				panel.remove();
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 0);
	}

	/**
	 * Generate compliance warning HTML for daily hours
	 */
	getDailyComplianceWarning(hours: number): string {
		if (!this.settings.complianceSettings?.enableWarnings) return '';

		const dailyLimit = this.settings.complianceSettings?.dailyHoursLimit ?? 9;
		const approachingThreshold = this.settings.baseWorkday * this.settings.workPercent; // 7.5 hours default

		if (hours >= dailyLimit) {
			return `<span class="tf-compliance-warning exceeded" title="Overstiger daglig grense på ${dailyLimit} timer">⚠️ >${dailyLimit}t</span>`;
		} else if (hours >= approachingThreshold) {
			return `<span class="tf-compliance-warning approaching" title="Nærmer seg daglig grense på ${dailyLimit} timer">⏰ ${dailyLimit}t grense</span>`;
		}
		return '';
	}

	/**
	 * Generate compliance warning HTML for weekly hours
	 */
	getWeeklyComplianceWarning(hours: number): string {
		if (!this.settings.complianceSettings?.enableWarnings) return '';

		const weeklyLimit = this.settings.complianceSettings?.weeklyHoursLimit ?? 40;
		const approachingThreshold = this.settings.baseWorkweek * this.settings.workPercent; // 37.5 hours default

		if (hours >= weeklyLimit) {
			return `<span class="tf-compliance-warning exceeded" title="Overstiger ukentlig grense på ${weeklyLimit} timer">⚠️ >${weeklyLimit}t</span>`;
		} else if (hours >= approachingThreshold) {
			return `<span class="tf-compliance-warning approaching" title="Nærmer seg ukentlig grense på ${weeklyLimit} timer">⏰ ${weeklyLimit}t grense</span>`;
		}
		return '';
	}

	updateDayCard(): void {
		if (!this.elements.dayCard) return;

		const today = new Date();
		const todayKey = Utils.toLocalDateStr(today);
		const todayHours = this.data.getTodayHours(today);

		// Update compliance badge whenever day card updates
		this.updateComplianceBadge();

		// NEW: Simple tracking mode
		if (!this.settings.enableGoalTracking) {
			this.elements.dayCard.style.background = "var(--background-secondary)";
			this.elements.dayCard.style.color = "var(--text-normal)";
			this.elements.dayCard.empty();

			const h3 = this.elements.dayCard.createEl('h3', { text: 'I dag' });
			h3.style.color = 'inherit';

			const hoursDiv = this.elements.dayCard.createDiv({ text: Utils.formatHoursToHM(todayHours, this.settings.hourUnit) });
			hoursDiv.style.cssText = 'font-size: 32px; font-weight: bold; margin: 10px 0;';

			const labelDiv = this.elements.dayCard.createDiv({ text: t('ui.hoursWorked') });
			labelDiv.style.cssText = 'font-size: 14px; opacity: 0.9; margin-top: 10px;';
			return;
		}

		const goal = this.data.getDailyGoal(todayKey);

		const progress = goal > 0 ? Math.min((todayHours / goal) * 100, 100) : 0;

		// Dynamic background color based on progress (matching timeflow.js)
		let bgColor: string;
		let textColor: string;
		if (todayHours <= goal) {
			bgColor = "linear-gradient(135deg, #4caf50, #81c784)";
			textColor = "white";
		} else if (todayHours <= goal + 1.75) { // Half of 3.5 for daily
			bgColor = "linear-gradient(135deg, #ffeb3b, #ffc107)";
			textColor = "black";
		} else {
			bgColor = "linear-gradient(135deg, #f44336, #d32f2f)";
			textColor = "white";
		}

		this.elements.dayCard.style.background = bgColor;
		this.elements.dayCard.style.color = textColor;
		this.elements.dayCard.empty();

		const h3 = this.elements.dayCard.createEl('h3', { text: t('ui.today') });
		h3.style.color = textColor;

		const hoursDiv = this.elements.dayCard.createDiv({ text: Utils.formatHoursToHM(todayHours, this.settings.hourUnit) });
		hoursDiv.style.cssText = 'font-size: 32px; font-weight: bold; margin: 10px 0;';

		const goalDiv = this.elements.dayCard.createDiv({ text: `${t('ui.goal')}: ${Utils.formatHoursToHM(goal, this.settings.hourUnit)}` });
		goalDiv.style.cssText = 'font-size: 14px; opacity: 0.9; margin-bottom: 10px;';

		const progressBar = this.elements.dayCard.createDiv({ cls: 'tf-progress-bar' });
		const progressFill = progressBar.createDiv({ cls: 'tf-progress-fill' });
		progressFill.style.cssText = `width: ${progress}%; background: linear-gradient(90deg, ${this.settings.customColors?.progressBar || '#4caf50'}, ${this.darkenColor(this.settings.customColors?.progressBar || '#4caf50', 20)})`;
	}

	updateWeekCard(): void {
		if (!this.elements.weekCard) return;

		const today = new Date();
		const weekHours = this.data.getCurrentWeekHours(today);
		const currentWeekNumber = Utils.getWeekNumber(today);

		// Helper to add week badge if enabled
		const addWeekBadge = (container: HTMLElement) => {
			if (this.settings.showWeekNumbers) {
				container.createDiv({ cls: 'tf-week-badge', text: `${t('ui.week')} ${currentWeekNumber}` });
			}
		};

		// NEW: Simple tracking mode
		if (!this.settings.enableGoalTracking) {
			this.elements.weekCard.style.background = "var(--background-secondary)";
			this.elements.weekCard.style.color = "var(--text-normal)";
			this.elements.weekCard.empty();

			addWeekBadge(this.elements.weekCard);

			const h3 = this.elements.weekCard.createEl('h3', { text: t('ui.thisWeek') });
			h3.style.color = 'inherit';

			const hoursDiv = this.elements.weekCard.createDiv({ text: Utils.formatHoursToHM(weekHours, this.settings.hourUnit) });
			hoursDiv.style.cssText = 'font-size: 32px; font-weight: bold; margin: 10px 0;';

			const labelDiv = this.elements.weekCard.createDiv({ text: t('ui.hoursWorked') });
			labelDiv.style.cssText = 'font-size: 14px; opacity: 0.9; margin-top: 10px;';
			return;
		}

		// Calculate adjusted goal based on special days this week
		const dayOfWeek = today.getDay();
		const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
		const firstDayOfWeek = new Date(today);
		firstDayOfWeek.setDate(today.getDate() - daysFromMonday);

		let adjustedGoal = 0;

		for (let i = 0; i < 7; i++) {
			const d = new Date(firstDayOfWeek);
			d.setDate(firstDayOfWeek.getDate() + i);
			const dayKey = Utils.toLocalDateStr(d);
			const dayGoal = this.data.getDailyGoal(dayKey);
			adjustedGoal += dayGoal;
		}

		const progress = adjustedGoal > 0 ? Math.min((weekHours / adjustedGoal) * 100, 100) : 0;

		// Dynamic background color based on progress (matching timeflow.js)
		let bgColor: string;
		let textColor: string;

		// If weekly goals are disabled, use a neutral color
		if (!this.settings.enableWeeklyGoals) {
			bgColor = "var(--background-secondary)";
			textColor = "var(--text-normal)";
		} else if (weekHours <= adjustedGoal) {
			bgColor = "linear-gradient(135deg, #4caf50, #81c784)";
			textColor = "white";
		} else if (weekHours <= adjustedGoal + 3.5) {
			bgColor = "linear-gradient(135deg, #ffeb3b, #ffc107)";
			textColor = "black";
		} else {
			bgColor = "linear-gradient(135deg, #f44336, #d32f2f)";
			textColor = "white";
		}

		this.elements.weekCard.style.background = bgColor;
		this.elements.weekCard.style.color = textColor;
		this.elements.weekCard.empty();

		addWeekBadge(this.elements.weekCard);

		const h3 = this.elements.weekCard.createEl('h3', { text: t('ui.thisWeek') });
		h3.style.color = textColor;

		const hoursDiv = this.elements.weekCard.createDiv({ text: Utils.formatHoursToHM(weekHours, this.settings.hourUnit) });
		hoursDiv.style.cssText = 'font-size: 32px; font-weight: bold; margin: 10px 0;';

		// Conditionally show goal and progress bar based on settings
		if (this.settings.enableWeeklyGoals) {
			const goalDiv = this.elements.weekCard.createDiv({ text: `${t('ui.goal')}: ${Utils.formatHoursToHM(adjustedGoal, this.settings.hourUnit)}` });
			goalDiv.style.cssText = 'font-size: 14px; opacity: 0.9; margin-bottom: 10px;';

			const progressBar = this.elements.weekCard.createDiv({ cls: 'tf-progress-bar' });
			const progressFill = progressBar.createDiv({ cls: 'tf-progress-fill' });
			progressFill.style.cssText = `width: ${progress}%; background: linear-gradient(90deg, ${this.settings.customColors?.progressBar || '#4caf50'}, ${this.darkenColor(this.settings.customColors?.progressBar || '#4caf50', 20)})`;
		}
	}

	updateStatsCard(): void {
		if (!this.elements.statsCard) return;

		const stats = this.data.getStatistics(this.statsTimeframe, this.selectedYear, this.selectedMonth);
		const balance = this.data.getCurrentBalance();
		const { avgDaily, avgWeekly } = this.data.getAverages();
		const workloadPct = this.settings.baseWorkweek > 0
			? ((avgWeekly / this.settings.baseWorkweek) * 100).toFixed(0)
			: '0';

		// Update timeframe selector
		const selectorContainer = this.elements.statsCard.parentElement?.querySelector('.tf-timeframe-selector') as HTMLElement | null;
		if (selectorContainer) {
			selectorContainer.empty();

			if (this.statsTimeframe === "year") {
				// Year dropdown
				const availableYears = this.data.getAvailableYears();
				if (availableYears.length > 0) {
					const yearSelect = document.createElement("select");
					yearSelect.style.padding = "4px 8px";
					yearSelect.style.fontSize = "1em";
					yearSelect.style.fontWeight = "bold";
					yearSelect.style.border = "1px solid var(--background-modifier-border)";
					yearSelect.style.borderRadius = "4px";
					yearSelect.style.background = "var(--background-primary)";
					yearSelect.style.color = "var(--text-normal)";
					yearSelect.style.cursor = "pointer";

					availableYears.forEach(year => {
						const option = document.createElement("option");
						option.value = year.toString();
						option.textContent = year.toString();
						option.selected = year === this.selectedYear;
						yearSelect.appendChild(option);
					});

					yearSelect.onchange = () => {
						this.selectedYear = parseInt(yearSelect.value);
						this.updateStatsCard();
					};

					selectorContainer.appendChild(yearSelect);
				}
			} else if (this.statsTimeframe === "month") {
				// Year dropdown
				const availableYears = this.data.getAvailableYears();
				if (availableYears.length > 0) {
					const yearSelect = document.createElement("select");
					yearSelect.style.padding = "4px 8px";
					yearSelect.style.fontSize = "1em";
					yearSelect.style.fontWeight = "bold";
					yearSelect.style.border = "1px solid var(--background-modifier-border)";
					yearSelect.style.borderRadius = "4px";
					yearSelect.style.background = "var(--background-primary)";
					yearSelect.style.color = "var(--text-normal)";
					yearSelect.style.cursor = "pointer";

					availableYears.forEach(year => {
						const option = document.createElement("option");
						option.value = year.toString();
						option.textContent = year.toString();
						option.selected = year === this.selectedYear;
						yearSelect.appendChild(option);
					});

					yearSelect.onchange = () => {
						this.selectedYear = parseInt(yearSelect.value);
						// Reset to first available month for new year
						const months = this.data.getAvailableMonthsForYear(this.selectedYear);
						if (months.length > 0) {
							this.selectedMonth = months[months.length - 1]; // Most recent month
						}
						this.updateStatsCard();
					};

					selectorContainer.appendChild(yearSelect);

					// Month dropdown
					const availableMonths = this.data.getAvailableMonthsForYear(this.selectedYear);
					if (availableMonths.length > 0) {
						const monthSelect = document.createElement("select");
						monthSelect.style.padding = "4px 8px";
						monthSelect.style.fontSize = "1em";
						monthSelect.style.fontWeight = "bold";
						monthSelect.style.border = "1px solid var(--background-modifier-border)";
						monthSelect.style.borderRadius = "4px";
						monthSelect.style.background = "var(--background-primary)";
						monthSelect.style.color = "var(--text-normal)";
						monthSelect.style.cursor = "pointer";

						const monthNames = ["Januar", "Februar", "Mars", "April", "Mai", "Juni",
							"Juli", "August", "September", "Oktober", "November", "Desember"];

						availableMonths.forEach(month => {
							const option = document.createElement("option");
							option.value = month.toString();
							option.textContent = monthNames[month];
							option.selected = month === this.selectedMonth;
							monthSelect.appendChild(option);
						});

						monthSelect.onchange = () => {
							this.selectedMonth = parseInt(monthSelect.value);
							this.updateStatsCard();
						};

						selectorContainer.appendChild(monthSelect);
					}
				}
			} else {
				// Total - just show label
				const label = document.createElement("div");
				label.style.fontSize = "1.1em";
				label.style.fontWeight = "bold";
				label.textContent = t('ui.total');
				selectorContainer.appendChild(label);
			}
		}

		// Week comparison context (used later)
		const context = this.data.getContextualData(this.today);

		// Fleksitidsaldo color
		const sign = balance >= 0 ? '+' : '';
		const timesaldoColor = this.getBalanceColor(balance);

		// Ferie display
		let ferieDisplay = `${stats.ferie.count} ${t('ui.days')}`;
		if (this.statsTimeframe === "year" && stats.ferie.max > 0) {
			const feriePercent = ((stats.ferie.count / stats.ferie.max) * 100).toFixed(0);
			ferieDisplay = `${stats.ferie.count}/${stats.ferie.max} ${t('ui.days')} (${feriePercent}%)`;
		}

		// Egenmelding display with dynamic period label
		const egenmeldingStats = this.data.getSpecialDayStats('egenmelding', this.selectedYear);
		let egenmeldingDisplay = `${egenmeldingStats.count} ${t('ui.days')}`;
		let egenmeldingPeriodLabel = '';
		if (this.statsTimeframe === "year") {
			if (egenmeldingStats.max && egenmeldingStats.max > 0) {
				const egenmeldingPercent = ((egenmeldingStats.count / egenmeldingStats.max) * 100).toFixed(0);
				egenmeldingDisplay = `${egenmeldingStats.count}/${egenmeldingStats.max} ${t('ui.days')} (${egenmeldingPercent}%)`;
			}
			egenmeldingPeriodLabel = `(${egenmeldingStats.periodLabel})`;
		}

		this.elements.statsCard.empty();

		// Helper to create stat items
		const createStatItem = (label: string, value: string, subtitle?: string, extraCls?: string, extraStyle?: string) => {
			const item = this.elements.statsCard!.createDiv({ cls: `tf-stat-item${extraCls ? ' ' + extraCls : ''}` });
			if (extraStyle) item.style.cssText = extraStyle;
			item.createDiv({ cls: 'tf-stat-label', text: label });
			const valueDiv = item.createDiv({ cls: 'tf-stat-value', text: value });
			if (subtitle !== undefined) {
				const subDiv = item.createDiv({ text: subtitle });
				subDiv.style.cssText = 'font-size: 0.75em; margin-top: 4px;';
			}
			return { item, valueDiv };
		};

		// Flextime balance (conditional)
		if (this.settings.enableGoalTracking) {
			createStatItem(t('stats.flextimeBalance'), `${sign}${balance.toFixed(1)}t`, t('stats.totalBalance'), 'tf-stat-colored', `background: ${timesaldoColor};`);
		}

		// Hours
		createStatItem(`⏱️ ${t('stats.hours')}`, `${stats.totalHours.toFixed(1)}t`);

		// Avg per day
		createStatItem(`📊 ${t('stats.avgPerDay')}`, `${avgDaily.toFixed(1)}t`);

		// Avg per week with comparison
		const weekItem = this.elements.statsCard.createDiv({ cls: 'tf-stat-item' });
		weekItem.createDiv({ cls: 'tf-stat-label', text: `📅 ${t('stats.avgPerWeek')}` });
		weekItem.createDiv({ cls: 'tf-stat-value', text: `${avgWeekly.toFixed(1)}t` });
		if (context.lastWeekHours > 0) {
			const currWeekHours = this.data.getCurrentWeekHours(this.today);
			const diff = currWeekHours - context.lastWeekHours;
			if (Math.abs(diff) > 2) {
				const arrow = diff > 0 ? "📈" : "📉";
				const signDiff = diff > 0 ? "+" : "";
				const compDiv = weekItem.createDiv({ text: `${t('ui.vsLastWeek')}: ${signDiff}${diff.toFixed(1)}t ${arrow}` });
				compDiv.style.cssText = 'font-size: 0.75em; margin-top: 4px;';
			}
		}

		// Work intensity (conditional)
		if (this.settings.enableGoalTracking && this.settings.enableWeeklyGoals) {
			createStatItem(`💪 ${t('stats.workIntensity')}`, `${workloadPct}%`, t('stats.ofNormalWeek'));
		}

		// Work
		createStatItem(`💼 ${t('stats.work')}`, `${stats.jobb.count} ${t('ui.days')}`, `${stats.jobb.hours.toFixed(1)}t`);

		// Weekend days (conditional)
		if (stats.weekendDays > 0) {
			createStatItem(`🌙 ${t('stats.weekendDaysWorked')}`, `${stats.weekendDays} ${t('ui.days')}`, `${stats.weekendHours.toFixed(1)}${this.settings.hourUnit}`);
		}

		// Flex time off
		createStatItem(`🛌 ${t('stats.flexTimeOff')}`, `${stats.avspasering.count} ${t('ui.days')}`, `${stats.avspasering.hours.toFixed(1)}${this.settings.hourUnit}`);

		// Vacation
		const vacationItem = this.elements.statsCard.createDiv({ cls: 'tf-stat-item' });
		vacationItem.createDiv({ cls: 'tf-stat-label', text: `🏖️ ${t('stats.vacation')}` });
		const vacationValue = vacationItem.createDiv({ cls: 'tf-stat-value', text: ferieDisplay });
		vacationValue.style.fontSize = this.statsTimeframe === 'year' ? '0.9em' : '1.3em';
		const vacationSub = vacationItem.createDiv();
		vacationSub.style.cssText = 'font-size: 0.75em; margin-top: 4px;';

		// Welfare leave
		createStatItem(`🏥 ${t('stats.welfareLeave')}`, `${stats.velferdspermisjon.count} ${t('ui.days')}`);

		// Self-reported sick
		const sickItem = this.elements.statsCard.createDiv({ cls: 'tf-stat-item' });
		sickItem.createDiv({ cls: 'tf-stat-label', text: `🤒 ${t('stats.selfReportedSick')}` });
		const sickValue = sickItem.createDiv({ cls: 'tf-stat-value', text: egenmeldingDisplay });
		sickValue.style.fontSize = this.statsTimeframe === 'year' ? '0.9em' : '1.3em';
		const sickSub = sickItem.createDiv({ text: egenmeldingPeriodLabel });
		sickSub.style.cssText = 'font-size: 0.75em; margin-top: 4px;';

		// Doctor sick
		createStatItem(`🏥 ${t('stats.doctorSick')}`, `${stats.sykemelding.count} ${t('ui.days')}`);

		// Study
		createStatItem(`📚 ${t('stats.study')}`, `${stats.studie.count} ${t('ui.days')}`, `${stats.studie.hours.toFixed(1)}${this.settings.hourUnit}`);

		// Course
		createStatItem(`📚 ${t('stats.course')}`, `${stats.kurs.count} ${t('ui.days')}`, `${stats.kurs.hours.toFixed(1)}${this.settings.hourUnit}`);

		// Update tab active state
		const tabs = this.elements.statsCard.parentElement?.querySelectorAll('.tf-tab');
		tabs?.forEach(tab => {
			const timeframe = tab.textContent?.toLowerCase();
			if (
				(timeframe === 'totalt' && this.statsTimeframe === 'total') ||
				(timeframe === 'år' && this.statsTimeframe === 'year') ||
				(timeframe === 'måned' && this.statsTimeframe === 'month')
			) {
				tab.classList.add('active');
			} else {
				tab.classList.remove('active');
			}
		});
	}

	updateMonthCard(): void {
		if (!this.elements.monthCard) return;

		const displayDate = new Date(this.today);
		displayDate.setMonth(this.today.getMonth() + this.currentMonthOffset);

		const grid = this.createMonthGrid(displayDate);
		this.elements.monthCard.empty();
		this.elements.monthCard.appendChild(grid);

		// Update future planned days list (in the parent card)
		const card = this.elements.monthCard.parentElement;
		if (card) {
			const futureList = card.querySelector('.tf-future-days-list');
			if (futureList) {
				this.updateFutureDaysList(futureList as HTMLElement);
			}
		}
	}

	updateFutureDaysList(container: HTMLElement): void {
		const today = new Date();
		const futureDays: Array<{date: string, type: string, label: string, color: string, textColor: string}> = [];

		// Get all future planned days from holidays
		Object.keys(this.data.holidays).forEach(dateStr => {
			const date = new Date(dateStr + 'T00:00:00');
			if (date >= today) {
				const holiday = this.data.holidays[dateStr];
				const behavior = this.settings.specialDayBehaviors.find(b => b.id === holiday.type);
				if (behavior) {
					const translatedLabel = translateSpecialDayName(behavior.id, behavior.label);
					futureDays.push({
						date: dateStr,
						type: translatedLabel,
						label: holiday.description || translatedLabel,
						color: behavior.color,
						textColor: behavior.textColor || '#000000'
					});
				}
			}
		});

		// Sort by date
		futureDays.sort((a, b) => a.date.localeCompare(b.date));

		// Limit based on goal tracking mode: 7 in simple mode, 10 in goal mode
		const limit = this.settings.enableGoalTracking ? 10 : 7;
		const limitedDays = futureDays.slice(0, limit);

		if (limitedDays.length === 0) {
			container.empty();
			return;
		}

		// Build list using DOM API
		container.empty();
		container.createEl('h4', { text: t('ui.upcomingPlannedDays') });
		limitedDays.forEach(day => {
			const date = new Date(day.date + 'T00:00:00');
			const dateStr = formatDate(date, 'long');
			const itemDiv = container.createDiv({ cls: 'tf-future-day-item' });
			itemDiv.createSpan({ cls: 'tf-future-day-date', text: dateStr });
			const typeSpan = itemDiv.createSpan({ cls: 'tf-future-day-type', text: day.label });
			typeSpan.style.backgroundColor = day.color;
			typeSpan.style.color = day.textColor;
		});
	}

	createMonthGrid(displayDate: Date): HTMLElement {
		const year = displayDate.getFullYear();
		const month = displayDate.getMonth();
		const monthName = getMonthName(displayDate);
		const showWeekNumbers = this.settings.showWeekNumbers ?? true;

		const container = document.createElement("div");

		const monthTitle = document.createElement("div");
		monthTitle.textContent = monthName;
		monthTitle.style.textAlign = "left";
		monthTitle.style.fontWeight = "bold";
		monthTitle.style.marginBottom = "10px";
		container.appendChild(monthTitle);

		const grid = document.createElement("div");
		grid.className = showWeekNumbers ? "tf-month-grid with-week-numbers" : "tf-month-grid";

		// Add week number header if enabled
		if (showWeekNumbers) {
			const weekHeader = document.createElement("div");
			weekHeader.className = "tf-week-number-header";
			weekHeader.textContent = t('ui.week');
			grid.appendChild(weekHeader);
		}

		// Add day headers
		const dayNames = getDayNamesShort();
		dayNames.forEach(name => {
			const header = document.createElement("div");
			header.textContent = name;
			header.style.textAlign = "center";
			header.style.fontWeight = "bold";
			header.style.fontSize = "12px";
			header.style.color = "var(--text-muted)";
			grid.appendChild(header);
		});

		// Get first day of month (0 = Sunday, adjust to Monday = 0)
		const firstDay = new Date(year, month, 1);
		let firstDayOfWeek = firstDay.getDay() - 1;
		if (firstDayOfWeek === -1) firstDayOfWeek = 6;

		// Add week number for first row (if week numbers enabled)
		if (showWeekNumbers) {
			const weekNumCell = document.createElement("div");
			// Get Monday of the week containing firstDay
			const dayOfWeek = firstDay.getDay();
			const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
			const mondayOfWeek = new Date(firstDay);
			mondayOfWeek.setDate(firstDay.getDate() - daysFromMonday);

			const complianceClass = this.getWeekComplianceClass(mondayOfWeek);
			weekNumCell.className = `tf-week-number-cell ${complianceClass}`;
			weekNumCell.textContent = Utils.getWeekNumber(firstDay).toString();

			// Add click handler if compliance is enabled and class is set
			if (complianceClass && complianceClass !== 'week-future') {
				weekNumCell.style.cursor = 'pointer';
				const monday = new Date(mondayOfWeek); // Capture for closure
				weekNumCell.onclick = (e) => {
					e.stopPropagation();
					this.showWeekCompliancePanel(weekNumCell.getBoundingClientRect(), monday);
				};
			}

			grid.appendChild(weekNumCell);
		}

		// Add empty cells for days before month starts
		for (let i = 0; i < firstDayOfWeek; i++) {
			const emptyCell = document.createElement("div");
			grid.appendChild(emptyCell);
		}

		// Add day cells
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const todayKey = Utils.toLocalDateStr(new Date());

		// Track position in grid for week number insertion
		let gridPosition = firstDayOfWeek; // Start after empty cells

		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(year, month, day);
			const dateKey = Utils.toLocalDateStr(date);

			// Add week number cell at the start of each new week (Monday = day 0 in our grid)
			// But skip the first row since we already added it
			if (showWeekNumbers && day > 1 && date.getDay() === 1) {
				const weekNumCell = document.createElement("div");
				// date is already Monday
				const complianceClass = this.getWeekComplianceClass(date);
				weekNumCell.className = `tf-week-number-cell ${complianceClass}`;
				weekNumCell.textContent = Utils.getWeekNumber(date).toString();

				// Add click handler if compliance is enabled and class is set
				if (complianceClass && complianceClass !== 'week-future') {
					weekNumCell.style.cursor = 'pointer';
					const monday = new Date(date); // Capture for closure
					weekNumCell.onclick = (e) => {
						e.stopPropagation();
						this.showWeekCompliancePanel(weekNumCell.getBoundingClientRect(), monday);
					};
				}

				grid.appendChild(weekNumCell);
			}

			const cell = document.createElement("div");
			cell.className = "tf-day-cell";
			cell.textContent = day.toString();

			// Determine background color
			const holidayInfo = this.data.getHolidayInfo(dateKey);
			const dayEntries = this.data.daily[dateKey];
			const specialDayColors = getSpecialDayColors(this.settings);
			const specialDayTextColors = getSpecialDayTextColors(this.settings);

			// Check for special day entries in daily data
			const specialEntry = dayEntries?.find(e =>
				specialDayColors[e.name.toLowerCase()]
			);

			// Track if this day has any entries
			const hasEntry = !!(holidayInfo || specialEntry || dayEntries);

			if (holidayInfo) {
				// Holiday from holidays file
				const colorKey = holidayInfo.halfDay ? 'halfday' : holidayInfo.type;
				cell.style.background = specialDayColors[colorKey] || specialDayColors[holidayInfo.type] || "var(--background-secondary)";
				cell.style.color = specialDayTextColors[colorKey] || specialDayTextColors[holidayInfo.type] || "var(--text-normal)";
			} else if (specialEntry) {
				// Special day from entries (ferie, studie, etc.)
				const entryKey = specialEntry.name.toLowerCase();
				cell.style.background = specialDayColors[entryKey];
				cell.style.color = specialDayTextColors[entryKey] || "var(--text-normal)";
			} else if (dayEntries) {
				// Regular work day - show flextime color or neutral color in simple mode
				if (!this.settings.enableGoalTracking) {
					// Simple tracking mode - use neutral color
					cell.style.background = 'var(--background-secondary)';
				} else {
					// Goal-based mode - show flextime color gradient
					const dayFlextime = dayEntries.reduce((sum, e) => sum + (e.flextime || 0), 0);
					cell.style.background = this.flextimeColor(dayFlextime);
					cell.style.color = this.flextimeTextColor(dayFlextime);
				}
			} else if (Utils.isWeekend(date, this.settings)) {
				// Gray for weekends with no data
				cell.style.background = "var(--background-modifier-border)";
			} else {
				// Check if date is in the past
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const cellDate = new Date(date);
				cellDate.setHours(0, 0, 0, 0);

				if (cellDate < today) {
					// Secondary background for past empty weekdays
					cell.style.background = "var(--background-secondary)";
				} else {
					// Transparent for future empty weekdays
					cell.style.background = "transparent";
				}
			}

			// Add appropriate text color class
			if (hasEntry) {
				cell.classList.add("has-entry");
			} else {
				cell.classList.add("no-entry");
				// Use normal text color for empty cells
				cell.style.color = "var(--text-muted)";
			}

			// Highlight today
			if (dateKey === todayKey) {
				cell.classList.add("today");
			}

			// Check for active entries (timers without end time)
			const hasActiveEntry = dayEntries?.some(e => !e.endTime);
			if (hasActiveEntry) {
				// Add pulsing indicator for active entry
				const indicator = document.createElement("div");
				indicator.style.position = "absolute";
				indicator.style.top = "4px";
				indicator.style.right = "4px";
				indicator.style.width = "8px";
				indicator.style.height = "8px";
				indicator.style.borderRadius = "50%";
				indicator.style.background = "#4caf50";
				indicator.style.animation = "pulse 2s infinite";
				indicator.style.boxShadow = "0 0 4px rgba(76, 175, 80, 0.8)";
				cell.appendChild(indicator);
			}

			// Add click handler
			cell.onclick = (e) => {
				e.stopPropagation();
				const cellRect = cell.getBoundingClientRect();
				this.showNoteTypeMenu(cellRect, date);
			};

			grid.appendChild(cell);
		}

		container.appendChild(grid);
		return container;
	}

	flextimeColor(val: number): string {
		// Find jobb behavior to get configured colors
		const jobbBehavior = this.settings.specialDayBehaviors?.find(b => b.id === 'jobb');

		// Helper to parse hex color to RGB
		const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
			const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
			return result ? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
			} : { r: 128, g: 128, b: 128 }; // Fallback gray
		};

		if (val < 0) {
			// Negative hours: use negativeColor from jobb settings (default blue)
			const baseColor = jobbBehavior?.negativeColor || '#64b5f6';
			const rgb = hexToRgb(baseColor);

			// Create gradient intensity based on how negative
			const t = Math.min(Math.abs(val) / 3, 1);
			// Start lighter, darken toward base color as deficit increases
			const r = Math.floor(rgb.r + (255 - rgb.r) * (1 - t) * 0.4);
			const g = Math.floor(rgb.g + (255 - rgb.g) * (1 - t) * 0.4);
			const b = Math.floor(rgb.b + (255 - rgb.b) * (1 - t) * 0.4);
			return `rgb(${r},${g},${b})`;
		} else {
			// Positive hours: use color from jobb settings (default green)
			const baseColor = jobbBehavior?.color || '#4caf50';
			const rgb = hexToRgb(baseColor);

			// Create gradient intensity based on how positive
			const t = Math.min(val / 3, 1);
			// Start lighter, darken toward base color as surplus increases
			const r = Math.floor(rgb.r + (255 - rgb.r) * (1 - t) * 0.4);
			const g = Math.floor(rgb.g + (255 - rgb.g) * (1 - t) * 0.4);
			const b = Math.floor(rgb.b + (255 - rgb.b) * (1 - t) * 0.4);
			return `rgb(${r},${g},${b})`;
		}
	}

	flextimeTextColor(val: number): string {
		// Find jobb behavior to get configured text colors
		const jobbBehavior = this.settings.specialDayBehaviors?.find(b => b.id === 'jobb');

		if (val < 0) {
			return jobbBehavior?.negativeTextColor || '#000000';
		} else {
			return jobbBehavior?.textColor || '#ffffff';
		}
	}

	/**
	 * Generate description for a special day behavior based on its flextimeEffect setting
	 */
	getFlextimeEffectDescription(behavior: SpecialDayBehavior): string {
		// Special cases
		if (behavior.id === 'helligdag') {
			return t('info.publicHolidayDesc');
		}
		if (behavior.id === 'halfday') {
			const halfDayHours = this.settings.halfDayMode === 'percentage'
				? this.settings.baseWorkday / 2
				: this.settings.halfDayHours;
			const halfDayReduction = this.settings.baseWorkday - halfDayHours;
			return t('info.halfDayDesc').replace('{hours}', halfDayHours.toString()).replace('{reduction}', halfDayReduction.toString());
		}

		// Based on flextimeEffect setting
		switch (behavior.flextimeEffect) {
			case 'withdraw':
				return t('info.withdrawFromFlextime');
			case 'accumulate':
				return t('info.countsAsFlextime').replace('{hours}', this.settings.baseWorkday.toString());
			case 'none':
			default:
				return t('info.noFlextimeEffect');
		}
	}

	/**
	 * Check if week compliance indicators should be shown
	 */
	shouldShowWeekCompliance(): boolean {
		return this.settings.enableGoalTracking &&
			(this.settings.complianceSettings?.enableWarnings ?? true);
	}

	/**
	 * Get the compliance status for a given week
	 * Returns: 'ok' (met goal), 'over' (exceeded), 'under' (below goal), 'partial' (incomplete week), 'future', or '' if disabled
	 */
	getWeekComplianceClass(mondayOfWeek: Date): string {
		// Check if compliance indicators should be shown
		if (!this.shouldShowWeekCompliance()) {
			return '';
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Check if week is before balance start date
		const balanceStartDate = new Date(this.settings.balanceStartDate + 'T00:00:00');
		const sundayOfWeek = new Date(mondayOfWeek);
		sundayOfWeek.setDate(mondayOfWeek.getDate() + 6);

		if (sundayOfWeek < balanceStartDate) {
			return ''; // Don't show indicator for weeks before balance tracking started
		}

		// Check if week is in the future
		if (mondayOfWeek > today) {
			return 'week-future';
		}

		// Calculate hours worked in this week
		let totalHours = 0;
		let workDaysInWeek = 0;
		let workDaysPassed = 0;

		for (let i = 0; i < 7; i++) {
			const day = new Date(mondayOfWeek);
			day.setDate(mondayOfWeek.getDate() + i);
			const dayKey = Utils.toLocalDateStr(day);

			// Skip days before balance start date
			if (day < balanceStartDate) {
				continue;
			}

			// Check if this is a work day
			const isWorkDay = this.settings.workDays.includes(day.getDay());
			if (isWorkDay) {
				workDaysInWeek++;
				if (day <= today) {
					workDaysPassed++;
				}
			}

			// Sum hours from entries
			const dayEntries = this.data.daily[dayKey] || [];
			dayEntries.forEach(entry => {
				const name = entry.name.toLowerCase();
				// Count work hours (exclude special leave types that don't count as work)
				if (name !== 'avspasering' && name !== 'ferie') {
					totalHours += entry.duration || 0;
				}
			});
		}

		// If no work days have passed yet, it's a partial/future week
		if (workDaysPassed === 0) {
			return 'week-future';
		}

		// Calculate expected hours for days that have passed
		const expectedHoursPerDay = this.settings.baseWorkday;
		const expectedHours = workDaysPassed * expectedHoursPerDay * this.settings.workPercent;

		// Tolerance: within 0.5 hours of goal is considered "ok"
		const tolerance = 0.5;

		if (totalHours >= expectedHours - tolerance && totalHours <= expectedHours + tolerance) {
			return 'week-ok';
		} else if (totalHours > expectedHours + tolerance) {
			return 'week-over';
		} else if (workDaysPassed < workDaysInWeek && sundayOfWeek >= today) {
			// Week is still in progress
			return 'week-partial';
		} else {
			return 'week-under';
		}
	}

	/**
	 * Get detailed week compliance data for popup
	 */
	getWeekComplianceData(mondayOfWeek: Date): {
		weekNumber: number;
		totalHours: number;
		expectedHours: number;
		workDaysPassed: number;
		workDaysInWeek: number;
		dailyLimit: number;
		weeklyLimit: number;
		status: string;
		isComplete: boolean;
	} {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const balanceStartDate = new Date(this.settings.balanceStartDate + 'T00:00:00');
		const sundayOfWeek = new Date(mondayOfWeek);
		sundayOfWeek.setDate(mondayOfWeek.getDate() + 6);

		let totalHours = 0;
		let workDaysInWeek = 0;
		let workDaysPassed = 0;

		for (let i = 0; i < 7; i++) {
			const day = new Date(mondayOfWeek);
			day.setDate(mondayOfWeek.getDate() + i);
			const dayKey = Utils.toLocalDateStr(day);

			if (day < balanceStartDate) continue;

			const isWorkDay = this.settings.workDays.includes(day.getDay());
			if (isWorkDay) {
				workDaysInWeek++;
				if (day <= today) {
					workDaysPassed++;
				}
			}

			const dayEntries = this.data.daily[dayKey] || [];
			dayEntries.forEach(entry => {
				const name = entry.name.toLowerCase();
				if (name !== 'avspasering' && name !== 'ferie') {
					totalHours += entry.duration || 0;
				}
			});
		}

		const expectedHoursPerDay = this.settings.baseWorkday;
		const expectedHours = workDaysPassed * expectedHoursPerDay * this.settings.workPercent;
		const isComplete = workDaysPassed >= workDaysInWeek || sundayOfWeek < today;

		let status = 'ok';
		const tolerance = 0.5;
		if (totalHours < expectedHours - tolerance) {
			status = isComplete ? 'under' : 'partial';
		} else if (totalHours > expectedHours + tolerance) {
			status = 'over';
		}

		return {
			weekNumber: Utils.getWeekNumber(mondayOfWeek),
			totalHours,
			expectedHours,
			workDaysPassed,
			workDaysInWeek,
			dailyLimit: this.settings.complianceSettings?.dailyHoursLimit ?? 9,
			weeklyLimit: this.settings.complianceSettings?.weeklyHoursLimit ?? 40,
			status,
			isComplete
		};
	}

	/**
	 * Show week compliance info panel when clicking on a week number
	 */
	showWeekCompliancePanel(cellRect: DOMRect, mondayOfWeek: Date): void {
		// Remove existing panel
		const existingPanel = document.querySelector('.tf-week-compliance-panel');
		if (existingPanel) existingPanel.remove();

		const data = this.getWeekComplianceData(mondayOfWeek);

		const panel = document.createElement('div');
		panel.className = 'tf-week-compliance-panel';
		panel.style.cssText = `
			position: fixed;
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 8px;
			padding: 16px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.15);
			z-index: 1000;
			min-width: 220px;
			max-width: 300px;
		`;

		// Status icon and color
		let statusIcon = '🟩';
		let statusText = t('status.onTarget');
		let statusColor = '#4caf50';
		if (data.status === 'over') {
			statusIcon = '🟨';
			statusText = t('status.overTarget');
			statusColor = '#ff9800';
		} else if (data.status === 'under') {
			statusIcon = '🟥';
			statusText = t('status.underTarget');
			statusColor = '#f44336';
		} else if (data.status === 'partial') {
			statusIcon = '⏳';
			statusText = t('status.inProgress');
			statusColor = '#9e9e9e';
		}

		const diff = data.totalHours - data.expectedHours;
		const diffText = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);

		// Build panel content using DOM API
		const headerRow = panel.createDiv();
		headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';
		const weekTitle = headerRow.createEl('strong', { text: `${t('ui.week')} ${data.weekNumber}` });
		weekTitle.style.fontSize = '1.1em';
		const statusSpan = headerRow.createSpan({ text: `${statusIcon} ${statusText}` });
		statusSpan.style.cssText = `color: ${statusColor}; font-weight: bold;`;

		const contentDiv = panel.createDiv();
		contentDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px; font-size: 0.9em;';

		// Hours logged row
		const hoursRow = contentDiv.createDiv();
		hoursRow.style.cssText = 'display: flex; justify-content: space-between;';
		hoursRow.createSpan({ text: `${t('ui.hoursLogged')}:` });
		hoursRow.createEl('strong', { text: `${data.totalHours.toFixed(1)}t` });

		// Expected row
		const expectedRow = contentDiv.createDiv();
		expectedRow.style.cssText = 'display: flex; justify-content: space-between;';
		expectedRow.createSpan({ text: `${t('ui.expected')}:` });
		expectedRow.createSpan({ text: `${data.expectedHours.toFixed(1)}t (${data.workDaysPassed}/${data.workDaysInWeek} ${t('ui.days')})` });

		// Difference row
		const diffRow = contentDiv.createDiv();
		diffRow.style.cssText = 'display: flex; justify-content: space-between; border-top: 1px solid var(--background-modifier-border); padding-top: 8px;';
		diffRow.createSpan({ text: `${t('ui.difference')}:` });
		const diffValue = diffRow.createEl('strong', { text: `${diffText}t` });
		diffValue.style.color = statusColor;

		// Warning if over limit
		if (data.totalHours > data.weeklyLimit) {
			const warningDiv = contentDiv.createDiv({ text: `⚠️ ${t('ui.overWeekLimit')} (${data.weeklyLimit}t)` });
			warningDiv.style.cssText = 'color: #f44336; margin-top: 4px;';
		}

		// Position panel near the clicked cell
		panel.style.left = `${cellRect.right + 8}px`;
		panel.style.top = `${cellRect.top}px`;

		document.body.appendChild(panel);

		// Adjust if off-screen
		const panelRect = panel.getBoundingClientRect();
		if (panelRect.right > window.innerWidth - 10) {
			panel.style.left = `${cellRect.left - panelRect.width - 8}px`;
		}
		if (panelRect.bottom > window.innerHeight - 10) {
			panel.style.top = `${window.innerHeight - panelRect.height - 10}px`;
		}

		// Close when clicking outside
		const closeHandler = (e: MouseEvent) => {
			if (!panel.contains(e.target as Node)) {
				panel.remove();
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 0);
	}

	showNoteTypeMenu(cellRect: DOMRect, dateObj: Date): void {
		// Remove existing menu
		const existingMenu = document.querySelector('.tf-context-menu');
		if (existingMenu) existingMenu.remove();

		const menu = document.createElement('div');
		menu.className = 'tf-context-menu';

		// Create main menu container
		const menuMain = document.createElement('div');
		menuMain.className = 'tf-context-menu-main';

		// Position menu, but check if it goes off-screen
		// Note: Using fixed positioning, so coordinates are relative to viewport
		let menuLeft = cellRect.right;
		let menuTop = cellRect.top;

		// Append to body first to measure dimensions
		document.body.appendChild(menu);

		// Check screen width for mobile
		const isMobile = window.innerWidth <= 500;

		if (isMobile) {
			// On mobile, center horizontally with margins
			menuLeft = 10;
			menu.style.left = `${menuLeft}px`;
			menu.style.right = '10px';
			menu.style.width = 'calc(100vw - 20px)';
		} else {
			// Desktop positioning logic
			const menuWidth = 450; // Account for both menu and info panel

			// Check if menu goes off the right edge
			if (menuLeft + menuWidth > window.innerWidth) {
				// Try positioning to the left of the cell
				menuLeft = cellRect.left - menuWidth;

				// If still off-screen on the left, clamp to viewport
				if (menuLeft < 10) {
					menuLeft = 10;
				}
			}

			menu.style.left = `${menuLeft}px`;
		}

		// Check if menu goes off the bottom edge of the window
		// Estimate menu height (will be adjusted after content is added)
		setTimeout(() => {
			const menuHeight = menu.offsetHeight;
			if (menuTop + menuHeight > window.innerHeight) {
				// Position so bottom of menu is 10px from bottom of viewport
				menuTop = Math.max(10, window.innerHeight - menuHeight - 10);
			}

			// Also check if menu goes off the top
			if (menuTop < 10) {
				menuTop = 10;
			}

			menu.style.top = `${menuTop}px`;
		}, 0);

		menu.style.top = `${menuTop}px`;

		// Check if there are existing entries for this date
		const dateStr = Utils.toLocalDateStr(dateObj);
		const dateEntries = this.data.daily[dateStr];

		// Check both processed daily data and raw timer entries (for running timers)
		const hasWorkEntriesInDaily = dateEntries && dateEntries.some(e => e.name.toLowerCase() === 'jobb');
		const hasRunningTimerForDate = this.timerManager.data.entries.some(entry => {
			if (!entry.startTime || entry.name.toLowerCase() !== 'jobb') return false;
			const entryDate = new Date(entry.startTime);
			return Utils.toLocalDateStr(entryDate) === dateStr;
		});
		const hasWorkEntries = hasWorkEntriesInDaily || hasRunningTimerForDate;

		// Add work time session option at the top
		const workTimeItem = document.createElement('div');
		workTimeItem.className = 'tf-menu-item';
		workTimeItem.createSpan({ text: '⏱️' });
		workTimeItem.createSpan({ text: t('menu.logWork') });
		workTimeItem.onclick = () => {
			menu.remove();
			this.showWorkTimeModal(dateObj);
		};
		menuMain.appendChild(workTimeItem);

		// Add edit option if there are work entries for this day
		if (hasWorkEntries) {
			const editItem = document.createElement('div');
			editItem.className = 'tf-menu-item';
			editItem.createSpan({ text: '✏️' });
			editItem.createSpan({ text: t('menu.editWork') });
			editItem.onclick = () => {
				menu.remove();
				this.showEditEntriesModal(dateObj);
			};
			menuMain.appendChild(editItem);
		}

		// Add special day registration right after edit (opens modal with type selection)
		const specialDayItem = document.createElement('div');
		specialDayItem.className = 'tf-menu-item';
		specialDayItem.createSpan({ text: '📅' });
		specialDayItem.createSpan({ text: t('menu.registerSpecialDay') });
		specialDayItem.onclick = () => {
			menu.remove();
			this.showSpecialDayModal(dateObj);
		};
		menuMain.appendChild(specialDayItem);

		// Add separator
		const separator1 = document.createElement('div');
		separator1.className = 'tf-menu-separator';
		menuMain.appendChild(separator1);

		// Create note options
		this.settings.noteTypes.forEach(noteType => {
			const item = document.createElement('div');
			item.className = 'tf-menu-item';
			item.createSpan({ text: noteType.icon });
			item.createSpan({ text: translateNoteTypeName(noteType.id, noteType.label) });
			item.onclick = async () => {
				await this.createNoteFromType(dateObj, noteType);
				menu.remove();
			};
			menuMain.appendChild(item);
		});

		// Append main menu to menu container
		menu.appendChild(menuMain);

		// Create info section
		const menuInfo = document.createElement('div');
		menuInfo.className = 'tf-context-menu-info';

		// Get information about this day
		const allEntries = dateEntries || [];
		const plannedInfo = this.data.getHolidayInfo(dateStr);
		const isPlannedDay = plannedInfo !== null;
		const isPastDay = dateObj < new Date();
		const isFutureDay = dateObj > new Date();

		// Get running timers for this date
		const runningTimersForDate = this.timerManager.data.entries.filter(entry => {
			if (!entry.startTime || !entry.endTime === false || entry.name.toLowerCase() !== 'jobb') return false;
			const entryDate = new Date(entry.startTime);
			return Utils.toLocalDateStr(entryDate) === dateStr && !entry.endTime;
		});

		// Build info content using DOM API
		menuInfo.createEl('h4', { text: '📅 ' + dateStr });

		// Show planned day information if exists
		if (isPlannedDay && plannedInfo) {
			const emoji = Utils.getEmoji({ name: plannedInfo.type, date: dateObj });
			const halfDayText = plannedInfo.halfDay ? ' (halv dag)' : '';
			const plannedP = menuInfo.createEl('p');
			plannedP.createEl('strong', { text: emoji + ' ' + plannedInfo.description + halfDayText });
		}

		// Show running timers first
		if (runningTimersForDate.length > 0) {
			const timersP = menuInfo.createEl('p');
			timersP.createEl('strong', { text: t('timer.runningTimers') + ':' });
			runningTimersForDate.forEach(timer => {
				const startTime = new Date(timer.startTime!);
				const startTimeStr = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
				const now = new Date();
				const elapsed = ((now.getTime() - startTime.getTime()) / (1000 * 60 * 60)).toFixed(1);
				const timerP = menuInfo.createEl('p', { text: '⏱️ ' + timer.name + ': ' + startTimeStr + ' - Pågår (' + elapsed + 't)' });
				timerP.style.marginLeft = '8px';
			});
		}

		// Show completed entries for this day (filter out running timers - those without duration)
		const completedEntries = allEntries.filter(e => e.duration && e.duration > 0);
		if (completedEntries.length > 0) {
			const historyP = menuInfo.createEl('p');
			historyP.createEl('strong', { text: t('ui.history') + ':' });
			completedEntries.forEach(e => {
				const emoji = Utils.getEmoji(e);
				const duration = `${e.duration!.toFixed(1)}${this.settings.hourUnit}`;
				const entryP = menuInfo.createEl('p', { text: emoji + ' ' + translateSpecialDayName(e.name.toLowerCase(), e.name) + ': ' + duration });
				entryP.style.marginLeft = '8px';
			});

			// Add balance information for past days
			if (!isFutureDay) {
				const totalHours = allEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
				const dayGoal = this.data.getDailyGoal(dateStr);
				const dailyDelta = dayGoal === 0 ? totalHours : (totalHours - dayGoal);
				const runningBalance = this.data.getBalanceUpToDate(dateStr);

				const goalP = menuInfo.createEl('p');
				goalP.style.marginTop = '8px';
				goalP.createEl('strong', { text: t('ui.goal') + ':' });
				goalP.appendText(' ' + dayGoal.toFixed(1) + 't');

				const dailyP = menuInfo.createEl('p');
				dailyP.createEl('strong', { text: t('ui.dailyBalance') + ':' });
				dailyP.appendText(' ' + (dailyDelta >= 0 ? '+' : '') + dailyDelta.toFixed(1) + 't');

				const balanceP = menuInfo.createEl('p');
				balanceP.createEl('strong', { text: t('ui.runningBalance') + ':' });
				balanceP.appendText(' ' + (runningBalance >= 0 ? '+' : '') + Utils.formatHoursToHM(runningBalance, this.settings.hourUnit));
			}
		} else if (isPastDay && !isPlannedDay && runningTimersForDate.length === 0) {
			const noRegP = menuInfo.createEl('p', { text: t('ui.noRegistration') });
			noRegP.style.color = 'var(--text-muted)';
		}

		// Check for rest period violation
		if (this.settings.complianceSettings?.enableWarnings && !isFutureDay && completedEntries.length > 0) {
			const restCheck = this.data.checkRestPeriodViolation(dateStr);
			if (restCheck.violated && restCheck.restHours !== null) {
				const minimumRest = this.settings.complianceSettings?.minimumRestHours ?? 11;
				const warningDiv = menuInfo.createDiv({ cls: 'tf-rest-period-warning' });
				warningDiv.createSpan({ cls: 'warning-icon', text: '⚠️' });
				warningDiv.createSpan({ text: t('ui.restPeriod') + ': ' + restCheck.restHours.toFixed(1) + 'h (' + t('ui.minimum') + ' ' + minimumRest + 'h)' });
			}
		}

		// Add helpful tip
		const tipP = menuInfo.createEl('p', { text: '💡 Velg et alternativ fra menyen til venstre' });
		tipP.style.marginTop = '12px';
		tipP.style.fontSize = '0.8em';
		tipP.style.color = 'var(--text-muted)';
		tipP.style.borderTop = '1px solid var(--background-modifier-border)';
		tipP.style.paddingTop = '8px';
		menu.appendChild(menuInfo);

		// Close menu on click outside
		setTimeout(() => {
			const closeMenu = (e: MouseEvent) => {
				if (!menu.contains(e.target as Node)) {
					menu.remove();
					document.removeEventListener('click', closeMenu);
				}
			};
			document.addEventListener('click', closeMenu);
		}, 0);
	}

	showWorkTimeModal(dateObj: Date): void {
		const dateStr = Utils.toLocalDateStr(dateObj);

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim';
		modal.style.zIndex = '1000';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => modal.remove();
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal';
		modalContent.style.width = '400px';

		// Title
		const title = document.createElement('div');
		title.className = 'modal-title';
		title.textContent = `${t('modals.logWorkTitle')} ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content';
		content.style.padding = '20px';

		// Start time
		const startLabel = document.createElement('div');
		startLabel.textContent = t('modals.startTimeFormat');
		startLabel.style.marginBottom = '5px';
		startLabel.style.fontWeight = 'bold';
		content.appendChild(startLabel);

		const startInput = document.createElement('input');
		startInput.type = 'text';
		startInput.value = '08:00';
		startInput.placeholder = 'HH:MM';
		startInput.style.width = '100%';
		startInput.style.marginBottom = '15px';
		startInput.style.padding = '8px';
		startInput.style.fontSize = '14px';
		content.appendChild(startInput);

		// End time
		const endLabel = document.createElement('div');
		endLabel.textContent = t('modals.endTimeFormat');
		endLabel.style.marginBottom = '5px';
		endLabel.style.fontWeight = 'bold';
		content.appendChild(endLabel);

		const endInput = document.createElement('input');
		endInput.type = 'text';
		endInput.value = '15:30';
		endInput.placeholder = 'HH:MM';
		endInput.style.width = '100%';
		endInput.style.marginBottom = '20px';
		endInput.style.padding = '8px';
		endInput.style.fontSize = '14px';
		content.appendChild(endInput);

		// Buttons
		const buttonDiv = document.createElement('div');
		buttonDiv.style.display = 'flex';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.justifyContent = 'flex-end';

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => modal.remove();
		buttonDiv.appendChild(cancelBtn);

		const addBtn = document.createElement('button');
		addBtn.textContent = 'Legg til';
		addBtn.className = 'mod-cta';
		addBtn.onclick = () => {
			const startTime = startInput.value.trim();
			const endTime = endInput.value.trim();

			// Validate time format
			const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
			if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
				new Notice('❌ Ugyldig tidsformat. Bruk HH:MM format.');
				return;
			}

			// Create ISO datetime strings for the timer manager
			const [startHour, startMin] = startTime.split(':').map(Number);
			const [endHour, endMin] = endTime.split(':').map(Number);

			const startDate = new Date(dateObj);
			startDate.setHours(startHour, startMin, 0, 0);

			const endDate = new Date(dateObj);
			endDate.setHours(endHour, endMin, 0, 0);

			// If end time is before start time, assume it's the next day
			if (endDate <= startDate) {
				new Notice(`❌ ${t('validation.endAfterStart')}`);
				return;
			}

			// Add the work session using the timer manager
			try {
				this.timerManager.data.entries.push({
					name: 'jobb',
					startTime: startDate.toISOString(),
					endTime: endDate.toISOString(),
					subEntries: null,
					collapsed: false
				});

				this.timerManager.save();

				const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
				new Notice(`✅ Lagt til ${duration.toFixed(1)} timer arbeidstid for ${dateStr}`);

				// Reload data to reflect changes
				this.data.rawEntries = this.timerManager.convertToTimeEntries();
				this.data.processEntries();

				// Refresh the dashboard
				this.updateDayCard();
				this.updateWeekCard();
				this.updateStatsCard();
				this.updateMonthCard();

				modal.remove();
			} catch (error) {
				console.error('Failed to add work time:', error);
				new Notice('❌ Kunne ikke legge til arbeidstid');
			}
		};
		buttonDiv.appendChild(addBtn);

		content.appendChild(buttonDiv);
		modalContent.appendChild(content);
		modal.appendChild(modalContent);

		document.body.appendChild(modal);
		startInput.focus();
		startInput.select();
	}

	showEditEntriesModal(dateObj: Date): void {
		const dateStr = Utils.toLocalDateStr(dateObj);

		// Get all work entries for this date from the timer manager
		// Include subEntries from collapsed Timekeep entries
		const allEntries = this.timerManager.data.entries;
		const workEntries: { entry: Timer; parent?: Timer; subIndex?: number }[] = [];

		allEntries.forEach(entry => {
			if (entry.collapsed && entry.subEntries) {
				// For collapsed entries, add each subEntry with reference to parent
				entry.subEntries.forEach((sub, idx) => {
					if (sub.startTime) {
						const entryDate = new Date(sub.startTime);
						if (Utils.toLocalDateStr(entryDate) === dateStr) {
							workEntries.push({ entry: sub, parent: entry, subIndex: idx });
						}
					}
				});
			} else if (entry.startTime) {
				const entryDate = new Date(entry.startTime);
				if (Utils.toLocalDateStr(entryDate) === dateStr) {
					workEntries.push({ entry });
				}
			}
		});

		if (workEntries.length === 0) {
			new Notice('Ingen arbeidstidsoppføringer funnet for denne datoen');
			return;
		}

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim';
		modal.style.zIndex = '1000';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => modal.remove();
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal';
		modalContent.style.width = '500px';
		modalContent.style.maxHeight = '80vh';
		modalContent.style.overflow = 'auto';

		// Title
		const title = document.createElement('div');
		title.className = 'modal-title';
		title.textContent = `${t('modals.editWorkTitle')} ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content';
		content.style.padding = '20px';

		// List all entries with edit/delete options
		workEntries.forEach((item, index) => {
			const entry = item.entry;
			const entryDiv = document.createElement('div');
			entryDiv.style.padding = '15px';
			entryDiv.style.marginBottom = '10px';
			entryDiv.style.background = 'var(--background-secondary)';
			entryDiv.style.borderRadius = '8px';
			entryDiv.style.border = '1px solid var(--background-modifier-border)';

			const startDate = new Date(entry.startTime!);
			const endDate = entry.endTime ? new Date(entry.endTime) : null;

			const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
			const endTimeStr = endDate ? `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}` : t('ui.ongoing');

			const duration = endDate ? ((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)).toFixed(1) : 'N/A';

			// Entry info
			const infoDiv = document.createElement('div');
			infoDiv.style.marginBottom = '10px';

			// Show entry name for subEntries, or just number for regular entries
			const entryLabel = item.parent ? `${item.parent.name} - ${entry.name}` : `Oppføring ${index + 1}`;
			const titleDiv = infoDiv.createDiv({ text: entryLabel });
			titleDiv.style.cssText = 'font-weight: bold; margin-bottom: 5px;';
			infoDiv.createDiv({ text: `⏰ ${startTimeStr} - ${endTimeStr}` });
			infoDiv.createDiv({ text: `⏱️ ${duration} timer` });

			entryDiv.appendChild(infoDiv);

			// Edit fields (initially hidden)
			const editDiv = document.createElement('div');
			editDiv.style.display = 'none';
			editDiv.style.marginTop = '10px';

			const startLabel = document.createElement('div');
			startLabel.textContent = `${t('modals.startTime')}:`;
			startLabel.style.marginBottom = '5px';
			startLabel.style.fontWeight = 'bold';
			editDiv.appendChild(startLabel);

			const startInput = document.createElement('input');
			startInput.type = 'text';
			startInput.value = startTimeStr;
			startInput.style.width = '100%';
			startInput.style.marginBottom = '10px';
			startInput.style.padding = '6px';
			editDiv.appendChild(startInput);

			const endLabel = document.createElement('div');
			endLabel.textContent = `${t('modals.endTime')}:`;
			endLabel.style.marginBottom = '5px';
			endLabel.style.fontWeight = 'bold';
			editDiv.appendChild(endLabel);

			const endInput = document.createElement('input');
			endInput.type = 'text';
			endInput.value = endTimeStr !== t('ui.ongoing') ? endTimeStr : '';
			endInput.style.width = '100%';
			endInput.style.marginBottom = '10px';
			endInput.style.padding = '6px';
			editDiv.appendChild(endInput);

			entryDiv.appendChild(editDiv);

			// Buttons
			const buttonDiv = document.createElement('div');
			buttonDiv.style.display = 'flex';
			buttonDiv.style.gap = '8px';
			buttonDiv.style.marginTop = '10px';

			const editBtn = document.createElement('button');
			editBtn.textContent = `✏️ ${t('buttons.edit')}`;
			editBtn.style.flex = '1';
			editBtn.onclick = () => {
				if (editDiv.style.display === 'none') {
					editDiv.style.display = 'block';
					editBtn.textContent = `💾 ${t('buttons.save')}`;
				} else {
					// Save changes
					const newStartTime = startInput.value.trim();
					const newEndTime = endInput.value.trim();

					const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
					if (!timeRegex.test(newStartTime) || (newEndTime && !timeRegex.test(newEndTime))) {
						new Notice('❌ Ugyldig tidsformat. Bruk HH:MM format.');
						return;
					}

					const [startHour, startMin] = newStartTime.split(':').map(Number);
					const newStartDate = new Date(dateObj);
					newStartDate.setHours(startHour, startMin, 0, 0);

					let newEndDate: Date | null = null;
					if (newEndTime) {
						const [endHour, endMin] = newEndTime.split(':').map(Number);
						newEndDate = new Date(dateObj);
						newEndDate.setHours(endHour, endMin, 0, 0);

						if (newEndDate <= newStartDate) {
							new Notice(`❌ ${t('validation.endAfterStart')}`);
							return;
						}
					}

					// Update the entry (use local ISO format)
					entry.startTime = Utils.toLocalISOString(newStartDate);
					entry.endTime = newEndDate ? Utils.toLocalISOString(newEndDate) : null;

					this.timerManager.save();
					new Notice('✅ Oppføring oppdatert');

					// Reload data to reflect changes
					this.data.rawEntries = this.timerManager.convertToTimeEntries();
					this.data.processEntries();

					// Refresh the dashboard
					this.updateDayCard();
					this.updateWeekCard();
					this.updateStatsCard();
					this.updateMonthCard();

					modal.remove();
				}
			};
			buttonDiv.appendChild(editBtn);

			const deleteBtn = document.createElement('button');
			deleteBtn.textContent = `🗑️ ${t('buttons.delete')}`;
			deleteBtn.style.flex = '1';
			deleteBtn.onclick = () => {
				// Show confirmation dialog
				this.showDeleteConfirmation(entry, dateObj, () => {
					let deleted = false;

					if (item.parent && item.subIndex !== undefined) {
						// This is a subEntry - remove from parent's subEntries array
						if (item.parent.subEntries) {
							item.parent.subEntries.splice(item.subIndex, 1);
							// If no subEntries left, remove the parent entry too
							if (item.parent.subEntries.length === 0) {
								const parentIndex = this.timerManager.data.entries.indexOf(item.parent);
								if (parentIndex > -1) {
									this.timerManager.data.entries.splice(parentIndex, 1);
								}
							}
							deleted = true;
						}
					} else {
						// Regular entry - remove from entries array
						const entryIndex = this.timerManager.data.entries.indexOf(entry);
						if (entryIndex > -1) {
							this.timerManager.data.entries.splice(entryIndex, 1);
							deleted = true;
						}
					}

					if (deleted) {
						this.timerManager.save();
						new Notice('✅ Oppføring slettet');

						// Reload data to reflect changes
						this.data.rawEntries = this.timerManager.convertToTimeEntries();
						this.data.processEntries();

						// Refresh the dashboard
						this.updateDayCard();
						this.updateWeekCard();
						this.updateStatsCard();
						this.updateMonthCard();

						modal.remove();
					}
				});
			};
			buttonDiv.appendChild(deleteBtn);

			entryDiv.appendChild(buttonDiv);
			content.appendChild(entryDiv);
		});

		// Close button
		const closeDiv = document.createElement('div');
		closeDiv.style.marginTop = '20px';
		closeDiv.style.display = 'flex';
		closeDiv.style.justifyContent = 'flex-end';

		const closeBtn = document.createElement('button');
		closeBtn.textContent = t('buttons.close');
		closeBtn.onclick = () => modal.remove();
		closeDiv.appendChild(closeBtn);

		content.appendChild(closeDiv);
		modalContent.appendChild(content);
		modal.appendChild(modalContent);

		document.body.appendChild(modal);
	}

	showSpecialDayModal(dateObj: Date): void {
		const dateStr = Utils.toLocalDateStr(dateObj);

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim';
		modal.style.zIndex = '1000';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => modal.remove();
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal';
		modalContent.style.width = '400px';

		// Title
		const title = document.createElement('div');
		title.className = 'modal-title';
		title.textContent = t('modals.registerSpecialDayTitle');
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content';
		content.style.padding = '20px';

		// Date display
		const dateDisplay = document.createElement('div');
		dateDisplay.textContent = `${t('ui.date')}: ${dateStr}`;
		dateDisplay.style.marginBottom = '15px';
		dateDisplay.style.fontSize = '16px';
		dateDisplay.style.fontWeight = 'bold';
		content.appendChild(dateDisplay);

		// Day type selection
		const typeLabel = document.createElement('div');
		typeLabel.textContent = 'Type dag:';
		typeLabel.style.marginBottom = '5px';
		typeLabel.style.fontWeight = 'bold';
		content.appendChild(typeLabel);

		// Build day types from special day behaviors
		const dayTypes = this.settings.specialDayBehaviors.map(behavior => ({
			type: behavior.id,
			label: `${behavior.icon} ${translateSpecialDayName(behavior.id, behavior.label)}`
		}));

		const typeSelect = document.createElement('select');
		typeSelect.style.width = '100%';
		typeSelect.style.marginBottom = '15px';
		typeSelect.style.padding = '8px';
		typeSelect.style.fontSize = '14px';

		dayTypes.forEach(({ type, label }) => {
			const option = document.createElement('option');
			option.value = type;
			option.textContent = label;
			typeSelect.appendChild(option);
		});
		content.appendChild(typeSelect);

		// Time range fields (only visible for avspasering)
		const timeContainer = document.createElement('div');
		timeContainer.style.marginBottom = '15px';
		timeContainer.style.display = 'none'; // Hidden by default

		const timeLabel = document.createElement('div');
		timeLabel.textContent = 'Tidsperiode:';
		timeLabel.style.marginBottom = '5px';
		timeLabel.style.fontWeight = 'bold';
		timeContainer.appendChild(timeLabel);

		// Time inputs row
		const timeInputRow = document.createElement('div');
		timeInputRow.style.display = 'flex';
		timeInputRow.style.gap = '10px';
		timeInputRow.style.alignItems = 'center';

		const fromLabel = document.createElement('span');
		fromLabel.textContent = 'Fra:';
		timeInputRow.appendChild(fromLabel);

		const fromTimeInput = document.createElement('input');
		fromTimeInput.type = 'time';
		fromTimeInput.value = '08:00';
		fromTimeInput.style.padding = '8px';
		fromTimeInput.style.fontSize = '14px';
		timeInputRow.appendChild(fromTimeInput);

		const toLabel = document.createElement('span');
		toLabel.textContent = 'Til:';
		timeInputRow.appendChild(toLabel);

		const toTimeInput = document.createElement('input');
		toTimeInput.type = 'time';
		// Default to end of workday
		const workdayHours = this.settings.baseWorkday * this.settings.workPercent;
		const defaultEndHour = 8 + workdayHours; // Assuming 08:00 start
		const endH = Math.floor(defaultEndHour);
		const endM = Math.round((defaultEndHour - endH) * 60);
		toTimeInput.value = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
		toTimeInput.style.padding = '8px';
		toTimeInput.style.fontSize = '14px';
		timeInputRow.appendChild(toTimeInput);

		timeContainer.appendChild(timeInputRow);

		// Duration display
		const durationDisplay = document.createElement('div');
		durationDisplay.style.fontSize = '12px';
		durationDisplay.style.color = 'var(--text-muted)';
		durationDisplay.style.marginTop = '8px';

		const updateDuration = () => {
			const from = fromTimeInput.value;
			const to = toTimeInput.value;
			if (from && to) {
				const [fH, fM] = from.split(':').map(Number);
				const [tH, tM] = to.split(':').map(Number);
				const hours = (tH + tM/60) - (fH + fM/60);
				if (hours > 0) {
					durationDisplay.textContent = `Varighet: ${hours.toFixed(1)} timer`;
				} else {
					durationDisplay.textContent = 'Ugyldig tidsperiode';
				}
			}
		};
		updateDuration();
		fromTimeInput.addEventListener('change', updateDuration);
		toTimeInput.addEventListener('change', updateDuration);

		timeContainer.appendChild(durationDisplay);
		content.appendChild(timeContainer);

		// Show/hide time fields based on type selection
		typeSelect.addEventListener('change', () => {
			timeContainer.style.display = typeSelect.value === 'avspasering' ? 'block' : 'none';
		});

		// Note/comment field
		const noteLabel = document.createElement('div');
		noteLabel.textContent = 'Kommentar (valgfritt):';
		noteLabel.style.marginBottom = '5px';
		noteLabel.style.fontWeight = 'bold';
		content.appendChild(noteLabel);

		const noteInput = document.createElement('input');
		noteInput.type = 'text';
		noteInput.placeholder = 'F.eks. "Ferie i Spania"';
		noteInput.style.width = '100%';
		noteInput.style.marginBottom = '20px';
		noteInput.style.padding = '8px';
		noteInput.style.fontSize = '14px';
		content.appendChild(noteInput);

		// Buttons
		const buttonDiv = document.createElement('div');
		buttonDiv.style.display = 'flex';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.justifyContent = 'flex-end';

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => modal.remove();
		buttonDiv.appendChild(cancelBtn);

		const addBtn = document.createElement('button');
		addBtn.textContent = 'Legg til';
		addBtn.className = 'mod-cta';
		addBtn.onclick = async () => {
			const dayType = typeSelect.value;
			const note = noteInput.value.trim();
			const startTime = dayType === 'avspasering' ? fromTimeInput.value : undefined;
			const endTime = dayType === 'avspasering' ? toTimeInput.value : undefined;
			await this.addSpecialDay(dateObj, dayType, note, startTime, endTime);
			modal.remove();
		};
		buttonDiv.appendChild(addBtn);

		content.appendChild(buttonDiv);
		modalContent.appendChild(content);
		modal.appendChild(modalContent);

		document.body.appendChild(modal);
		typeSelect.focus();
	}

	async addSpecialDay(dateObj: Date, dayType: string, note: string = '', startTime?: string, endTime?: string): Promise<void> {
		try {
			const filePath = this.settings.holidaysFilePath;
			const file = this.app.vault.getAbstractFileByPath(filePath);

			if (!file) {
				new Notice(`❌ Fant ikke filen: ${filePath}`);
				return;
			}

			// Format the date as YYYY-MM-DD
			const year = dateObj.getFullYear();
			const month = String(dateObj.getMonth() + 1).padStart(2, '0');
			const day = String(dateObj.getDate()).padStart(2, '0');
			const dateStr = `${year}-${month}-${day}`;

			// Read the file content
			let content = await this.app.vault.read(file as TFile);

			// Find the "Planlagte egne fridager" section
			const sectionMarker = '## Planlagte egne fridager';
			const sectionIndex = content.indexOf(sectionMarker);

			if (sectionIndex === -1) {
				new Notice('❌ Fant ikke seksjonen "Planlagte egne fridager"');
				return;
			}

			// Find the code block after the section
			const codeBlockStart = content.indexOf('```', sectionIndex);
			const codeBlockEnd = content.indexOf('```', codeBlockStart + 3);

			if (codeBlockStart === -1 || codeBlockEnd === -1) {
				new Notice('❌ Fant ikke kodeblokk i seksjonen');
				return;
			}

			// Create the new entry line with the selected type and optional note
			// For avspasering, include time range: - 2025-01-15: avspasering:14:00-16:00: comment
			let typeWithModifier = dayType;
			if (dayType === 'avspasering' && startTime && endTime) {
				typeWithModifier = `${dayType}:${startTime}-${endTime}`;
			}
			const newEntry = `- ${dateStr}: ${typeWithModifier}: ${note}`;

			// Insert the new line at the end of the code block, before the closing ```
			const beforeClosing = content.substring(0, codeBlockEnd);
			const afterClosing = content.substring(codeBlockEnd);

			// Add newline if needed
			const needsNewline = !beforeClosing.endsWith('\n');
			content = beforeClosing + (needsNewline ? '\n' : '') + newEntry + '\n' + afterClosing;

			// Write back to file
			await this.app.vault.modify(file as TFile, content);

			// Get the label for the day type
			const label = translateSpecialDayName(dayType);
			new Notice(`✅ ${t('notifications.added')} ${dateStr} (${label})`);

			// Reload holidays to pick up the new entry
			await this.data.loadHolidays();

			// Refresh the dashboard to show the special day
			this.updateMonthCard();
		} catch (error) {
			console.error('Failed to add special day:', error);
			new Notice('❌ Kunne ikke legge til spesialdag');
		}
	}

	async createNoteFromType(dateObj: Date, noteType: any): Promise<void> {
		try {
			const dateStr = Utils.toLocalDateStr(dateObj);
			const weekNum = Utils.getWeekNumber(dateObj);

			let filename = noteType.filenamePattern
				.replace('{YYYY}', dateObj.getFullYear().toString())
				.replace('{MM}', (dateObj.getMonth() + 1).toString().padStart(2, '0'))
				.replace('{DD}', dateObj.getDate().toString().padStart(2, '0'))
				.replace('{WEEK}', weekNum.toString());

			const filePath = `${noteType.folder}/${filename}.md`;

			// Check if file exists
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile) {
				await this.app.workspace.getLeaf(false).openFile(existingFile as TFile);
				new Notice(`Opened existing note: ${filename}`);
				return;
			}

			// Create folder if it doesn't exist
			const folderPath = noteType.folder;
			if (!await this.app.vault.adapter.exists(folderPath)) {
				await this.app.vault.createFolder(folderPath);
			}

			// Load template
			let content = '';
			const templateFile = this.app.vault.getAbstractFileByPath(noteType.template);
			if (templateFile && templateFile instanceof TFile) {
				content = await this.app.vault.read(templateFile);
			}

			// Replace placeholders
			content = content
				.replace(/{date}/g, dateStr)
				.replace(/{time}/g, new Date().toLocaleTimeString('nb-NO'))
				.replace(/{week}/g, weekNum.toString());

			// Add tags
			if (noteType.tags && noteType.tags.length > 0) {
				content += `\n\n${noteType.tags.join(' ')}`;
			}

			// Create file
			const file = await this.app.vault.create(filePath, content);
			await this.app.workspace.getLeaf(false).openFile(file);
			new Notice(`Created note: ${filename}`);

		} catch (error: any) {
			new Notice(`Error creating note: ${error.message}`);
			console.error('Error creating note:', error);
		}
	}

	refreshHistoryView(container: HTMLElement): void {
		container.empty();

		// Build years data structure from daily entries
		const years: Record<string, Record<string, any[]>> = {};
		Object.keys(this.data.daily).sort().reverse().forEach(dateKey => {
			const year = dateKey.split('-')[0];
			if (!years[year]) years[year] = {};
			const month = dateKey.split('-')[1];
			if (!years[year][month]) years[year][month] = [];

			// Add entries with filtering applied (list view only)
			const dayEntries = this.data.daily[dateKey];
			dayEntries.forEach(entry => {
				// Apply filter only in list view
				if (this.historyView === 'list' && this.historyFilter.length > 0) {
					const entryType = entry.name.toLowerCase();
					if (!this.historyFilter.includes(entryType)) {
						return; // Skip entry if not matching filter
					}
				}
				years[year][month].push(entry);
			});
		});

		// Clean up empty months/years after filtering
		Object.keys(years).forEach(year => {
			Object.keys(years[year]).forEach(month => {
				if (years[year][month].length === 0) {
					delete years[year][month];
				}
			});
			if (Object.keys(years[year]).length === 0) {
				delete years[year];
			}
		});

		if (this.historyView === 'list') {
			this.renderListView(container, years);
		} else if (this.historyView === 'weekly') {
			this.renderWeeklyView(container, years);
		} else if (this.historyView === 'heatmap') {
			this.renderHeatmapView(container, years);
		}

		// Show/hide edit toggle based on width and view
		this.updateEditToggleVisibility(container);
	}

	updateEditToggleVisibility(container: HTMLElement): void {
		// Find the history card and its edit toggle
		const historyCard = container.closest('.tf-card-history');
		if (!historyCard) return;

		const editToggle = (historyCard as any)._editToggle as HTMLElement;
		if (!editToggle) return;

		// Only show edit toggle in list view and when wide enough
		const isWide = container.offsetWidth >= 450;
		const isListView = this.historyView === 'list';

		editToggle.style.display = (isWide && isListView) ? 'block' : 'none';

		// Update button text based on current mode
		editToggle.textContent = this.inlineEditMode ? `✓ ${t('buttons.done')}` : `✏️ ${t('buttons.edit')}`;
		editToggle.classList.toggle('active', this.inlineEditMode);
	}

	renderListView(container: HTMLElement, years: Record<string, Record<string, any[]>>): void {
		// Add filter bar at the top
		this.renderFilterBar(container);

		// Detect if we're in wide mode
		const isWide = container.offsetWidth >= 450;

		// Render appropriate view
		if (isWide) {
			this.renderWideListView(container, years);
		} else {
			this.renderNarrowListView(container, years);
		}

		// Check width again after render - container may not have final width on first render
		requestAnimationFrame(() => {
			const actualWidth = container.offsetWidth;
			const shouldBeWide = actualWidth >= 450;

			// If width detection changed, re-render with correct mode
			if (shouldBeWide !== isWide) {
				// Clear and re-render
				container.empty();
				this.renderFilterBar(container);
				if (shouldBeWide) {
					this.renderWideListView(container, years);
				} else {
					this.renderNarrowListView(container, years);
				}
			}
		});
	}

	renderFilterBar(container: HTMLElement): void {
		const filterBar = document.createElement('div');
		filterBar.className = 'tf-history-filters';

		// "Alle" chip (active when no filter applied)
		const alleChip = document.createElement('button');
		alleChip.className = `tf-filter-chip ${this.historyFilter.length === 0 ? 'active' : ''}`;
		alleChip.textContent = t('ui.all');
		alleChip.onclick = () => {
			this.historyFilter = [];
			this.refreshHistoryView(container);
		};
		filterBar.appendChild(alleChip);

		// Add chips for each special day behavior
		this.settings.specialDayBehaviors.forEach(behavior => {
			const chip = document.createElement('button');
			const isActive = this.historyFilter.includes(behavior.id);
			chip.className = `tf-filter-chip ${isActive ? 'active' : ''}`;
			chip.textContent = `${behavior.icon} ${translateSpecialDayName(behavior.id, behavior.label)}`;
			chip.onclick = () => {
				if (isActive) {
					// Remove from filter
					this.historyFilter = this.historyFilter.filter(f => f !== behavior.id);
				} else {
					// Add to filter (multi-select)
					this.historyFilter = [...this.historyFilter, behavior.id];
				}
				this.refreshHistoryView(container);
			};
			filterBar.appendChild(chip);
		});

		container.appendChild(filterBar);
	}

	renderNarrowListView(container: HTMLElement, years: Record<string, Record<string, any[]>>): void {
		Object.keys(years).forEach(year => {
			const yearDiv = document.createElement('div');
			const h4 = yearDiv.createEl('h4', { text: year });
			h4.style.color = 'var(--text-normal)';

			Object.keys(years[year]).forEach(month => {
				const monthEntries = years[year][month];
				const table = document.createElement('table');
				table.className = 'tf-history-table-narrow';

				// Create thead
				const thead = document.createElement('thead');
				const headerRow = document.createElement('tr');
				[t('ui.date'), t('ui.type'), t('ui.hours'), t('ui.flextime'), ''].forEach(h => {
					const th = document.createElement('th');
					th.textContent = h;
					headerRow.appendChild(th);
				});
				thead.appendChild(headerRow);
				table.appendChild(thead);

				// Create tbody
				const tbody = document.createElement('tbody');
				monthEntries.forEach((e: any) => {
					const row = document.createElement('tr');

					// Date cell
					const dateCell = document.createElement('td');
					const dateStr = Utils.toLocalDateStr(e.date);
					const holidayInfo = this.data.getHolidayInfo(dateStr);
					const hasConflict = holidayInfo &&
						['ferie', 'helligdag', 'egenmelding', 'sykemelding', 'velferdspermisjon'].includes(holidayInfo.type) &&
						e.name.toLowerCase() !== 'avspasering';

					if (hasConflict) {
						const flagIcon = document.createElement('span');
						flagIcon.textContent = '⚠️ ';
						flagIcon.title = t('info.workRegisteredOnSpecialDay').replace('{dayType}', translateSpecialDayName(holidayInfo!.type));
						flagIcon.style.cursor = 'help';
						dateCell.appendChild(flagIcon);
					}
					dateCell.appendChild(document.createTextNode(dateStr));
					row.appendChild(dateCell);

					// Type cell
					const typeCell = document.createElement('td');
					const entryNameLower = e.name.toLowerCase();
					typeCell.textContent = translateSpecialDayName(entryNameLower, e.name);
					row.appendChild(typeCell);

					// Hours cell
					const hoursCell = document.createElement('td');
					hoursCell.textContent = Utils.formatHoursToHM(e.duration || 0, this.settings.hourUnit);
					row.appendChild(hoursCell);

					// Flextime cell
					const flextimeCell = document.createElement('td');
					flextimeCell.textContent = Utils.formatHoursToHM(e.flextime || 0, this.settings.hourUnit);
					row.appendChild(flextimeCell);

					// Action cell
					const actionCell = document.createElement('td');
					const editBtn = document.createElement('button');
					editBtn.textContent = '✏️';
					editBtn.style.padding = '4px 8px';
					editBtn.style.cursor = 'pointer';
					editBtn.title = t('menu.editWork');
					editBtn.onclick = () => {
						this.showEditEntriesModal(e.date);
					};
					actionCell.appendChild(editBtn);
					row.appendChild(actionCell);

					tbody.appendChild(row);
				});
				table.appendChild(tbody);

				yearDiv.appendChild(table);
			});

			container.appendChild(yearDiv);
		});
	}

	renderWideListView(container: HTMLElement, years: Record<string, Record<string, any[]>>): void {
		Object.keys(years).forEach(year => {
			const yearDiv = document.createElement('div');
			const h4 = yearDiv.createEl('h4', { text: year });
			h4.style.color = 'var(--text-normal)';

			Object.keys(years[year]).forEach(month => {
				const monthEntries = years[year][month];
				const table = document.createElement('table');
				table.className = 'tf-history-table-wide';

				// Create thead with additional columns for wide view
				const thead = document.createElement('thead');
				const headerRow = document.createElement('tr');

				const headers = this.inlineEditMode
					? [t('ui.date'), t('ui.type'), t('ui.start'), t('ui.end'), t('ui.hours'), t('ui.flextime'), '']
					: [t('ui.date'), t('ui.type'), t('ui.start'), t('ui.end'), t('ui.hours'), t('ui.flextime')];

				headers.forEach(h => {
					const th = document.createElement('th');
					th.textContent = h;
					headerRow.appendChild(th);
				});
				thead.appendChild(headerRow);
				table.appendChild(thead);

				// Create tbody
				const tbody = document.createElement('tbody');

				// Group entries by date to match with raw timer entries
				const entriesByDate: Record<string, any[]> = {};
				monthEntries.forEach((e: any) => {
					const dateStr = Utils.toLocalDateStr(e.date);
					if (!entriesByDate[dateStr]) entriesByDate[dateStr] = [];
					entriesByDate[dateStr].push(e);
				});

				// Get raw timer entries for start/end times
				// Include subEntries from collapsed Timekeep entries
				const rawEntries = this.timerManager.data.entries;
				const flatRawEntries: { entry: Timer; parent?: Timer; subIndex?: number }[] = [];
				rawEntries.forEach(entry => {
					if (entry.collapsed && entry.subEntries) {
						entry.subEntries.forEach((sub, idx) => {
							if (sub.startTime) {
								flatRawEntries.push({ entry: sub, parent: entry, subIndex: idx });
							}
						});
					} else if (entry.startTime) {
						flatRawEntries.push({ entry });
					}
				});

				Object.keys(entriesByDate).sort().reverse().forEach(dateStr => {
					const dayEntries = entriesByDate[dateStr];

					// Get raw entries for this date (including subEntries)
					const rawDayEntries = flatRawEntries.filter(item => {
						const entryDate = new Date(item.entry.startTime!);
						return Utils.toLocalDateStr(entryDate) === dateStr;
					});

					dayEntries.forEach((e: any, idx: number) => {
						const row = document.createElement('tr');

						// Find matching raw entry for this processed entry
						const matchingItem = rawDayEntries.find(item =>
							item.entry.name.toLowerCase() === e.name.toLowerCase()
						) || rawDayEntries[idx];
						const matchingRaw = matchingItem?.entry;

						// Date cell
						const dateCell = document.createElement('td');
						const holidayInfo = this.data.getHolidayInfo(dateStr);
						const hasConflict = holidayInfo &&
							['ferie', 'helligdag', 'egenmelding', 'sykemelding', 'velferdspermisjon'].includes(holidayInfo.type) &&
							e.name.toLowerCase() !== 'avspasering';

						if (hasConflict) {
							const flagIcon = document.createElement('span');
							flagIcon.textContent = '⚠️ ';
							flagIcon.title = t('info.workRegisteredOnSpecialDay').replace('{dayType}', translateSpecialDayName(holidayInfo!.type));
							flagIcon.style.cursor = 'help';
							dateCell.appendChild(flagIcon);
						}
						dateCell.appendChild(document.createTextNode(dateStr));
						row.appendChild(dateCell);

						// Type cell
						const typeCell = document.createElement('td');
						if (this.inlineEditMode && matchingRaw) {
							const select = document.createElement('select');
							this.settings.specialDayBehaviors.forEach(behavior => {
								const option = document.createElement('option');
								option.value = behavior.id;
								option.textContent = `${behavior.icon} ${translateSpecialDayName(behavior.id, behavior.label)}`;
								if (behavior.id === e.name.toLowerCase()) {
									option.selected = true;
								}
								select.appendChild(option);
							});
							select.onchange = async () => {
								matchingRaw.name = select.value;
								await this.timerManager.save();
								// Refresh the view to show updated values
								await this.plugin.timerManager.onTimerChange?.();
							};
							typeCell.appendChild(select);
						} else {
							const entryNameLower = e.name.toLowerCase();
							typeCell.textContent = translateSpecialDayName(entryNameLower, e.name);
						}
						row.appendChild(typeCell);

						// Start time cell
						const startCell = document.createElement('td');
						if (matchingRaw?.startTime) {
							const startDate = new Date(matchingRaw.startTime);
							const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;

							if (this.inlineEditMode) {
								const input = document.createElement('input');
								input.type = 'time';
								input.value = startTimeStr;
								input.onchange = async () => {
									const [hours, minutes] = input.value.split(':').map(Number);
									const newStart = new Date(matchingRaw.startTime!);
									newStart.setHours(hours, minutes, 0, 0);
									matchingRaw.startTime = Utils.toLocalISOString(newStart);
									await this.timerManager.save();
									await this.plugin.timerManager.onTimerChange?.();
								};
								startCell.appendChild(input);
							} else {
								startCell.textContent = startTimeStr;
							}
						} else {
							startCell.textContent = '-';
						}
						row.appendChild(startCell);

						// End time cell
						const endCell = document.createElement('td');
						if (matchingRaw?.endTime) {
							const endDate = new Date(matchingRaw.endTime);
							const endTimeStr = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

							if (this.inlineEditMode) {
								const input = document.createElement('input');
								input.type = 'time';
								input.value = endTimeStr;
								input.onchange = async () => {
									const [hours, minutes] = input.value.split(':').map(Number);
									const newEnd = new Date(matchingRaw.endTime!);
									newEnd.setHours(hours, minutes, 0, 0);
									matchingRaw.endTime = Utils.toLocalISOString(newEnd);
									await this.timerManager.save();
									await this.plugin.timerManager.onTimerChange?.();
								};
								endCell.appendChild(input);
							} else {
								endCell.textContent = endTimeStr;
							}
						} else {
							endCell.textContent = matchingRaw ? t('ui.ongoing') : '-';
						}
						row.appendChild(endCell);

						// Hours cell (always read-only)
						const hoursCell = document.createElement('td');
						hoursCell.textContent = Utils.formatHoursToHM(e.duration || 0, this.settings.hourUnit);
						row.appendChild(hoursCell);

						// Flextime cell (always read-only)
						const flextimeCell = document.createElement('td');
						flextimeCell.textContent = Utils.formatHoursToHM(e.flextime || 0, this.settings.hourUnit);
						row.appendChild(flextimeCell);

						// Delete button (only in edit mode)
						if (this.inlineEditMode) {
							const actionCell = document.createElement('td');
							if (matchingItem) {
								const deleteBtn = document.createElement('button');
								deleteBtn.className = 'tf-history-delete-btn';
								deleteBtn.textContent = '🗑️';
								deleteBtn.title = t('menu.deleteEntry');
								deleteBtn.onclick = async () => {
									if (confirm(`${t('confirm.deleteEntryFor')} ${dateStr}?`)) {
										if (matchingItem.parent && matchingItem.subIndex !== undefined) {
											// This is a subEntry - remove from parent's subEntries array
											if (matchingItem.parent.subEntries) {
												matchingItem.parent.subEntries.splice(matchingItem.subIndex, 1);
												// If no subEntries left, remove the parent entry too
												if (matchingItem.parent.subEntries.length === 0) {
													const parentIndex = this.timerManager.data.entries.indexOf(matchingItem.parent);
													if (parentIndex > -1) {
														this.timerManager.data.entries.splice(parentIndex, 1);
													}
												}
											}
										} else {
											// Regular entry - remove from entries array
											const entryIndex = this.timerManager.data.entries.indexOf(matchingRaw!);
											if (entryIndex > -1) {
												this.timerManager.data.entries.splice(entryIndex, 1);
											}
										}
										await this.timerManager.save();
										await this.plugin.timerManager.onTimerChange?.();
									}
								};
								actionCell.appendChild(deleteBtn);
							}
							row.appendChild(actionCell);
						}

						tbody.appendChild(row);
					});
				});

				// Add "new entry" row in edit mode
				if (this.inlineEditMode) {
					const addRow = document.createElement('tr');
					addRow.className = 'tf-history-add-row';
					const addCell = document.createElement('td');
					addCell.colSpan = 7;
					addCell.textContent = '+ Legg til ny oppføring';
					addCell.onclick = () => {
						// Get the most recent date from this month's entries or use today
						const lastEntry = monthEntries[0];
						const targetDate = lastEntry?.date || new Date();
						this.showAddEntryModal(targetDate);
					};
					addRow.appendChild(addCell);
					tbody.appendChild(addRow);
				}

				table.appendChild(tbody);
				yearDiv.appendChild(table);
			});

			container.appendChild(yearDiv);
		});
	}

	showAddEntryModal(targetDate: Date): void {
		const dateStr = Utils.toLocalDateStr(targetDate);

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim';
		modal.style.zIndex = '1000';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => modal.remove();
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal';
		modalContent.style.width = '400px';

		// Title
		const title = document.createElement('div');
		title.className = 'modal-title';
		title.textContent = `Legg til oppføring for ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content';
		content.style.padding = '20px';

		// Type selector
		const typeLabel = document.createElement('div');
		typeLabel.textContent = 'Type:';
		typeLabel.style.fontWeight = 'bold';
		typeLabel.style.marginBottom = '5px';
		content.appendChild(typeLabel);

		const typeSelect = document.createElement('select');
		typeSelect.style.width = '100%';
		typeSelect.style.marginBottom = '15px';
		typeSelect.style.padding = '8px';
		this.settings.specialDayBehaviors.forEach(behavior => {
			const option = document.createElement('option');
			option.value = behavior.id;
			option.textContent = `${behavior.icon} ${translateSpecialDayName(behavior.id, behavior.label)}`;
			typeSelect.appendChild(option);
		});
		content.appendChild(typeSelect);

		// Start time
		const startLabel = document.createElement('div');
		startLabel.textContent = `${t('modals.startTime')}:`;
		startLabel.style.fontWeight = 'bold';
		startLabel.style.marginBottom = '5px';
		content.appendChild(startLabel);

		const startInput = document.createElement('input');
		startInput.type = 'time';
		startInput.value = '08:00';
		startInput.style.width = '100%';
		startInput.style.marginBottom = '15px';
		startInput.style.padding = '8px';
		content.appendChild(startInput);

		// End time
		const endLabel = document.createElement('div');
		endLabel.textContent = `${t('modals.endTime')}:`;
		endLabel.style.fontWeight = 'bold';
		endLabel.style.marginBottom = '5px';
		content.appendChild(endLabel);

		const endInput = document.createElement('input');
		endInput.type = 'time';
		endInput.value = '16:00';
		endInput.style.width = '100%';
		endInput.style.marginBottom = '20px';
		endInput.style.padding = '8px';
		content.appendChild(endInput);

		// Buttons
		const buttonContainer = document.createElement('div');
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.justifyContent = 'flex-end';

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => modal.remove();
		buttonContainer.appendChild(cancelBtn);

		const saveBtn = document.createElement('button');
		saveBtn.className = 'mod-cta';
		saveBtn.textContent = t('buttons.save');
		saveBtn.onclick = async () => {
			const [startHours, startMinutes] = startInput.value.split(':').map(Number);
			const [endHours, endMinutes] = endInput.value.split(':').map(Number);

			const startDate = new Date(targetDate);
			startDate.setHours(startHours, startMinutes, 0, 0);

			const endDate = new Date(targetDate);
			endDate.setHours(endHours, endMinutes, 0, 0);

			if (endDate <= startDate) {
				new Notice(t('validation.endAfterStart'));
				return;
			}

			// Add new entry
			this.timerManager.data.entries.push({
				name: typeSelect.value,
				startTime: startDate.toISOString(),
				endTime: endDate.toISOString(),
				subEntries: null
			});

			await this.timerManager.save();
			modal.remove();

			const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
			new Notice(`✅ Lagt til ${duration.toFixed(1)} timer for ${dateStr}`);

			await this.plugin.timerManager.onTimerChange?.();
		};
		buttonContainer.appendChild(saveBtn);
		content.appendChild(buttonContainer);

		modalContent.appendChild(content);
		modal.appendChild(modalContent);
		document.body.appendChild(modal);
	}

	renderWeeklyView(container: HTMLElement, years: Record<string, any>): void {
		container.empty();
		const div = container.createDiv();
		div.style.padding = '20px';
		div.style.textAlign = 'center';
		div.textContent = 'Weekly view - Coming soon';
	}

	renderHeatmapView(container: HTMLElement, years: Record<string, any>): void {
		const heatmap = document.createElement('div');
		heatmap.className = 'tf-heatmap';
		heatmap.style.gridTemplateColumns = `repeat(${this.settings.heatmapColumns}, 1fr)`;

		const today = new Date();
		const daysToShow = this.settings.heatmapColumns * 8; // ~1 year

		for (let i = daysToShow; i >= 0; i--) {
			const date = new Date(today);
			date.setDate(today.getDate() - i);
			const dateKey = Utils.toLocalDateStr(date);

			const cell = document.createElement('div');
			cell.className = 'tf-heatmap-cell';
			cell.title = dateKey;

			const dayEntries = this.data.daily[dateKey];
			if (dayEntries) {
				// Simple tracking mode - use neutral color for worked days
				if (!this.settings.enableGoalTracking) {
					cell.style.background = 'var(--background-secondary)';
				} else {
					// Goal-based mode - show flextime color gradient
					const dayFlextime = dayEntries.reduce((sum, e) => sum + (e.flextime || 0), 0);
					cell.style.background = this.flextimeColor(dayFlextime);
				}
			} else {
				cell.style.background = 'var(--background-modifier-border)';
			}

			heatmap.appendChild(cell);
		}

		container.appendChild(heatmap);
	}

	exportCurrentView(): void {
		const rows: string[][] = [['Date', 'Type', 'Hours', 'Flextime']];

		Object.keys(this.data.daily).sort().forEach(dateKey => {
			this.data.daily[dateKey].forEach(entry => {
				rows.push([
					dateKey,
					entry.name,
					(entry.duration || 0).toFixed(2),
					(entry.flextime || 0).toFixed(2)
				]);
			});
		});

		const csv = rows.map(row => row.join(',')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `timeflow-export-${Utils.toLocalDateStr(new Date())}.csv`;
		a.click();
		URL.revokeObjectURL(url);

		new Notice('Exported to CSV');
	}

	startUpdates(): void {
		// Update clock every second
		const clockInterval = window.setInterval(() => {
			this.updateClock();
		}, this.settings.clockInterval);
		this.intervals.push(clockInterval);

		// Update data every 30 seconds
		const dataInterval = window.setInterval(() => {
			this.updateAll();
		}, this.settings.updateInterval);
		this.intervals.push(dataInterval);
	}

	updateAll(): void {
		this.updateBadge();
		this.updateTimerBadge();
		this.updateDayCard();
		this.updateWeekCard();
		this.updateStatsCard();
	}

	showDeleteConfirmation(entry: any, dateObj: Date, onConfirm: () => void): void {
		// Create overlay
		const overlay = document.createElement('div');
		overlay.className = 'tf-confirm-overlay';

		// Create dialog
		const dialog = document.createElement('div');
		dialog.className = 'tf-confirm-dialog';

		// Title
		const title = document.createElement('div');
		title.className = 'tf-confirm-title';
		title.textContent = '🗑️ Slett oppføring';
		dialog.appendChild(title);

		// Message
		const message = document.createElement('div');
		message.className = 'tf-confirm-message';
		message.textContent = 'Er du sikker på at du vil slette denne oppføringen?';
		dialog.appendChild(message);

		// Entry details
		const details = document.createElement('div');
		details.className = 'tf-confirm-details';

		const startDate = new Date(entry.startTime);
		const endDate = entry.endTime ? new Date(entry.endTime) : null;
		const duration = endDate
			? ((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)).toFixed(2)
			: t('ui.ongoing');

		// Build details using DOM API
		const dateRow = details.createDiv();
		dateRow.createEl('strong', { text: t('ui.date') + ':' });
		dateRow.appendText(' ' + Utils.toLocalDateStr(dateObj));

		const typeRow = details.createDiv();
		typeRow.createEl('strong', { text: t('ui.type') + ':' });
		typeRow.appendText(' ' + translateSpecialDayName(entry.name.toLowerCase(), entry.name));

		const startRow = details.createDiv();
		startRow.createEl('strong', { text: t('ui.start') + ':' });
		startRow.appendText(' ' + formatTime(startDate));

		if (endDate) {
			const endRow = details.createDiv();
			endRow.createEl('strong', { text: t('ui.end') + ':' });
			endRow.appendText(' ' + formatTime(endDate));
		}

		const durationRow = details.createDiv();
		durationRow.createEl('strong', { text: t('ui.duration') + ':' });
		durationRow.appendText(' ' + (typeof duration === 'string' ? duration : duration + ' ' + t('ui.hours').toLowerCase()));
		dialog.appendChild(details);

		// Buttons
		const buttons = document.createElement('div');
		buttons.className = 'tf-confirm-buttons';

		const cancelBtn = document.createElement('button');
		cancelBtn.className = 'tf-confirm-cancel';
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => overlay.remove();
		buttons.appendChild(cancelBtn);

		const deleteBtn = document.createElement('button');
		deleteBtn.className = 'tf-confirm-delete';
		deleteBtn.textContent = 'Slett';
		deleteBtn.onclick = () => {
			overlay.remove();
			onConfirm();
		};
		buttons.appendChild(deleteBtn);

		dialog.appendChild(buttons);
		overlay.appendChild(dialog);

		// Close on overlay click
		overlay.onclick = (e) => {
			if (e.target === overlay) {
				overlay.remove();
			}
		};

		document.body.appendChild(overlay);
	}

	cleanup(): void {
		this.intervals.forEach(interval => clearInterval(interval));
		this.intervals = [];
	}

	build(): HTMLElement {
		this.injectStyles();

		this.container.appendChild(this.buildBadgeSection());

		// Create wrapper for responsive layout (summary cards + stats card)
		const mainCardsWrapper = document.createElement('div');
		mainCardsWrapper.className = 'tf-main-cards-wrapper';

		// Add day, week, and month cards
		mainCardsWrapper.appendChild(this.createDayCard());
		mainCardsWrapper.appendChild(this.createWeekCard());
		mainCardsWrapper.appendChild(this.createMonthCard());

		// Add stats card to the same wrapper for responsive layout
		mainCardsWrapper.appendChild(this.createStatsCard());

		this.container.appendChild(mainCardsWrapper);
		this.container.appendChild(this.buildInfoCard());
		this.container.appendChild(this.buildHistoryCard());
		this.container.appendChild(this.buildStatusBar());
		this.container.appendChild(this.buildViewToggle());

		return this.container;
	}
}
