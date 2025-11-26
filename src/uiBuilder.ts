import { App, TFile, Notice } from 'obsidian';
import { DataManager } from './dataManager';
import { MessageGenerator } from './messageGenerator';
import { TimeFlowSettings } from './settings';
import { TimerManager } from './timerManager';
import { Utils, getSpecialDayColors } from './utils';

export class UIBuilder {
	data: DataManager;
	container: HTMLElement;
	intervals: number[] = [];
	today: Date;
	statsTimeframe: string = "total";
	historyView: string = "list";
	currentMonthOffset: number = 0;
	systemStatus: any;
	settings: TimeFlowSettings;
	app: App;
	timerManager: TimerManager;
	elements: {
		badge: HTMLElement | null;
		timerBadge: HTMLButtonElement | null;
		clock: HTMLElement | null;
		dayCard: HTMLElement | null;
		weekCard: HTMLElement | null;
		statsCard: HTMLElement | null;
		monthCard: HTMLElement | null;
	};

	constructor(dataManager: DataManager, systemStatus: any, settings: TimeFlowSettings, app: App, timerManager: TimerManager) {
		this.data = dataManager;
		this.systemStatus = systemStatus;
		this.settings = settings;
		this.app = app;
		this.timerManager = timerManager;
		this.container = this.createContainer();
		this.today = new Date();
		this.elements = {
			badge: null,
			timerBadge: null,
			clock: null,
			dayCard: null,
			weekCard: null,
			statsCard: null,
			monthCard: null,
		};
	}

	createContainer(): HTMLElement {
		const container = document.createElement("div");
		container.style.fontFamily = "sans-serif";
		container.style.maxWidth = "1200px";
		container.style.margin = "0 auto";
		container.style.padding = "20px";
		// Apply theme class
		container.className = `timeflow-theme-${this.settings.theme}`;
		return container;
	}

