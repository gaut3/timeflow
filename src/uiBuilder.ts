import { App, TFile, Notice } from 'obsidian';
import { DataManager } from './dataManager';
import { MessageGenerator } from './messageGenerator';
import { TimeFlowSettings } from './settings';
import { TimerManager } from './timerManager';
import { ImportModal } from './importModal';
import { Utils, SPECIAL_DAY_COLORS } from './utils';

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
		clock: HTMLElement | null;
		dayCard: HTMLElement | null;
		weekCard: HTMLElement | null;
		statsCard: HTMLElement | null;
		monthCard: HTMLElement | null;
		timerControls: HTMLElement | null;
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
			clock: null,
			dayCard: null,
			weekCard: null,
			statsCard: null,
			monthCard: null,
			timerControls: null,
		};
	}

	createContainer(): HTMLElement {
		const container = document.createElement("div");
		container.style.fontFamily = "sans-serif";
		container.style.maxWidth = "1200px";
		container.style.margin = "0 auto";
		container.style.padding = "20px";
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
				max-width: 1200px;
				margin: 0 auto;
				padding: 20px;
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

			.tf-badge-section {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 20px;
				flex-wrap: wrap;
				gap: 15px;
			}

			.tf-badge {
				padding: 12px 24px;
				border-radius: 8px;
				font-size: 20px;
				font-weight: bold;
				text-align: center;
				min-width: 200px;
				box-shadow: 0 2px 8px rgba(0,0,0,0.1);
			}

			.tf-clock {
				font-size: 24px;
				font-weight: bold;
				color: var(--text-normal);
			}

			.tf-summary-cards {
				display: flex;
				gap: 15px;
				margin-bottom: 20px;
				flex-wrap: wrap;
			}

			.tf-card {
				flex: 1;
				min-width: 280px;
				padding: 20px;
				border-radius: 8px;
				background: var(--background-primary-alt);
				border: 1px solid var(--background-modifier-border);
				box-shadow: 0 2px 8px rgba(0,0,0,0.05);
			}

			.tf-card h3 {
				margin-top: 0;
				margin-bottom: 15px;
				font-size: 18px;
				color: var(--text-normal);
			}

			.tf-progress-bar {
				width: 100%;
				height: 12px;
				background: var(--background-secondary);
				border-radius: 6px;
				overflow: hidden;
				margin: 10px 0;
			}

			.tf-progress-fill {
				height: 100%;
				background: linear-gradient(90deg, #4caf50, #8bc34a);
				transition: width 0.3s ease;
			}

			.tf-month-grid {
				display: grid;
				grid-template-columns: repeat(7, 1fr);
				gap: 8px;
				margin-top: 15px;
			}

			.tf-day-cell {
				aspect-ratio: 1;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 6px;
				font-size: 14px;
				cursor: pointer;
				transition: all 0.2s;
				position: relative;
				border: 2px solid transparent;
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
				grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
				gap: 15px;
				margin-top: 15px;
			}

			.tf-stat-item {
				padding: 15px;
				background: var(--background-secondary);
				border-radius: 6px;
			}

			.tf-stat-label {
				font-size: 12px;
				color: var(--text-muted);
				margin-bottom: 5px;
			}

			.tf-stat-value {
				font-size: 20px;
				font-weight: bold;
				color: var(--text-normal);
			}

			.tf-tabs {
				display: flex;
				gap: 10px;
				margin-bottom: 15px;
				border-bottom: 2px solid var(--background-modifier-border);
			}

			.tf-tab {
				padding: 8px 16px;
				cursor: pointer;
				border: none;
				background: transparent;
				color: var(--text-muted);
				font-size: 14px;
				transition: all 0.2s;
			}

			.tf-tab.active {
				color: var(--interactive-accent);
				border-bottom: 2px solid var(--interactive-accent);
				margin-bottom: -2px;
			}

			.tf-tab:hover {
				color: var(--text-normal);
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

			.tf-context-menu {
				position: absolute;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 6px;
				box-shadow: 0 4px 16px rgba(0,0,0,0.2);
				padding: 8px 0;
				z-index: 1000;
				min-width: 200px;
			}

			.tf-menu-item {
				padding: 8px 16px;
				cursor: pointer;
				transition: background 0.2s;
				display: flex;
				align-items: center;
				gap: 10px;
			}

			.tf-menu-item:hover {
				background: var(--background-modifier-hover);
			}

			.tf-menu-separator {
				height: 1px;
				background: var(--background-modifier-border);
				margin: 4px 0;
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
				.tf-summary-cards {
					flex-direction: column;
				}

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

		// Timer controls
		const timerControls = document.createElement("div");
		timerControls.style.display = "flex";
		timerControls.style.gap = "10px";
		timerControls.style.alignItems = "center";
		this.elements.timerControls = timerControls;

		this.updateTimerControls();

		const clock = document.createElement("div");
		clock.className = "tf-clock";
		this.elements.clock = clock;

		section.appendChild(badge);
		section.appendChild(timerControls);
		section.appendChild(clock);

		this.updateBadge();
		this.updateClock();

		return section;
	}

	updateTimerControls(): void {
		if (!this.elements.timerControls) return;

		this.elements.timerControls.innerHTML = '';

		const activeTimers = this.timerManager.getActiveTimers();

		if (activeTimers.length === 0) {
			// Start button
			const startBtn = document.createElement("button");
			startBtn.className = "tf-button";
			startBtn.textContent = "▶️ Start Timer";
			startBtn.style.background = "#4caf50";
			startBtn.style.color = "white";
			startBtn.style.fontWeight = "bold";
			startBtn.onclick = async () => {
				await this.timerManager.startTimer('jobb');
				this.updateTimerControls();
			};
			this.elements.timerControls.appendChild(startBtn);
		} else {
			// Show active timers
			activeTimers.forEach(timer => {
				const timerDisplay = document.createElement("div");
				timerDisplay.style.display = "flex";
				timerDisplay.style.alignItems = "center";
				timerDisplay.style.gap = "8px";
				timerDisplay.style.padding = "8px 12px";
				timerDisplay.style.background = "var(--background-primary-alt)";
				timerDisplay.style.borderRadius = "6px";
				timerDisplay.style.border = "2px solid #4caf50";

				const runningTime = this.timerManager.getRunningTime(timer);
				const timerText = document.createElement("span");
				timerText.textContent = `⏱️ ${timer.name}: ${Utils.formatHoursToHM(runningTime)}`;
				timerText.style.fontWeight = "bold";

				const stopBtn = document.createElement("button");
				stopBtn.className = "tf-button";
				stopBtn.textContent = "⏹️ Stop";
				stopBtn.style.background = "#f44336";
				stopBtn.style.color = "white";
				stopBtn.onclick = async () => {
					await this.timerManager.stopTimer(timer);
					this.updateTimerControls();
				};

				timerDisplay.appendChild(timerText);
				timerDisplay.appendChild(stopBtn);
				this.elements.timerControls!.appendChild(timerDisplay);
			});
		}

		// Import button (always visible)
		const importBtn = document.createElement("button");
		importBtn.className = "tf-button";
		importBtn.textContent = "📥 Import";
		importBtn.style.background = "#2196f3";
		importBtn.style.color = "white";
		importBtn.style.fontWeight = "bold";
		importBtn.style.marginLeft = "8px";
		importBtn.onclick = () => {
			new ImportModal(this.app, this.timerManager, () => {
				// Refresh will happen automatically via onTimerChange
				new Notice('Dashboard oppdatert!');
			}).open();
		};
		this.elements.timerControls.appendChild(importBtn);
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
		card.className = "tf-card";
		this.elements.dayCard = card;
		this.updateDayCard();
		return card;
	}

	createWeekCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card";
		this.elements.weekCard = card;
		this.updateWeekCard();
		return card;
	}

	createMonthCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card";

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
		card.className = "tf-card";

		const header = document.createElement("h3");
		header.textContent = "Statistikk";
		card.appendChild(header);

		const tabs = document.createElement("div");
		tabs.className = "tf-tabs";

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

		card.appendChild(tabs);

		const statsContainer = document.createElement("div");
		statsContainer.className = "tf-stats-grid";
		this.elements.statsCard = statsContainer;
		card.appendChild(statsContainer);

		this.updateStatsCard();

		return card;
	}

	buildInfoCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card";

		const header = document.createElement("div");
		header.className = "tf-collapsible";
		header.innerHTML = "<h3 style='margin:0'>ℹ️ Informasjon</h3>";

		const content = document.createElement("div");
		content.className = "tf-collapsible-content";
		content.innerHTML = `
			<div style="margin-top: 15px;">
				<h4>Fargeforklaring</h4>
				<div style="display: grid; gap: 8px;">
					${Object.entries(SPECIAL_DAY_COLORS).map(([key, color]) =>
						`<div style="display: flex; align-items: center; gap: 10px;">
							<div style="width: 20px; height: 20px; background: ${color}; border-radius: 4px;"></div>
							<span>${key}</span>
						</div>`
					).join('')}
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
		card.className = "tf-card";

		const header = document.createElement("div");
		header.style.display = "flex";
		header.style.justifyContent = "space-between";
		header.style.alignItems = "center";
		header.style.marginBottom = "15px";

		const title = document.createElement("h3");
		title.textContent = "Historikk";
		title.style.margin = "0";

		const controls = document.createElement("div");
		controls.style.display = "flex";
		controls.style.gap = "5px";

		const views = [
			{ id: "list", label: "Liste" },
			{ id: "weekly", label: "Uker" },
			{ id: "heatmap", label: "Varmekart" }
		];

		views.forEach(view => {
			const btn = document.createElement("button");
			btn.textContent = view.label;
			btn.className = `tf-button ${this.historyView === view.id ? 'active' : ''}`;
			btn.onclick = () => {
				this.historyView = view.id;
				this.refreshHistoryView(detailsElement);
			};
			controls.appendChild(btn);
		});

		const exportBtn = document.createElement("button");
		exportBtn.textContent = "📥 Export CSV";
		exportBtn.className = "tf-button";
		exportBtn.onclick = () => this.exportCurrentView();
		controls.appendChild(exportBtn);

		header.appendChild(title);
		header.appendChild(controls);
		card.appendChild(header);

		const detailsElement = document.createElement("div");
		detailsElement.style.maxHeight = "500px";
		detailsElement.style.overflow = "auto";
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
		const formatted = Utils.formatHoursToHM(Math.abs(balance));
		const sign = balance >= 0 ? "+" : "-";

		let color = "#4caf50"; // green
		if (balance < -15 || balance > 95) {
			color = "#f44336"; // red
		} else if (balance < 0 || balance > 80) {
			color = "#ff9800"; // yellow
		}

		this.elements.badge.style.background = color;
		this.elements.badge.style.color = "white";
		this.elements.badge.textContent = `⏱️ Timesaldo: ${sign}${formatted}`;
	}

	updateDayCard(): void {
		if (!this.elements.dayCard) return;

		const today = new Date();
		const todayKey = Utils.toLocalDateStr(today);
		const todayHours = this.data.getTodayHours(today);
		const goal = this.data.getDailyGoal(todayKey);
		const isWeekendDay = Utils.isWeekend(today);
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

		this.elements.dayCard.innerHTML = `
			<h3>📅 I dag</h3>
			<div style="font-size: 32px; font-weight: bold; margin: 10px 0;">
				${Utils.formatHoursToHM(todayHours)}
			</div>
			<div style="font-size: 14px; color: var(--text-muted); margin-bottom: 10px;">
				Mål: ${Utils.formatHoursToHM(goal)}
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

			if (Utils.isWeekend(d)) {
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

		this.elements.weekCard.innerHTML = `
			<h3>📊 Denne uken</h3>
			<div style="font-size: 32px; font-weight: bold; margin: 10px 0;">
				${Utils.formatHoursToHM(weekHours)}
			</div>
			<div style="font-size: 14px; color: var(--text-muted); margin-bottom: 10px;">
				Mål: ${Utils.formatHoursToHM(adjustedGoal)}
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

		this.elements.statsCard.innerHTML = `
			<div class="tf-stat-item">
				<div class="tf-stat-label">Timesaldo</div>
				<div class="tf-stat-value">${Utils.formatHoursToHM(Math.abs(balance))}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">Totale timer</div>
				<div class="tf-stat-value">${Utils.formatHoursToHM(stats.totalHours)}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">Gjennomsnitt per dag</div>
				<div class="tf-stat-value">${Utils.formatHoursToHM(stats.avgDailyHours)}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">Arbeidsdager</div>
				<div class="tf-stat-value">${stats.jobb.count}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">Ferie (brukt/planlagt)</div>
				<div class="tf-stat-value">${stats.ferie.count} / ${stats.ferie.planned}</div>
			</div>
			<div class="tf-stat-item">
				<div class="tf-stat-label">Avspasering</div>
				<div class="tf-stat-value">${stats.avspasering.count}</div>
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
			if (holidayInfo) {
				cell.style.background = SPECIAL_DAY_COLORS[holidayInfo.type] || "#eee";
			} else if (this.data.daily[dateKey]) {
				const dayFlextime = this.data.daily[dateKey].reduce((sum, e) => sum + (e.flextime || 0), 0);
				cell.style.background = this.flextimeColor(dayFlextime);
			} else if (Utils.isWeekend(date)) {
				cell.style.background = "#f5f5f5";
			} else {
				cell.style.background = "#fff";
			}

			// Highlight today
			if (dateKey === todayKey) {
				cell.classList.add("today");
			}

			// Add click handler
			cell.onclick = (e) => {
				this.showNoteTypeMenu(e, date);
			};

			grid.appendChild(cell);
		}

		container.appendChild(grid);
		return container;
	}

	flextimeColor(val: number): string {
		if (val === 0) return "#fff";
		if (val > 0) {
			const intensity = Math.min(val / 6, 1);
			const green = Math.floor(200 + intensity * 55);
			const other = Math.floor(240 - intensity * 90);
			return `rgb(${other}, ${green}, ${other})`;
		} else {
			const intensity = Math.min(Math.abs(val) / 6, 1);
			const red = Math.floor(200 + intensity * 55);
			const other = Math.floor(240 - intensity * 90);
			return `rgb(${red}, ${other}, ${other})`;
		}
	}

	showNoteTypeMenu(event: MouseEvent, dateObj: Date): void {
		// Remove existing menu
		const existingMenu = document.querySelector('.tf-context-menu');
		if (existingMenu) existingMenu.remove();

		const menu = document.createElement('div');
		menu.className = 'tf-context-menu';
		menu.style.left = `${event.clientX}px`;
		menu.style.top = `${event.clientY}px`;

		// Create note options
		this.settings.noteTypes.forEach(noteType => {
			const item = document.createElement('div');
			item.className = 'tf-menu-item';
			item.innerHTML = `<span>${noteType.icon}</span><span>${noteType.label}</span>`;
			item.onclick = async () => {
				await this.createNoteFromType(dateObj, noteType);
				menu.remove();
			};
			menu.appendChild(item);
		});

		// Add separator
		const separator = document.createElement('div');
		separator.className = 'tf-menu-separator';
		menu.appendChild(separator);

		// Add special day registration
		const specialDayItem = document.createElement('div');
		specialDayItem.className = 'tf-menu-item';
		specialDayItem.textContent = '📅 Registrer spesialdag';
		specialDayItem.onclick = () => {
			new Notice('Special day registration not yet implemented');
			menu.remove();
		};
		menu.appendChild(specialDayItem);

		document.body.appendChild(menu);

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
			yearDiv.innerHTML = `<h4>${year}</h4>`;

			Object.keys(years[year]).forEach(month => {
				const monthEntries = years[year][month];
				const table = document.createElement('table');
				table.style.width = '100%';
				table.style.borderCollapse = 'collapse';
				table.style.marginBottom = '15px';

				table.innerHTML = `
					<thead>
						<tr style="background: var(--background-secondary);">
							<th style="padding: 8px;">Dato</th>
							<th style="padding: 8px;">Type</th>
							<th style="padding: 8px;">Timer</th>
							<th style="padding: 8px;">Fleksitid</th>
						</tr>
					</thead>
					<tbody>
						${monthEntries.map((e: any) => `
							<tr style="border-bottom: 1px solid var(--background-modifier-border);">
								<td style="padding: 8px;">${Utils.toLocalDateStr(e.date)}</td>
								<td style="padding: 8px;">${e.name}</td>
								<td style="padding: 8px;">${Utils.formatHoursToHM(e.duration || 0)}</td>
								<td style="padding: 8px;">${Utils.formatHoursToHM(e.flextime || 0)}</td>
							</tr>
						`).join('')}
					</tbody>
				`;

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
		this.updateTimerControls();
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