	injectStyles(): void {
		const styleId = 'timeflow-styles';
		if (document.getElementById(styleId)) return;

		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = `
			/* TimeFlow Dashboard Styles */
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
				margin: 16px 0;
				flex-wrap: wrap;
				gap: 12px;
			}

			/* Desktop: timer button on top right */
			@media (min-width: 601px) {
				.tf-badge-section {
					justify-content: space-between;
				}
				.tf-timer-badge {
					order: 3;
					margin-left: auto;
				}
				.tf-badge {
					order: 1;
				}
				.tf-clock {
					order: 2;
				}
			}

			@media (max-width: 600px) {
				.tf-badge-section {
					flex-direction: column;
					align-items: stretch;
				}
				.tf-badge-section > * {
					width: 100% !important;
					max-width: 100% !important;
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
				background: linear-gradient(135deg, #f0f4c3, #e1f5fe);
				color: #1a1a1a;
				font-weight: bold;
				font-variant-numeric: tabular-nums;
				box-shadow: 0 2px 8px rgba(0,0,0,0.1);
			}

			/* Dark theme - Clock badge uses consistent dark gradient */
			.timeflow-theme-dark .tf-clock {
				background: linear-gradient(135deg, #2d3a2d, #2d3d45);
				color: #e0e0e0;
			}

			/* System theme - Clock badge adapts to Obsidian theme */
			.timeflow-theme-system .tf-clock {
				background: var(--background-primary-alt);
				color: var(--text-normal);
				border: 1px solid var(--background-modifier-border);
			}

			.tf-timer-badge {
				padding: 10px 18px;
				border-radius: 12px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 8px;
				white-space: normal;
				text-align: center;
				min-height: 44px;
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

			.tf-summary-cards {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
				gap: 15px;
				margin-bottom: 20px;
			}

			/* Day and week cards stay side-by-side in row 1, calendar always below in row 2 */
			.tf-card-month {
				grid-column: 1 / -1; /* Calendar takes full width below */
			}

			/* On mobile, stack everything vertically */
			@media (max-width: 500px) {
				.tf-summary-cards {
					grid-template-columns: 1fr;
				}

				.tf-card-month {
					grid-column: 1;
				}
			}

			/* Default card styling - used for month card */
			.tf-card {
				padding: 20px;
				border-radius: 12px;
				background: linear-gradient(135deg, #f0f4c3, #e1f5fe);
				color: #1a1a1a;
				box-shadow: 0 4px 12px rgba(0,0,0,0.3);
			}

			.tf-card-spaced {
				margin-top: 24px;
			}

			.tf-card h3 {
				margin-top: 0;
				margin-bottom: 15px;
				font-size: 18px;
				color: #1a1a1a;
			}

			/* Daily and Weekly cards use dynamic backgrounds set in updateDayCard/updateWeekCard */
			.tf-card-day,
			.tf-card-week {
				/* Background and color set dynamically based on progress */
			}

			/* System theme - match Obsidian's theme */
			.timeflow-theme-system .tf-card {
				background: var(--background-primary-alt);
				color: var(--text-normal);
				border: 1px solid var(--background-modifier-border);
			}

			.timeflow-theme-system .tf-card h3 {
				color: var(--text-normal);
			}

			.timeflow-theme-system .tf-card-stats {
				background: var(--background-primary-alt) !important;
				color: var(--text-normal) !important;
			}

			.timeflow-theme-system .tf-card-stats h3 {
				color: var(--text-normal) !important;
			}

			.timeflow-theme-system .tf-card-history {
				background: var(--background-primary-alt) !important;
				color: var(--text-normal) !important;
			}

			.timeflow-theme-system .tf-card-history h3 {
				color: var(--text-normal) !important;
			}

			.timeflow-theme-system .tf-stat-item {
				background: var(--background-secondary);
				color: var(--text-normal);
			}

			.timeflow-theme-system .tf-stat-label {
				color: var(--text-muted);
			}

			.timeflow-theme-system .tf-stat-value {
				color: var(--text-normal);
			}

			/* System theme - ensure all text inside stat items is readable */
			.timeflow-theme-system .tf-stat-item div {
				color: var(--text-normal);
			}

			.timeflow-theme-system .tf-stat-item .tf-stat-label {
				color: var(--text-muted);
			}

			/* Dark theme - internally consistent with dark greens and blues */
			.timeflow-theme-dark .tf-card {
				background: linear-gradient(135deg, #2d3a2d, #2d3d45);
				color: #e0e0e0;
			}

			.timeflow-theme-dark .tf-card h3 {
				color: #e0e0e0;
			}

			.timeflow-theme-dark .tf-badge {
				/* Badge colors are set dynamically in updateBadge() */
			}

			/* Light theme - Progress bar */
			.tf-progress-bar {
				width: 100%;
				height: 12px;
				background: #ddd;
				border-radius: 6px;
				overflow: hidden;
				margin: 10px 0;
			}

			.timeflow-theme-dark .tf-progress-bar {
				background: rgba(255, 255, 255, 0.1);
			}

			/* Light theme - Progress fill uses green gradient from timeflow.js */
			.tf-progress-fill {
				height: 100%;
				background: linear-gradient(90deg, #4caf50, #2e7d32);
				transition: width 0.3s ease;
			}

			.timeflow-theme-dark .tf-progress-fill {
				background: linear-gradient(90deg, #4caf50, #2e7d32);
			}

			.tf-month-grid {
				display: grid;
				grid-template-columns: repeat(7, 1fr);
				gap: 12px;
				margin-top: 15px;
			}

			/* Day cells - consistent text colors across all themes since backgrounds are always the same */
			.tf-day-cell {
				aspect-ratio: 1;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 6px;
				font-size: clamp(12px, 2.5vw, 16px);
				font-weight: bold;
				cursor: pointer;
				transition: all 0.2s;
				position: relative;
				border: 2px solid transparent;
				text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
			}

			/* Days with entries - black text in all themes */
			.tf-day-cell.has-entry {
				color: #000000;
			}

			/* Days without entries - dark grey text in all themes */
			.tf-day-cell.no-entry {
				color: #4a4a4a;
			}

			.tf-day-cell:hover {
				transform: scale(1.05);
				box-shadow: 0 2px 8px rgba(0,0,0,0.2);
			}

			.tf-day-cell.today {
				border-color: #4caf50;
				font-weight: bold;
			}

			.timeflow-theme-system .tf-day-cell.today {
				border-color: var(--interactive-accent);
			}

			/* Light theme - Stats card uses green gradient from timeflow.js */
			.tf-card-stats {
				background: linear-gradient(135deg, #e8f5e9, #c8e6c9) !important;
				color: #1a1a1a !important;
			}

			.tf-card-stats h3 {
				color: #1a1a1a !important;
			}

			/* Dark theme - Stats card uses darker consistent greens */
			.timeflow-theme-dark .tf-card-stats {
				background: linear-gradient(135deg, #253d25, #2d4d3d) !important;
				color: #e0e0e0 !important;
			}

			.timeflow-theme-dark .tf-card-stats h3 {
				color: #e0e0e0 !important;
			}

			/* Light theme - History card uses darker green from timeflow.js */
			.tf-card-history {
				background: linear-gradient(135deg, #a8d5ab, #8dc491) !important;
				color: #1a1a1a !important;
			}

			.tf-card-history h3 {
				color: #1a1a1a !important;
			}

			/* Dark theme - History card uses consistent dark greens */
			.timeflow-theme-dark .tf-card-history {
				background: linear-gradient(135deg, #2d4528, #2d5035) !important;
				color: #e0e0e0 !important;
			}

			.timeflow-theme-dark .tf-card-history h3 {
				color: #e0e0e0 !important;
			}

			.tf-stats-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
				gap: 15px;
				margin-top: 15px;
			}

			/* Light theme - Stat items match timeflow.js */
			.tf-stat-item {
				padding: 15px;
				background: rgba(155, 155, 155, 0.4);
				border-radius: 8px;
				color: #1a1a1a;
			}

			/* Dark theme - Stat items use semi-transparent white for consistency */
			.timeflow-theme-dark .tf-stat-item {
				background: rgba(255, 255, 255, 0.1);
				color: #e0e0e0;
			}

			.tf-stat-label {
				font-size: 12px;
				margin-bottom: 5px;
			}

			/* Light theme - stat labels should be dark but slightly muted */
			.tf-card-stats .tf-stat-label {
				color: rgba(26, 26, 26, 0.7);
			}

			/* Dark theme - stat labels should be light but slightly muted */
			.timeflow-theme-dark .tf-card-stats .tf-stat-label {
				color: rgba(224, 224, 224, 0.7);
			}

			.tf-stat-value {
				font-size: 20px;
				font-weight: bold;
			}

			/* Light theme - stat values should be dark */
			.tf-card-stats .tf-stat-value {
				color: #1a1a1a;
			}

			/* Dark theme - stat values should be light */
			.timeflow-theme-dark .tf-card-stats .tf-stat-value {
				color: #e0e0e0;
			}

			/* Timeframe label styling */
			.tf-timeframe-label {
				color: #1a1a1a;
			}

			.timeflow-theme-dark .tf-timeframe-label {
				color: #e0e0e0;
			}

			.timeflow-theme-system .tf-timeframe-label {
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
				background: rgba(0, 0, 0, 0.1);
				color: #1a1a1a !important;
				font-size: 0.9em;
				border-radius: 6px;
				transition: all 0.2s;
				font-weight: 500;
			}

			.tf-tab.active {
				background: rgba(0, 0, 0, 0.2);
				color: #1a1a1a !important;
				font-weight: bold;
			}

			.tf-tab:hover {
				background: rgba(0, 0, 0, 0.15);
				color: #1a1a1a !important;
			}

			.timeflow-theme-dark .tf-tab {
				background: rgba(255, 255, 255, 0.1);
				color: #e0e0e0 !important;
			}

			.timeflow-theme-dark .tf-tab.active {
				background: rgba(255, 255, 255, 0.2);
				color: #e0e0e0 !important;
			}

			.timeflow-theme-dark .tf-tab:hover {
				background: rgba(255, 255, 255, 0.15);
				color: #e0e0e0 !important;
			}

			.timeflow-theme-system .tf-tab {
				background: var(--background-modifier-border);
				color: var(--text-normal) !important;
			}

			.timeflow-theme-system .tf-tab.active {
				background: var(--interactive-accent);
				color: var(--text-on-accent) !important;
			}

			.timeflow-theme-system .tf-tab:hover {
				background: var(--background-modifier-hover);
				color: var(--text-normal) !important;
			}

			.tf-button {
				padding: 8px 16px;
				border-radius: 6px;
				border: 1px solid var(--background-modifier-border);
				background: var(--interactive-normal);
				color: var(--text-normal);
				cursor: pointer;
				font-size: 14px;
				transition: all 0.2s;
			}

			.tf-button:hover {
				background: var(--interactive-hover);
			}

			.tf-heatmap {
				display: grid;
				gap: 4px;
				margin-top: 15px;
			}

			.tf-heatmap-cell {
				width: 100%;
				aspect-ratio: 1;
				border-radius: 3px;
				cursor: pointer;
				transition: transform 0.2s;
			}

			.tf-heatmap-cell:hover {
				transform: scale(1.2);
			}

			/* Context menu - uses same styling as submenu for consistency */
			/* Context menu - uses Obsidian native styling for all themes */
			.tf-context-menu {
				position: absolute;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 8px;
				box-shadow: 0 4px 12px rgba(0,0,0,0.3);
				padding: 4px;
				z-index: 1000;
				min-width: 200px;
				display: flex;
				gap: 0;
			}

			.tf-context-menu-main {
				flex: 0 0 auto;
				min-width: 200px;
			}

			.tf-context-menu-info {
				flex: 0 0 auto;
				width: 250px;
				padding: 12px;
				border-left: 1px solid var(--background-modifier-border);
				background: var(--background-secondary);
				font-size: 0.85em;
				line-height: 1.4;
			}

			.timeflow-theme-dark .tf-context-menu-info {
				background: rgba(0, 0, 0, 0.2);
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

			.tf-menu-item {
				padding: 8px 16px;
				cursor: pointer;
				transition: background 0.2s;
				display: flex;
				align-items: center;
				gap: 10px;
				color: #1a1a1a;
			}

			.timeflow-theme-dark .tf-menu-item {
				color: #e0e0e0;
			}

			.timeflow-theme-system .tf-menu-item {
				color: var(--text-normal);
			}

			.tf-menu-item:hover {
				background: rgba(76, 175, 80, 0.2);
			}

			.timeflow-theme-system .tf-menu-item:hover {
				background: var(--background-modifier-hover);
			}

			.tf-menu-separator {
				height: 1px;
				background: rgba(0, 0, 0, 0.2);
				margin: 4px 0;
			}

			.timeflow-theme-dark .tf-menu-separator {
				background: rgba(255, 255, 255, 0.2);
			}

			.timeflow-theme-system .tf-menu-separator {
				background: var(--background-modifier-border);
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
				background: linear-gradient(135deg, #f0f4c3, #e1f5fe);
				border: 2px solid #4caf50;
				border-radius: 8px;
				box-shadow: 0 4px 12px rgba(0,0,0,0.3);
				padding: 4px;
				min-width: 180px;
				z-index: 1001;
			}

			.timeflow-theme-dark .tf-submenu {
				background: linear-gradient(135deg, #2d3a2d, #2d3d45);
				border: 2px solid #4caf50;
			}

			.timeflow-theme-system .tf-submenu {
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
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
				max-height: 1000px;
			}

			@media (max-width: 768px) {
				.tf-stats-grid {
					grid-template-columns: 1fr;
				}

				.tf-month-grid {
					gap: 4px;
				}
			}
		`;
		document.head.appendChild(style);
	}

	buildBadgeSection(): HTMLElement {
		const section = document.createElement("div");
		section.className = "tf-badge-section";

		const badge = document.createElement("div");
		badge.className = "tf-badge";
		this.elements.badge = badge;

		// Timer control badge
		const timerBadge = document.createElement("button");
		timerBadge.className = "tf-timer-badge";
		this.elements.timerBadge = timerBadge;

		const clock = document.createElement("div");
		clock.className = "tf-clock";
		this.elements.clock = clock;

		section.appendChild(badge);
		section.appendChild(timerBadge);
		section.appendChild(clock);

		this.updateBadge();
		this.updateTimerBadge();
		this.updateClock();

		return section;
	}

	updateTimerBadge(): void {
		if (!this.elements.timerBadge) return;

		const activeTimers = this.timerManager.getActiveTimers();

		if (activeTimers.length === 0) {
			// Start button badge
			this.elements.timerBadge.textContent = "Start";
			this.elements.timerBadge.style.background = "linear-gradient(90deg, #4caf50, #2e7d32)";
			this.elements.timerBadge.style.color = "white";
			this.elements.timerBadge.onclick = async () => {
				await this.timerManager.startTimer('jobb');
				this.updateTimerBadge();
			};
		} else {
			// Stop button badge (active timer)
			this.elements.timerBadge.textContent = "Stopp";
			this.elements.timerBadge.style.background = "linear-gradient(90deg, #f44336, #c62828)";
			this.elements.timerBadge.style.color = "white";
			this.elements.timerBadge.onclick = async () => {
				// Stop all active timers
				for (const timer of activeTimers) {
					await this.timerManager.stopTimer(timer);
				}
				this.updateTimerBadge();
			};
		}
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

		const title = document.createElement("h3");
		title.textContent = "Månedskalender";
		title.style.margin = "0";

		const controls = document.createElement("div");
		controls.style.display = "flex";
		controls.style.gap = "5px";

		const prevBtn = document.createElement("button");
		prevBtn.textContent = "←";
		prevBtn.className = "tf-button";
		prevBtn.onclick = () => {
			this.currentMonthOffset--;
			this.updateMonthCard();
		};

		const todayBtn = document.createElement("button");
		todayBtn.textContent = "I dag";
		todayBtn.className = "tf-button";
		todayBtn.onclick = () => {
			this.currentMonthOffset = 0;
			this.updateMonthCard();
		};

		const nextBtn = document.createElement("button");
		nextBtn.textContent = "→";
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

		this.updateMonthCard();

		return card;
	}

	createStatsCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card tf-card-stats tf-card-spaced";

		// Header with title and tabs
		const headerRow = document.createElement("div");
		headerRow.style.display = "flex";
		headerRow.style.justifyContent = "space-between";
		headerRow.style.alignItems = "center";
		headerRow.style.marginBottom = "15px";
		headerRow.style.flexWrap = "wrap";
		headerRow.style.gap = "10px";

		const header = document.createElement("h3");
		header.textContent = "Statistikk";
		header.style.margin = "0";
		headerRow.appendChild(header);

		const tabs = document.createElement("div");
		tabs.className = "tf-tabs";
		tabs.style.marginBottom = "0";
		tabs.style.borderBottom = "none";

		const timeframes = ["total", "year", "month"];
		const labels = { total: "Totalt", year: "År", month: "Måned" };

		timeframes.forEach(tf => {
			const tab = document.createElement("button");
			tab.className = `tf-tab ${tf === this.statsTimeframe ? 'active' : ''}`;
			tab.textContent = labels[tf as keyof typeof labels];
			tab.onclick = () => {
				this.statsTimeframe = tf;
				this.updateStatsCard();
			};
			tabs.appendChild(tab);
		});

		headerRow.appendChild(tabs);
		card.appendChild(headerRow);

		// Timeframe label container
		const timeframeLabel = document.createElement("div");
		timeframeLabel.className = "tf-timeframe-label";
		timeframeLabel.style.marginBottom = "15px";
		timeframeLabel.style.fontSize = "1.1em";
		timeframeLabel.style.fontWeight = "bold";
		card.appendChild(timeframeLabel);

		const statsContainer = document.createElement("div");
		statsContainer.className = "tf-stats-grid";
		this.elements.statsCard = statsContainer;
		card.appendChild(statsContainer);

		this.updateStatsCard();

		return card;
	}

	buildInfoCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card tf-card-spaced";

		const header = document.createElement("div");
		header.className = "tf-collapsible";
		header.innerHTML = "<h3 style='margin:0'>Informasjon</h3>";

		const content = document.createElement("div");
		content.className = "tf-collapsible-content";

		// Special day types with explanations
		const specialDayInfo = [
			{ key: "avspasering", emoji: "🛌", desc: "Trekkes fra fleksitid" },
			{ key: "egenmelding", emoji: "🤒", desc: "Påvirker ikke fleksitid" },
			{ key: "ferie", emoji: "🏖️", desc: "Påvirker ikke fleksitid" },
			{ key: "velferdspermisjon", emoji: "🏥", desc: "Påvirker ikke fleksitid" },
			{ key: "studie", emoji: "📖", desc: "Teller som fleksitid ved mer enn 7,5t" },
			{ key: "kurs", emoji: "📚", desc: "Teller som fleksitid ved mer enn 7,5t" },
			{ key: "helligdag", emoji: "🎉", desc: "Offentlig fridag - påvirker ikke fleksitid" },
			{ key: "halfday", emoji: "⏰", desc: "Halv arbeidsdag (4t) - reduserer ukemålet med 4t" },
			{ key: "Ingen registrering", emoji: "⚪", desc: "Ingen data for den dagen" }
		];

		content.innerHTML = `
			<div style="margin-top: 15px;">
				<h4>Spesielle dagtyper</h4>
				<ul style="list-style: none; padding-left: 0; margin-bottom: 20px;">
					${specialDayInfo.map(item => {
						const color = getSpecialDayColors(this.settings)[item.key] || "transparent";
						const label = this.settings.specialDayLabels[item.key as keyof typeof this.settings.specialDayLabels] || item.key;
						return `<li style="display: flex; align-items: center; margin-bottom: 8px; font-size: 0.95em;">
							<div style="width: 16px; height: 16px; background: ${color}; border-radius: 3px; border: 1px solid var(--background-modifier-border); margin-right: 8px; flex-shrink: 0;"></div>
							<span>${item.emoji} <strong>${label}</strong>: ${item.desc}</span>
						</li>`;
					}).join('')}
				</ul>

				<div style="margin-top: 20px; padding: 12px; background: var(--background-primary); border-radius: 8px;">
					<h4 style="margin-top: 0;">Kalenderkontekstmeny</h4>
					<p style="margin: 8px 0; font-size: 0.9em;">
						Høyreklikk på en dag i kalenderen for å få opp en meny med flere alternativer:
					</p>
					<ul style="margin: 8px 0 0 20px; font-size: 0.9em;">
						<li>Opprett daglig notat for valgt dag</li>
						<li>Opprett møtenotat, prosjektnotat eller refleksjonsnotat</li>
						<li>Rediger fleksitid for dagen manuelt</li>
						<li>Registrer spesielle dagtyper (ferie, kurs, avspasering, etc.)</li>
					</ul>
				</div>

				<div style="margin-top: 20px; padding: 12px; background: var(--background-primary); border-radius: 8px;">
					<h4 style="margin-top: 0;">Timesaldo - advarselsoner</h4>
					<div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.9em;">
						<div style="display: flex; align-items: center; gap: 8px;">
							<span style="display: inline-block; width: 20px; height: 20px; border-radius: 4px; background: #4caf50; flex-shrink: 0;"></span>
							<span><strong>Grønn sone:</strong> 0t til +80t (trygg)</span>
						</div>
						<div style="display: flex; align-items: center; gap: 8px;">
							<span style="display: inline-block; width: 20px; height: 20px; border-radius: 4px; background: #ff9800; flex-shrink: 0;"></span>
							<span><strong>Gul sone:</strong> -15t til -1t ELLER +80t til +95t (forsiktig)</span>
						</div>
						<div style="display: flex; align-items: center; gap: 8px;">
							<span style="display: inline-block; width: 20px; height: 20px; border-radius: 4px; background: #f44336; flex-shrink: 0;"></span>
							<span><strong>Rød sone:</strong> Under -15t ELLER over +95t (kritisk)</span>
						</div>
					</div>
					<div style="margin-top: 10px; font-size: 0.85em; opacity: 0.8;">
						<em>Grenser: -20t til +100t</em>
					</div>
				</div>

				<div style="margin-top: 20px;">
					<h4>Arbeidsdager - fargegradient</h4>
					<p style="margin: 8px 0; font-size: 0.9em;">
						Arbeidsdager vises med farge basert på hvor mye du jobbet i forhold til dagens mål (${this.settings.baseWorkday}t):
					</p>
					<div style="margin-top: 10px;">
						<div style="height: 16px; border-radius: 8px; background: linear-gradient(to right, rgb(0,200,100), rgb(255,255,0), rgb(255,0,0)); margin: 4px 0; border: 1px solid var(--background-modifier-border);"></div>
						<div style="display: flex; justify-content: space-between; font-size: 0.85em; color: var(--text-muted); margin-bottom: 12px;">
							<span>0t over mål</span><span>+1,5t</span><span>+3t eller mer</span>
						</div>
						<div style="height: 16px; border-radius: 8px; background: linear-gradient(to right, rgb(100,150,255), rgb(150,200,255), rgb(200,220,255)); margin: 4px 0; border: 1px solid var(--background-modifier-border);"></div>
						<div style="display: flex; justify-content: space-between; font-size: 0.85em; color: var(--text-muted);">
							<span>-3t eller mindre</span><span>-1,5t</span><span>0t fra mål</span>
						</div>
					</div>
				</div>
			</div>
		`;

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

		// Header with title and view tabs (matching stats card layout)
		const headerRow = document.createElement("div");
		headerRow.style.display = "flex";
		headerRow.style.justifyContent = "space-between";
		headerRow.style.alignItems = "center";
		headerRow.style.marginBottom = "15px";
		headerRow.style.flexWrap = "wrap";
		headerRow.style.gap = "10px";

		const title = document.createElement("h3");
		title.textContent = "Historikk";
		title.style.margin = "0";
		headerRow.appendChild(title);

		// Create details element first (needed by tab onclick handlers)
		const detailsElement = document.createElement("div");
		detailsElement.style.maxHeight = "500px";
		detailsElement.style.overflow = "auto";

		// View tabs (matching stats card style)
		const tabs = document.createElement("div");
		tabs.className = "tf-tabs";
		tabs.style.marginBottom = "0";
		tabs.style.borderBottom = "none";

		const views = [
			{ id: "list", label: "Liste" },
			{ id: "heatmap", label: "Heatmap" }
		];

		views.forEach(view => {
			const tab = document.createElement("button");
			tab.textContent = view.label;
			tab.className = `tf-tab ${this.historyView === view.id ? 'active' : ''}`;
			tab.onclick = () => {
				this.historyView = view.id;
				// Update active state
				tabs.querySelectorAll('.tf-tab').forEach(t => t.classList.remove('active'));
				tab.classList.add('active');
				this.refreshHistoryView(detailsElement);
			};
			tabs.appendChild(tab);
		});

		headerRow.appendChild(tabs);
		card.appendChild(headerRow);
		card.appendChild(detailsElement);

		this.refreshHistoryView(detailsElement);

		return card;
	}

	buildStatusBar(): HTMLElement {
		const bar = document.createElement("div");
		bar.className = "tf-status-bar";

		const status = this.systemStatus;
		const statusIcon = status.validation?.hasErrors ? "❌" :
						   status.validation?.hasWarnings ? "⚠️" : "✅";

		bar.innerHTML = `
			<div style="display: flex; align-items: center; gap: 10px;">
				<span>${statusIcon}</span>
				<div>
					<div><strong>System Status</strong></div>
					<div style="font-size: 12px; color: var(--text-muted);">
						${status.holiday?.message || 'Holiday data not loaded'} •
						${status.activeTimers || 0} active timer(s) •
						${status.validation?.issues?.stats?.totalEntries || 0} entries checked
					</div>
				</div>
			</div>
		`;

		return bar;
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

		let color = "#4caf50"; // green
		if (balance < -15 || balance > 95) {
			color = "#f44336"; // red
		} else if (balance < 0 || balance > 80) {
			color = "#ff9800"; // yellow
		}

		this.elements.badge.style.background = color;
		this.elements.badge.style.color = "white";
		this.elements.badge.textContent = `Timesaldo: ${sign}${formatted}`;
	}

	updateDayCard(): void {
		if (!this.elements.dayCard) return;

		const today = new Date();
		const todayKey = Utils.toLocalDateStr(today);
		const todayHours = this.data.getTodayHours(today);
		const goal = this.data.getDailyGoal(todayKey);
		const isWeekendDay = Utils.isWeekend(today, this.settings);
		const context = this.data.getContextualData(today);
		const { avgDaily } = this.data.getAverages();

		const specials: string[] = [];
		const holidayInfo = this.data.getHolidayInfo(todayKey);
		if (holidayInfo) {
			specials.push(holidayInfo.type);
		}

		const message = MessageGenerator.getDailyMessage(
			todayHours,
			goal,
			specials,
			isWeekendDay,
			avgDaily,
			context,
			this.settings.consecutiveFlextimeWarningDays
		);

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

		this.elements.dayCard.innerHTML = `
			<h3 style="color: ${textColor};">I dag</h3>
			<div style="font-size: 32px; font-weight: bold; margin: 10px 0;">
				${Utils.formatHoursToHM(todayHours, this.settings.hourUnit)}
			</div>
			<div style="font-size: 14px; opacity: 0.9; margin-bottom: 10px;">
				Mål: ${Utils.formatHoursToHM(goal, this.settings.hourUnit)}
			</div>
			<div class="tf-progress-bar">
				<div class="tf-progress-fill" style="width: ${progress}%"></div>
			</div>
			<div style="margin-top: 10px; font-size: 14px;">
				${message}
			</div>
		`;
	}

	updateWeekCard(): void {
		if (!this.elements.weekCard) return;

		const today = new Date();
		const weekHours = this.data.getCurrentWeekHours(today);
		const baseGoal = this.settings.baseWorkweek * this.settings.workPercent;
		const context = this.data.getContextualData(today);

		// Calculate adjusted goal based on special days this week
		const dayOfWeek = today.getDay();
		const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
		const firstDayOfWeek = new Date(today);
		firstDayOfWeek.setDate(today.getDate() - daysFromMonday);

		let adjustedGoal = 0;
		let specials: string[] = [];
		let weekendWorkHours = 0;

		for (let i = 0; i < 7; i++) {
			const d = new Date(firstDayOfWeek);
			d.setDate(firstDayOfWeek.getDate() + i);
			const dayKey = Utils.toLocalDateStr(d);
			const dayGoal = this.data.getDailyGoal(dayKey);
			adjustedGoal += dayGoal;

			const holidayInfo = this.data.getHolidayInfo(dayKey);
			if (holidayInfo) {
				specials.push(holidayInfo.type);
			}

			if (Utils.isWeekend(d, this.settings)) {
				const dayEntries = this.data.daily[dayKey] || [];
				weekendWorkHours += dayEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
			}
		}

		const message = MessageGenerator.getWeeklyMessage(
			weekHours,
			adjustedGoal,
			specials,
			today,
			context,
			weekendWorkHours
		);

		const progress = adjustedGoal > 0 ? Math.min((weekHours / adjustedGoal) * 100, 100) : 0;

		// Dynamic background color based on progress (matching timeflow.js)
		let bgColor: string;
		let textColor: string;
		if (weekHours <= adjustedGoal) {
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

		this.elements.weekCard.innerHTML = `
			<h3 style="color: ${textColor};">Denne uken</h3>
			<div style="font-size: 32px; font-weight: bold; margin: 10px 0;">
				${Utils.formatHoursToHM(weekHours, this.settings.hourUnit)}
			</div>
			<div style="font-size: 14px; opacity: 0.9; margin-bottom: 10px;">
				Mål: ${Utils.formatHoursToHM(adjustedGoal, this.settings.hourUnit)}
			</div>
			<div class="tf-progress-bar">
				<div class="tf-progress-fill" style="width: ${progress}%"></div>
			</div>
			<div style="margin-top: 10px; font-size: 14px;">
				${message}
			</div>
		`;
	}

	updateStatsCard(): void {
		if (!this.elements.statsCard) return;

		const stats = this.data.getStatistics(this.statsTimeframe);
		const balance = this.data.getCurrentBalance();
		const { avgDaily, avgWeekly } = this.data.getAverages();
		const workloadPct = ((avgWeekly / this.settings.baseWorkweek) * 100).toFixed(0);

		// Timeframe label
		let timeframeLabel = "";
		const today = new Date();
		if (this.statsTimeframe === "year") {
			timeframeLabel = today.getFullYear().toString();
		} else if (this.statsTimeframe === "month") {
			const monthName = today.toLocaleString("nb-NO", { month: "long" });
			timeframeLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
		} else {
			timeframeLabel = "Totalt";
		}

		// Week comparison
		const context = this.data.getContextualData(today);
		let weekComparisonText = "";
		if (context.lastWeekHours > 0) {
			const currWeekHours = this.data.getCurrentWeekHours(today);
			const diff = currWeekHours - context.lastWeekHours;
			if (Math.abs(diff) > 2) {
				const arrow = diff > 0 ? "📈" : "📉";
				const sign = diff > 0 ? "+" : "";
				weekComparisonText = `<div style="font-size: 0.75em; margin-top: 4px;">vs forrige uke: ${sign}${diff.toFixed(1)}t ${arrow}</div>`;
			}
		}

		// Timesaldo color
		const sign = balance >= 0 ? '+' : '';
		let timesaldoColor = '#4caf50';
		if (balance < -15 || balance > 95) {
			timesaldoColor = '#f44336';
		} else if ((balance >= -15 && balance < 0) || (balance >= 80 && balance <= 95)) {
			timesaldoColor = '#ff9800';
		}

		// Ferie display
		let ferieDisplay = `${stats.ferie.count} dager`;
		if (this.statsTimeframe === "year" && stats.ferie.max > 0) {
			const feriePercent = ((stats.ferie.count / stats.ferie.max) * 100).toFixed(0);
			ferieDisplay = `${stats.ferie.count}/${stats.ferie.max} dager (${feriePercent}%)`;
		}

		// Egenmelding display
		let egenmeldingDisplay = `${stats.egenmelding.count} dager`;
		if (this.statsTimeframe === "year" && stats.egenmelding.max > 0) {
			const egenmeldingPercent = ((stats.egenmelding.count / stats.egenmelding.max) * 100).toFixed(0);
			egenmeldingDisplay = `${stats.egenmelding.count}/${stats.egenmelding.max} dager (${egenmeldingPercent}%)`;
		}

		// Update timeframe label
		const timeframeLabelElement = this.elements.statsCard.parentElement?.querySelector('.tf-timeframe-label');
		if (timeframeLabelElement) {
			timeframeLabelElement.textContent = timeframeLabel;
		}

		this.elements.statsCard.innerHTML = `
			<div class="tf-stat-item" style="background: ${timesaldoColor}; color: white;">
				<div class="tf-stat-label">Timesaldo</div>
				<div class="tf-stat-value">${sign}${balance.toFixed(1)}t</div>
				<div style="font-size: 0.75em; margin-top: 4px;">Total saldo</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">⏱️ Timer</div>
				<div class="tf-stat-value">${stats.totalHours.toFixed(1)}t</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">📊 Snitt/dag</div>
				<div class="tf-stat-value">${avgDaily.toFixed(1)}t</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">📅 Snitt/uke</div>
				<div class="tf-stat-value">${avgWeekly.toFixed(1)}t</div>
				${weekComparisonText}
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">💪 Arbeidsbelastning</div>
				<div class="tf-stat-value">${workloadPct}%</div>
				<div style="font-size: 0.75em; margin-top: 4px;">av norm</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">💼 Jobb</div>
				<div class="tf-stat-value">${stats.jobb.count} ${stats.jobb.count === 1 ? 'dag' : 'dager'}</div>
				<div style="font-size: 0.75em; margin-top: 4px;">${stats.jobb.hours.toFixed(1)}t</div>
			</div>
			${stats.weekendDays > 0 ? `<div class="tf-stat-item">
				<div class="tf-stat-label">🌙 Helgedager jobbet</div>
				<div class="tf-stat-value">${stats.weekendDays} ${stats.weekendDays === 1 ? 'dag' : 'dager'}</div>
				<div style="font-size: 0.75em; margin-top: 4px;">${stats.weekendHours.toFixed(1)}t</div>
			</div>` : ''}
			<div class="tf-stat-item">
				<div class="tf-stat-label">🛌 Avspasering</div>
				<div class="tf-stat-value">${stats.avspasering.count} ${stats.avspasering.count === 1 ? 'dag' : 'dager'}</div>
				<div style="font-size: 0.75em; margin-top: 4px;">${stats.avspasering.hours.toFixed(1)}t${stats.avspasering.planned > 0 ? `<br>📅 Planlagt: ${stats.avspasering.planned}` : ''}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">🏖️ Ferie</div>
				<div class="tf-stat-value" style="font-size: ${this.statsTimeframe === 'year' ? '0.9em' : '1.3em'};">${ferieDisplay}</div>
				<div style="font-size: 0.75em; margin-top: 4px;">${stats.ferie.planned > 0 ? `📅 Planlagt: ${stats.ferie.planned}` : ''}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">🏥 Velferdspermisjon</div>
				<div class="tf-stat-value">${stats.velferdspermisjon.count} ${stats.velferdspermisjon.count === 1 ? 'dag' : 'dager'}</div>
				<div style="font-size: 0.75em; margin-top: 4px;">${stats.velferdspermisjon.planned > 0 ? `📅 Planlagt: ${stats.velferdspermisjon.planned}` : ''}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">🤒 Egenmelding</div>
				<div class="tf-stat-value" style="font-size: ${this.statsTimeframe === 'year' ? '0.9em' : '1.3em'};">${egenmeldingDisplay}</div>
				<div style="font-size: 0.75em; margin-top: 4px;">${this.statsTimeframe === 'year' ? '(365d)' : ''}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">🏥 Sykemelding</div>
				<div class="tf-stat-value">${stats.sykemelding.count} ${stats.sykemelding.count === 1 ? 'dag' : 'dager'}</div>
				<div style="font-size: 0.75em; margin-top: 4px;">${stats.sykemelding.hours.toFixed(1)}t</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">📚 Studie</div>
				<div class="tf-stat-value">${stats.studie.count} ${stats.studie.count === 1 ? 'dag' : 'dager'}</div>
				<div style="font-size: 0.75em; margin-top: 4px;">${stats.studie.hours.toFixed(1)}t${stats.studie.planned > 0 ? `<br>📅 Planlagt: ${stats.studie.planned}` : ''}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">📚 Kurs</div>
				<div class="tf-stat-value">${stats.kurs.count} ${stats.kurs.count === 1 ? 'dag' : 'dager'}</div>
				<div style="font-size: 0.75em; margin-top: 4px;">${stats.kurs.hours.toFixed(1)}t${stats.kurs.planned > 0 ? `<br>📅 Planlagt: ${stats.kurs.planned}` : ''}</div>
			</div>
		`;

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
		this.elements.monthCard.innerHTML = '';
		this.elements.monthCard.appendChild(grid);
	}

	createMonthGrid(displayDate: Date): HTMLElement {
		const year = displayDate.getFullYear();
		const month = displayDate.getMonth();
		const monthName = displayDate.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });

		const container = document.createElement("div");

		const monthTitle = document.createElement("div");
		monthTitle.textContent = monthName;
		monthTitle.style.textAlign = "center";
		monthTitle.style.fontWeight = "bold";
		monthTitle.style.marginBottom = "10px";
		container.appendChild(monthTitle);

		const grid = document.createElement("div");
		grid.className = "tf-month-grid";

		// Add day headers
		const dayNames = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
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

		// Add empty cells for days before month starts
		for (let i = 0; i < firstDayOfWeek; i++) {
			const emptyCell = document.createElement("div");
			grid.appendChild(emptyCell);
		}

		// Add day cells
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const todayKey = Utils.toLocalDateStr(new Date());

		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(year, month, day);
			const dateKey = Utils.toLocalDateStr(date);
			const cell = document.createElement("div");
			cell.className = "tf-day-cell";
			cell.textContent = day.toString();

			// Determine background color
			const holidayInfo = this.data.getHolidayInfo(dateKey);
			const dayEntries = this.data.daily[dateKey];
			const specialDayColors = getSpecialDayColors(this.settings);

			// Check for special day entries in daily data
			const specialEntry = dayEntries?.find(e =>
				specialDayColors[e.name.toLowerCase()]
			);

			// Track if this day has any entries
			const hasEntry = !!(holidayInfo || specialEntry || dayEntries);

			if (holidayInfo) {
				// Holiday from holidays file
				const colorKey = holidayInfo.halfDay ? 'halfday' : holidayInfo.type;
				cell.style.background = specialDayColors[colorKey] || specialDayColors[holidayInfo.type] || "#eee";
			} else if (specialEntry) {
				// Special day from entries (ferie, studie, etc.)
				cell.style.background = specialDayColors[specialEntry.name.toLowerCase()];
			} else if (dayEntries) {
				// Regular work day - show flextime color
				const dayFlextime = dayEntries.reduce((sum, e) => sum + (e.flextime || 0), 0);
				cell.style.background = this.flextimeColor(dayFlextime);
			} else if (Utils.isWeekend(date, this.settings)) {
				// Darker gray for weekends with no data
				cell.style.background = "#b0b0b0";
			} else {
				// Check if date is in the past
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const cellDate = new Date(date);
				cellDate.setHours(0, 0, 0, 0);

				if (cellDate < today) {
					// Light gray for past empty weekdays
					cell.style.background = "#e0e0e0";
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
				// White text for future empty weekdays only
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const cellDate = new Date(date);
				cellDate.setHours(0, 0, 0, 0);

				if (!Utils.isWeekend(date, this.settings) && cellDate >= today) {
					cell.style.color = "#ffffff";
				}
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
		if (val < 0) {
			// Negative hours from goal: gradient from light blue to darker blue
			const t = Math.min(Math.abs(val) / 3, 1);
			const r = Math.floor(100 + 50 * t);
			const g = Math.floor(150 + 50 * t);
			const b = Math.floor(200 + 55 * t);
			return `rgb(${r},${g},${b})`;
		} else {
			// Positive hours over goal: gradient from green to yellow to red
			const t = Math.min(val / 3, 1);
			const r = Math.floor(255 * t);
			const g = Math.floor(200 * (1 - t));
			const b = 150;
			return `rgb(${r},${g},${b})`;
		}
	}

	showNoteTypeMenu(cellRect: DOMRect, dateObj: Date): void {
		// Remove existing menu
		const existingMenu = document.querySelector('.tf-context-menu');
		if (existingMenu) existingMenu.remove();

		const menu = document.createElement('div');
		menu.className = 'tf-context-menu';

		// Add theme class to menu
		const themeClass = `timeflow-theme-${this.settings.theme}`;
		menu.classList.add(themeClass);

		// Create main menu container
		const menuMain = document.createElement('div');
		menuMain.className = 'tf-context-menu-main';

		// Position menu, but check if it goes off-screen
		let menuLeft = cellRect.right;
		let menuTop = cellRect.top;

		// Append to body first to measure dimensions
		document.body.appendChild(menu);

		// Check if menu goes off the right edge of the window
		const menuWidth = 450; // Account for both menu and info panel
		if (menuLeft + menuWidth > window.innerWidth) {
			// Position to the left of the cell instead
			menuLeft = cellRect.left - menuWidth;
		}

		// Check if menu goes off the bottom edge of the window
		// Estimate menu height (will be adjusted after content is added)
		setTimeout(() => {
			const menuHeight = menu.offsetHeight;
			if (menuTop + menuHeight > window.innerHeight) {
				menu.style.top = `${Math.max(10, window.innerHeight - menuHeight - 10)}px`;
			}
		}, 0);

		menu.style.left = `${menuLeft}px`;
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
		workTimeItem.innerHTML = `<span>⏱️</span><span>Legg til arbeidstid</span>`;
		workTimeItem.onclick = () => {
			menu.remove();
			this.showWorkTimeModal(dateObj);
		};
		menuMain.appendChild(workTimeItem);

		// Add edit option if there are work entries for this day
		if (hasWorkEntries) {
			const editItem = document.createElement('div');
			editItem.className = 'tf-menu-item';
			editItem.innerHTML = `<span>✏️</span><span>Rediger arbeidstid</span>`;
			editItem.onclick = () => {
				menu.remove();
				this.showEditEntriesModal(dateObj);
			};
			menuMain.appendChild(editItem);
		}

		// Add special day registration right after edit (opens modal with type selection)
		const specialDayItem = document.createElement('div');
		specialDayItem.className = 'tf-menu-item';
		specialDayItem.innerHTML = `<span>📅</span><span>Registrer spesialdag</span>`;
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
			item.innerHTML = `<span>${noteType.icon}</span><span>${noteType.label}</span>`;
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

		// Build info content
		let infoHTML = `<h4>📅 ${dateStr}</h4>`;

		// Show planned day information if exists
		if (isPlannedDay && plannedInfo) {
			const emoji = Utils.getEmoji({ name: plannedInfo.type, date: dateObj });
			const halfDayText = plannedInfo.halfDay ? ' (halv dag)' : '';
			infoHTML += `<p><strong>${emoji} ${plannedInfo.description}${halfDayText}</strong></p>`;
		}

		// Show running timers first
		if (runningTimersForDate.length > 0) {
			infoHTML += '<p><strong>Pågående timer:</strong></p>';
			runningTimersForDate.forEach(timer => {
				const startTime = new Date(timer.startTime!);
				const startTimeStr = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
				const now = new Date();
				const elapsed = ((now.getTime() - startTime.getTime()) / (1000 * 60 * 60)).toFixed(1);
				infoHTML += `<p style="margin-left: 8px;">⏱️ ${timer.name}: ${startTimeStr} - Pågår (${elapsed}t)</p>`;
			});
		}

		// Show completed entries for this day (filter out running timers - those without duration)
		const completedEntries = allEntries.filter(e => e.duration && e.duration > 0);
		if (completedEntries.length > 0) {
			infoHTML += '<p><strong>Registreringer:</strong></p>';
			completedEntries.forEach(e => {
				const emoji = Utils.getEmoji(e);
				const duration = `${e.duration!.toFixed(1)}t`;
				infoHTML += `<p style="margin-left: 8px;">${emoji} ${e.name}: ${duration}</p>`;
			});

			// Add balance information for past days
			if (!isFutureDay) {
				const totalHours = allEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
				const dayGoal = this.data.getDailyGoal(dateStr);
				const dailyDelta = dayGoal === 0 ? totalHours : (totalHours - dayGoal);
				const runningBalance = this.data.getBalanceUpToDate(dateStr);

				infoHTML += `<p style="margin-top: 8px;"><strong>Mål:</strong> ${dayGoal.toFixed(1)}t</p>`;
				infoHTML += `<p><strong>Dagssaldo:</strong> ${dailyDelta >= 0 ? '+' : ''}${dailyDelta.toFixed(1)}t</p>`;
				infoHTML += `<p><strong>Løpende saldo:</strong> ${runningBalance >= 0 ? '+' : ''}${Utils.formatHoursToHM(runningBalance, this.settings.hourUnit)}</p>`;
			}
		} else if (isPastDay && !isPlannedDay && runningTimersForDate.length === 0) {
			infoHTML += '<p style="color: var(--text-muted);">Ingen registrering</p>';
		}

		// Add helpful tip
		infoHTML += '<p style="margin-top: 12px; font-size: 0.8em; color: var(--text-muted); border-top: 1px solid var(--background-modifier-border); padding-top: 8px;">💡 Velg et alternativ fra menyen til venstre</p>';

		menuInfo.innerHTML = infoHTML;
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
		title.textContent = `Legg til arbeidstid for ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content';
		content.style.padding = '20px';

		// Start time
		const startLabel = document.createElement('div');
		startLabel.textContent = 'Starttid (HH:MM):';
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
		endLabel.textContent = 'Sluttid (HH:MM):';
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
		cancelBtn.textContent = 'Avbryt';
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
				new Notice('❌ Sluttid må være etter starttid.');
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
		const allEntries = this.timerManager.data.entries;
		const workEntries = allEntries.filter(entry => {
			if (!entry.startTime || entry.name.toLowerCase() !== 'jobb') return false;
			const entryDate = new Date(entry.startTime);
			return Utils.toLocalDateStr(entryDate) === dateStr;
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
		title.textContent = `Rediger arbeidstid for ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content';
		content.style.padding = '20px';

		// List all entries with edit/delete options
		workEntries.forEach((entry, index) => {
			const entryDiv = document.createElement('div');
			entryDiv.style.padding = '15px';
			entryDiv.style.marginBottom = '10px';
			entryDiv.style.background = 'var(--background-secondary)';
			entryDiv.style.borderRadius = '8px';
			entryDiv.style.border = '1px solid var(--background-modifier-border)';

			const startDate = new Date(entry.startTime!);
			const endDate = entry.endTime ? new Date(entry.endTime) : null;

			const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
			const endTimeStr = endDate ? `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}` : 'Pågående';

			const duration = endDate ? ((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)).toFixed(1) : 'N/A';

			// Entry info
			const infoDiv = document.createElement('div');
			infoDiv.style.marginBottom = '10px';
			infoDiv.innerHTML = `
				<div style="font-weight: bold; margin-bottom: 5px;">Oppføring ${index + 1}</div>
				<div>⏰ ${startTimeStr} - ${endTimeStr}</div>
				<div>⏱️ ${duration} timer</div>
			`;
			entryDiv.appendChild(infoDiv);

			// Edit fields (initially hidden)
			const editDiv = document.createElement('div');
			editDiv.style.display = 'none';
			editDiv.style.marginTop = '10px';

			const startLabel = document.createElement('div');
			startLabel.textContent = 'Starttid:';
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
			endLabel.textContent = 'Sluttid:';
			endLabel.style.marginBottom = '5px';
			endLabel.style.fontWeight = 'bold';
			editDiv.appendChild(endLabel);

			const endInput = document.createElement('input');
			endInput.type = 'text';
			endInput.value = endTimeStr !== 'Pågående' ? endTimeStr : '';
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
			editBtn.textContent = '✏️ Rediger';
			editBtn.style.flex = '1';
			editBtn.onclick = () => {
				if (editDiv.style.display === 'none') {
					editDiv.style.display = 'block';
					editBtn.textContent = '💾 Lagre';
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
							new Notice('❌ Sluttid må være etter starttid.');
							return;
						}
					}

					// Update the entry
					entry.startTime = newStartDate.toISOString();
					entry.endTime = newEndDate ? newEndDate.toISOString() : null;

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
			deleteBtn.textContent = '🗑️ Slett';
			deleteBtn.style.flex = '1';
			deleteBtn.onclick = () => {
				// Find and remove the entry
				const entryIndex = this.timerManager.data.entries.indexOf(entry);
				if (entryIndex > -1) {
					this.timerManager.data.entries.splice(entryIndex, 1);
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
		closeBtn.textContent = 'Lukk';
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
		title.textContent = 'Registrer spesialdag';
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content';
		content.style.padding = '20px';

		// Date display
		const dateDisplay = document.createElement('div');
		dateDisplay.textContent = `Dato: ${dateStr}`;
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

		const dayTypes = [
			{ type: 'ferie', label: `🏖️ ${this.settings.specialDayLabels.ferie}` },
			{ type: 'avspasering', label: `🛌 ${this.settings.specialDayLabels.avspasering}` },
			{ type: 'velferdspermisjon', label: `🏥 ${this.settings.specialDayLabels.velferdspermisjon}` },
			{ type: 'egenmelding', label: `🤒 ${this.settings.specialDayLabels.egenmelding}` },
			{ type: 'sykemelding', label: `🏥 ${this.settings.specialDayLabels.sykemelding}` },
			{ type: 'kurs', label: `📚 ${this.settings.specialDayLabels.kurs}` },
			{ type: 'studie', label: `📖 ${this.settings.specialDayLabels.studie}` }
		];

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
		cancelBtn.textContent = 'Avbryt';
		cancelBtn.onclick = () => modal.remove();
		buttonDiv.appendChild(cancelBtn);

		const addBtn = document.createElement('button');
		addBtn.textContent = 'Legg til';
		addBtn.className = 'mod-cta';
		addBtn.onclick = async () => {
			const dayType = typeSelect.value;
			const note = noteInput.value.trim();
			await this.addSpecialDay(dateObj, dayType, note);
			modal.remove();
		};
		buttonDiv.appendChild(addBtn);

		content.appendChild(buttonDiv);
		modalContent.appendChild(content);
		modal.appendChild(modalContent);

		document.body.appendChild(modal);
		typeSelect.focus();
	}

	async addSpecialDay(dateObj: Date, dayType: string, note: string = ''): Promise<void> {
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
			const newEntry = `- ${dateStr}: ${dayType}: ${note}`;

			// Insert the new line at the end of the code block, before the closing ```
			const beforeClosing = content.substring(0, codeBlockEnd);
			const afterClosing = content.substring(codeBlockEnd);

			// Add newline if needed
			const needsNewline = !beforeClosing.endsWith('\n');
			content = beforeClosing + (needsNewline ? '\n' : '') + newEntry + '\n' + afterClosing;

			// Write back to file
			await this.app.vault.modify(file as TFile, content);

			// Get the label for the day type
			const label = this.settings.specialDayLabels[dayType as keyof typeof this.settings.specialDayLabels] || dayType;
			new Notice(`✅ Lagt til ${dateStr} (${label})`);

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
		container.innerHTML = '';

		const years: Record<string, any> = {};
		Object.keys(this.data.daily).sort().reverse().forEach(dateKey => {
			const year = dateKey.split('-')[0];
			if (!years[year]) years[year] = {};
			const month = dateKey.split('-')[1];
			if (!years[year][month]) years[year][month] = [];
			years[year][month].push(...this.data.daily[dateKey]);
		});

		if (this.historyView === 'list') {
			this.renderListView(container, years);
		} else if (this.historyView === 'weekly') {
			this.renderWeeklyView(container, years);
		} else if (this.historyView === 'heatmap') {
			this.renderHeatmapView(container, years);
		}
	}

	renderListView(container: HTMLElement, years: Record<string, any>): void {
		Object.keys(years).forEach(year => {
			const yearDiv = document.createElement('div');
			yearDiv.innerHTML = `<h4 style="color: var(--text-normal);">${year}</h4>`;

			Object.keys(years[year]).forEach(month => {
				const monthEntries = years[year][month];
				const table = document.createElement('table');
				table.style.width = '100%';
				table.style.borderCollapse = 'collapse';
				table.style.marginBottom = '15px';

				// Create thead
				const thead = document.createElement('thead');
				thead.innerHTML = `
					<tr style="background: var(--background-secondary); color: var(--text-normal);">
						<th style="padding: 8px; color: var(--text-normal);">Dato</th>
						<th style="padding: 8px; color: var(--text-normal);">Type</th>
						<th style="padding: 8px; color: var(--text-normal);">Timer</th>
						<th style="padding: 8px; color: var(--text-normal);">Fleksitid</th>
						<th style="padding: 8px; color: var(--text-normal);">Handling</th>
					</tr>
				`;
				table.appendChild(thead);

				// Create tbody
				const tbody = document.createElement('tbody');
				monthEntries.forEach((e: any) => {
					const row = document.createElement('tr');
					row.style.borderBottom = '1px solid var(--background-modifier-border)';
					row.style.color = 'var(--text-normal)';

					const dateCell = document.createElement('td');
					dateCell.style.padding = '8px';
					dateCell.style.color = 'var(--text-normal)';
					dateCell.textContent = Utils.toLocalDateStr(e.date);
					row.appendChild(dateCell);

					const typeCell = document.createElement('td');
					typeCell.style.padding = '8px';
					typeCell.style.color = 'var(--text-normal)';
					// Use custom label if available, otherwise use the entry name
					const entryNameLower = e.name.toLowerCase();
					const customLabel = this.settings.specialDayLabels[entryNameLower as keyof typeof this.settings.specialDayLabels];
					typeCell.textContent = customLabel || e.name;
					row.appendChild(typeCell);

					const hoursCell = document.createElement('td');
					hoursCell.style.padding = '8px';
					hoursCell.style.color = 'var(--text-normal)';
					hoursCell.textContent = Utils.formatHoursToHM(e.duration || 0, this.settings.hourUnit);
					row.appendChild(hoursCell);

					const flextimeCell = document.createElement('td');
					flextimeCell.style.padding = '8px';
					flextimeCell.style.color = 'var(--text-normal)';
					flextimeCell.textContent = Utils.formatHoursToHM(e.flextime || 0, this.settings.hourUnit);
					row.appendChild(flextimeCell);

					const actionCell = document.createElement('td');
					actionCell.style.padding = '8px';
					actionCell.style.color = 'var(--text-normal)';

					// Only add edit button for work entries
					if (e.name.toLowerCase() === 'jobb') {
						const editBtn = document.createElement('button');
						editBtn.textContent = '✏️';
						editBtn.style.padding = '4px 8px';
						editBtn.style.cursor = 'pointer';
						editBtn.title = 'Rediger arbeidstid';
						editBtn.onclick = () => {
							this.showEditEntriesModal(e.date);
						};
						actionCell.appendChild(editBtn);
					}

					row.appendChild(actionCell);
					tbody.appendChild(row);
				});
				table.appendChild(tbody);

				yearDiv.appendChild(table);
			});

			container.appendChild(yearDiv);
		});
	}

	renderWeeklyView(container: HTMLElement, years: Record<string, any>): void {
		container.innerHTML = '<div style="padding: 20px; text-align: center;">Weekly view - Coming soon</div>';
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
				const dayFlextime = dayEntries.reduce((sum, e) => sum + (e.flextime || 0), 0);
				cell.style.background = this.flextimeColor(dayFlextime);
			} else {
				cell.style.background = '#eee';
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

	cleanup(): void {
		this.intervals.forEach(interval => clearInterval(interval));
		this.intervals = [];
	}

	build(): HTMLElement {
		this.injectStyles();

		this.container.appendChild(this.buildBadgeSection());
		this.container.appendChild(this.buildSummaryCards());
		this.container.appendChild(this.createStatsCard());
		this.container.appendChild(this.buildInfoCard());
		this.container.appendChild(this.buildHistoryCard());
		this.container.appendChild(this.buildStatusBar());

		return this.container;
	}
}
