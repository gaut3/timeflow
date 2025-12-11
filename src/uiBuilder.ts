import { App, TFile, Notice, normalizePath } from 'obsidian';
import { DataManager, HolidayInfo, ValidationResults, ValidationIssue, TimeEntry } from './dataManager';
import { TimeFlowSettings, SpecialDayBehavior, NoteType } from './settings';
import { TimerManager, Timer } from './timerManager';
import { Utils, getSpecialDayColors, getSpecialDayTextColors } from './utils';
import type TimeFlowPlugin from './main';
import { t, formatDate, formatTime, getDayNamesShort, getMonthName, translateSpecialDayName, translateNoteTypeName, translateAnnetTemplateName } from './i18n';

export interface SystemStatus {
	validation?: ValidationResults;
	holiday?: { message?: string };
	activeTimers?: number;
}

export class UIBuilder {
	data: DataManager;
	container: HTMLElement;
	intervals: number[] = [];
	today: Date;
	statsTimeframe: string = "month";
	selectedYear: number;
	selectedMonth: number;
	historyView: string = "list";
	currentMonthOffset: number = 0;
	historyFilter: string[] = []; // empty = all, or list of type IDs to filter by
	inlineEditMode: boolean = false; // toggle for inline editing in wide view
	isModalOpen: boolean = false; // prevents background refresh while modal is open
	systemStatus: SystemStatus;
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

	constructor(dataManager: DataManager, systemStatus: SystemStatus, settings: TimeFlowSettings, app: App, timerManager: TimerManager, plugin: TimeFlowPlugin) {
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
		const r = Math.max(0, parseInt(hex.substring(0, 2), 16) - percent);
		const g = Math.max(0, parseInt(hex.substring(2, 4), 16) - percent);
		const b = Math.max(0, parseInt(hex.substring(4, 6), 16) - percent);
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	}

	/**
	 * Validate time input and parse hours/minutes.
	 * Returns null if invalid, otherwise returns { hours, minutes }.
	 */
	private parseTimeInput(value: string): { hours: number; minutes: number } | null {
		if (!value || !value.includes(':')) return null;
		const parts = value.split(':');
		if (parts.length !== 2) return null;
		const hours = parseInt(parts[0], 10);
		const minutes = parseInt(parts[1], 10);
		if (isNaN(hours) || isNaN(minutes)) return null;
		if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
		return { hours, minutes };
	}

	/**
	 * Create a text-based time input with validation (HH:MM format).
	 * Uses a regular text input instead of type="time" to avoid clock pickers on mobile.
	 */
	private createTimeInput(initialValue: string, onChange: (value: string) => void | Promise<void>): HTMLInputElement {
		const input = document.createElement('input');
		input.type = 'text';
		input.value = initialValue;
		input.placeholder = 'HH:MM';
		input.maxLength = 5;
		input.pattern = '[0-2][0-9]:[0-5][0-9]';
		input.inputMode = 'numeric'; // Show numeric keyboard on mobile
		input.classList.add('tf-time-input');

		let lastValidValue = initialValue;

		// Auto-format as user types
		input.oninput = () => {
			let val = input.value.replace(/[^0-9]/g, ''); // Remove non-digits
			if (val.length >= 3) {
				val = val.slice(0, 2) + ':' + val.slice(2, 4);
			}
			if (val.length > 5) val = val.slice(0, 5);
			input.value = val;
		};

		// Validate and call onChange on blur
		input.onblur = () => {
			// If empty, just restore last valid (might be empty for new entries)
			if (!input.value) {
				input.value = lastValidValue;
				return;
			}
			const parsed = this.parseTimeInput(input.value);
			if (parsed) {
				// Format to ensure consistent HH:MM format
				const formatted = `${parsed.hours.toString().padStart(2, '0')}:${parsed.minutes.toString().padStart(2, '0')}`;
				input.value = formatted;
				lastValidValue = formatted;
				void onChange(formatted);
			} else {
				new Notice(t('validation.invalidTime'));
				input.value = lastValidValue; // Restore previous value
			}
		};

		// Also validate on Enter key
		input.onkeydown = (e) => {
			if (e.key === 'Enter') {
				input.blur();
			}
		};

		return input;
	}

	/**
	 * Wrapper for timerManager.save() with error handling.
	 * Shows a notice on failure and returns false.
	 */
	private async saveWithErrorHandling(): Promise<boolean> {
		try {
			await this.timerManager.save();
			return true;
		} catch (error) {
			console.error('TimeFlow: Error saving data:', error);
			new Notice(t('notifications.saveError'));
			return false;
		}
	}

	createContainer(): HTMLElement {
		const container = document.createElement("div");
		container.className = "tf-container";
		return container;
	}

	// Note: Styles are now in styles.css instead of being injected dynamically

	buildBadgeSection(): HTMLElement {
		const section = document.createElement("div");
		section.className = "tf-badge-section";

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

		// Hide goal-related badges in simple tracking mode, but keep clock and timer
		if (!this.settings.enableGoalTracking) {
			badge.addClass('tf-hidden');
			complianceBadge.addClass('tf-hidden');
		}

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
			this.elements.timerBadge.className = "tf-timer-badge tf-bg-transparent tf-inline-flex tf-items-stretch tf-gap-0 tf-p-0 tf-relative";
			this.elements.timerBadge.onclick = null;

			// Main "Start" button (starts jobb)
			const startBtn = document.createElement("div");
			startBtn.textContent = "Start";
			startBtn.className = "tf-timer-start-btn";
			startBtn.onclick = async (e) => {
				e.stopPropagation();
				// Use first work type from settings, fallback to 'jobb'
				const workType = this.settings.specialDayBehaviors.find(b => b.isWorkType);
				const timerName = workType?.id || 'jobb';
				await this.timerManager.startTimer(timerName);
				this.updateTimerBadge();
			};

			// Arrow dropdown button
			const arrowBtn = document.createElement("div");
			arrowBtn.textContent = "▼";
			arrowBtn.className = "tf-timer-dropdown-btn";
			arrowBtn.onclick = (e) => {
				e.stopPropagation();
				this.showTimerTypeMenu(arrowBtn);
			};

			this.elements.timerBadge.appendChild(startBtn);
			this.elements.timerBadge.appendChild(arrowBtn);
		} else {
			// Stop button badge (active timer)
			this.elements.timerBadge.empty();
			this.elements.timerBadge.textContent = t('buttons.stop');
			this.elements.timerBadge.className = "tf-timer-badge tf-timer-stop-btn";
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

		// Build timer types from settings - filter by showInTimerDropdown
		// Default to true for jobb, studie, kurs if not explicitly set
		const defaultTimerTypes = ['jobb', 'studie', 'kurs'];
		const timerTypes = this.settings.specialDayBehaviors
			.filter(b => b.showInTimerDropdown ?? defaultTimerTypes.includes(b.id))
			.map(b => ({
				name: b.id,
				icon: b.icon,
				label: translateSpecialDayName(b.id, b.label)
			}));

		timerTypes.forEach(type => {
			const item = document.createElement('div');
			item.className = 'tf-menu-item';
			item.createSpan({ text: type.icon });
			item.createSpan({ text: type.label });

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
		header.className = "tf-card-header";

		const title = document.createElement("h3");
		title.textContent = t('ui.calendar');
		title.className = "tf-card-title";

		const controls = document.createElement("div");
		controls.className = "tf-card-controls";

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
		headerRow.className = "tf-collapsible tf-stats-header";

		const header = document.createElement("h3");
		header.textContent = t('ui.statistics');
		header.className = "tf-m-0";
		headerRow.appendChild(header);

		const tabs = document.createElement("div");
		tabs.className = "tf-tabs tf-tabs-inline";

		const timeframes = ["month", "year", "total"];
		const labels = { month: t('timeframes.month'), year: t('timeframes.year'), total: t('timeframes.total') };

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
		header.addClass('tf-cursor-pointer');

		this.updateStatsCard();

		return card;
	}

	buildInfoCard(): HTMLElement {
		const card = document.createElement("div");
		card.className = "tf-card tf-card-spaced";

		const header = document.createElement("div");
		header.className = "tf-collapsible";
		const h3 = header.createEl('h3', { text: t('ui.information') });
		h3.className = 'tf-m-0';

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
		specialDaysList.className = 'tf-legend-list';

		specialDayInfo.forEach(item => {
			const color = getSpecialDayColors(this.settings)[item.key] || "transparent";
			const label = translateSpecialDayName(item.key);
			const li = specialDaysList.createEl('li');
			li.className = 'tf-legend-item';

			const colorBox = li.createDiv();
			colorBox.className = 'tf-legend-color-dynamic';
			colorBox.setCssProps({ '--tf-bg': color });

			const textSpan = li.createSpan({ text: item.emoji + ' ' });
			textSpan.createEl('strong', { text: label });
			textSpan.appendText(': ' + item.desc);
		});

		// Work days gradient box (only shown when goal tracking enabled)
		if (this.settings.enableGoalTracking) {
			const gradientBox = leftColumn.createDiv({ cls: 'tf-info-box' });
			gradientBox.createEl('h4', { text: t('info.workDaysGradient') });
			const gradientP = gradientBox.createEl('p', { text: t('info.colorShowsFlextime') + ' (' + this.settings.baseWorkday + 'h):' });
			gradientP.className = 'tf-info-text';

			// Positive gradient
			const posGradient = gradientBox.createDiv();
			posGradient.className = 'tf-gradient-dynamic';
			posGradient.setCssProps({ '--tf-gradient': `linear-gradient(to right, ${this.flextimeColor(0)}, ${this.flextimeColor(1.5)}, ${this.flextimeColor(3)})` });

			const posLabels = gradientBox.createDiv();
			posLabels.className = 'tf-gradient-labels';
			posLabels.createSpan({ text: '0h' });
			posLabels.createSpan({ text: '+1.5h' });
			posLabels.createSpan({ text: '+3h' });

			// Negative gradient - use base negative color for the light end
			const workBehavior = this.settings.specialDayBehaviors?.find(b => b.isWorkType);
			const negBaseColor = workBehavior?.negativeColor || '#64b5f6';
			const negGradient = gradientBox.createDiv();
			negGradient.className = 'tf-gradient-dynamic';
			negGradient.setCssProps({ '--tf-gradient': `linear-gradient(to right, ${this.flextimeColor(-3)}, ${this.flextimeColor(-1.5)}, ${negBaseColor})` });

			const negLabels = gradientBox.createDiv();
			negLabels.className = 'tf-gradient-labels';
			negLabels.createSpan({ text: '-3h' });
			negLabels.createSpan({ text: '-1.5h' });
			negLabels.createSpan({ text: '0h' });
		}

		// Right Column: Calendar and balance
		const rightColumn = infoGrid.createDiv({ cls: 'tf-info-column' });

		// Calendar context menu box
		const calendarBox = rightColumn.createDiv({ cls: 'tf-info-box' });
		calendarBox.createEl('h4', { text: t('info.calendarContextMenu') });
		const calendarP = calendarBox.createEl('p', { text: t('info.clickDayFor') });
		calendarP.className = 'tf-info-text-small';
		const calendarList = calendarBox.createEl('ul');
		calendarList.className = 'tf-info-list';
		calendarList.createEl('li', { text: t('info.createDailyNote') });
		calendarList.createEl('li', { text: t('info.editFlextimeManually') });
		calendarList.createEl('li', { text: t('info.registerSpecialDays') });

		// Helper to create color indicator rows
		const createColorRow = (container: HTMLElement, color: string, label: string, desc: string) => {
			const row = container.createDiv();
			row.className = 'tf-color-row';
			const colorSpan = row.createSpan();
			colorSpan.className = 'tf-color-indicator tf-dynamic-bg';
			colorSpan.setCssProps({ '--tf-bg': color });
			const textSpan = row.createSpan();
			textSpan.createEl('strong', { text: label + ':' });
			textSpan.appendText(' ' + desc);
		};

		// Flextime balance zones box (only shown when goal tracking enabled)
		if (this.settings.enableGoalTracking) {
			const balanceBox = rightColumn.createDiv({ cls: 'tf-info-box' });
			balanceBox.createEl('h4', { text: t('info.flextimeBalanceZones') });
			const balanceContainer = balanceBox.createDiv();
			balanceContainer.className = 'tf-balance-container';
			createColorRow(balanceContainer, this.settings.customColors?.balanceOk || '#4caf50', t('info.green'), this.settings.balanceThresholds.warningLow + 'h ' + t('info.to') + ' +' + this.settings.balanceThresholds.warningHigh + 'h');
			createColorRow(balanceContainer, this.settings.customColors?.balanceWarning || '#ff9800', t('info.yellow'), this.settings.balanceThresholds.criticalLow + 'h ' + t('info.to') + ' ' + (this.settings.balanceThresholds.warningLow - 1) + 'h / +' + this.settings.balanceThresholds.warningHigh + 'h ' + t('info.to') + ' +' + this.settings.balanceThresholds.criticalHigh + 'h');
			createColorRow(balanceContainer, this.settings.customColors?.balanceCritical || '#f44336', t('info.red'), '<' + this.settings.balanceThresholds.criticalLow + 'h / >+' + this.settings.balanceThresholds.criticalHigh + 'h');

			// Week number compliance box
			const weekBox = rightColumn.createDiv({ cls: 'tf-info-box' });
			weekBox.createEl('h4', { text: t('info.weekNumberCompliance') });
			const weekContainer = weekBox.createDiv();
			weekContainer.className = 'tf-balance-container';
			createColorRow(weekContainer, 'linear-gradient(135deg, #c8e6c9, #a5d6a7)', t('info.green'), t('info.reachedGoal') + ' (±0.5h)');
			createColorRow(weekContainer, 'linear-gradient(135deg, #ffcdd2, #ef9a9a)', t('info.red'), t('info.overGoal'));
			createColorRow(weekContainer, 'linear-gradient(135deg, #ffe0b2, #ffcc80)', t('info.orange'), t('info.underGoal'));
			createColorRow(weekContainer, 'linear-gradient(135deg, #e0e0e0, #bdbdbd)', t('info.gray'), t('info.weekInProgress'));
			const weekTip = weekBox.createEl('p');
			weekTip.className = 'tf-tip-text';
			weekTip.createEl('em', { text: t('info.clickWeekForDetails') });
		}

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
		title.className = 'tf-history-title';
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
		tabs.className = "tf-tabs tf-tabs-inline";

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

		// Add class to editToggle for easy querying
		editToggle.addClass('tf-history-edit-toggle');

		content.appendChild(detailsElement);

		// Toggle collapse on header click (like Informasjon section)
		header.onclick = () => {
			content.classList.toggle('open');
		};
		header.addClass('tf-cursor-pointer');

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
					errorHeader.className = 'tf-status-error';
					const errorStrong = errorHeader.createEl('strong');
					errorStrong.className = 'tf-status-error-label';
					errorStrong.textContent = `Feil (${errors.length}):`;

					errors.slice(0, 5).forEach((err: ValidationIssue) => {
						const errorItem = container.createDiv();
						errorItem.className = 'tf-status-error-item';
						errorItem.textContent = `• ${err.type}: ${err.description}${err.date ? ` (${err.date})` : ''}`;
					});
					if (errors.length > 5) {
						const moreErrors = container.createDiv();
						moreErrors.className = 'tf-status-more';
						moreErrors.textContent = `...og ${errors.length - 5} flere feil`;
					}
				}

				if (warnings.length > 0) {
					const warningHeader = container.createDiv();
					warningHeader.className = 'tf-status-error';
					const warningStrong = warningHeader.createEl('strong');
					warningStrong.className = 'tf-status-warning-label';
					warningStrong.textContent = `Advarsler (${warnings.length}):`;

					warnings.slice(0, 5).forEach((warn: ValidationIssue) => {
						const warningItem = container.createDiv();
						warningItem.className = 'tf-status-warning-item';
						warningItem.textContent = `• ${warn.type}: ${warn.description}${warn.date ? ` (${warn.date})` : ''}`;
					});
					if (warnings.length > 5) {
						const moreWarnings = container.createDiv();
						moreWarnings.className = 'tf-status-more';
						moreWarnings.textContent = `...og ${warnings.length - 5} flere advarsler`;
					}
				}
			}
		};

		// Create header using DOM API
		const header = document.createElement("div");
		header.className = "tf-status-header";

		header.createSpan({ text: statusIcon });

		const headerContent = header.createDiv();
		headerContent.className = "tf-status-content";

		const titleRow = headerContent.createDiv();
		titleRow.createEl('strong', { text: t('status.systemStatus') });
		if (hasIssues) {
			titleRow.createSpan({ text: ` (${t('status.clickForDetails')})`, cls: 'tf-status-hint' });
		}

		const statusRow = headerContent.createDiv();
		statusRow.className = "tf-status-row";

		const statusText = statusRow.createSpan();
		statusText.textContent = `${status.holiday?.message || t('status.holidayNotLoaded')} • ${status.activeTimers || 0} ${t('status.activeTimers')} • ${status.validation?.issues?.stats?.totalEntries || 0} ${t('status.entriesChecked')}`;

		const versionText = statusRow.createSpan();
		versionText.className = "tf-status-version";
		versionText.textContent = `v${this.plugin.manifest.version}`;

		if (hasIssues) {
			header.createSpan({ cls: 'tf-status-toggle', text: '▶' });
		}

		bar.appendChild(header);

		// Create collapsible details section
		if (hasIssues) {
			const details = document.createElement("div");
			details.className = "tf-status-details";

			const detailsInner = details.createDiv();
			detailsInner.className = "tf-status-details-inner";
			buildIssuesContent(detailsInner);

			bar.appendChild(details);

			// Toggle click handler
			let isOpen = false;
			header.onclick = () => {
				isOpen = !isOpen;
				const toggle = header.querySelector('.tf-status-toggle') as HTMLElement;
				if (toggle) {
					toggle.setCssProps({ '--tf-rotate': isOpen ? '90deg' : '0deg' });
				}
				if (isOpen) {
					details.setCssProps({ '--tf-max-height': details.scrollHeight + 'px', '--tf-opacity': '1' });
				} else {
					details.setCssProps({ '--tf-max-height': '0', '--tf-opacity': '0' });
				}
			};
		}

		return bar;
	}

	buildViewToggle(): HTMLElement {
		const container = document.createElement("div");
		container.className = "tf-view-toggle-container";

		const viewToggle = document.createElement("button");
		const isInSidebar = this.isViewInSidebar();
		viewToggle.className = "tf-view-toggle-btn";
		const iconSpan = viewToggle.createSpan({ cls: 'tf-view-toggle-icon' });
		iconSpan.textContent = isInSidebar ? '⊞' : '◧';
		viewToggle.appendText(' ' + (isInSidebar ? t('buttons.moveToMain') : t('buttons.moveToSidebar')));
		viewToggle.title = isInSidebar ? t('buttons.moveToMain') : t('buttons.moveToSidebar');

		viewToggle.onclick = (e) => {
			e.stopPropagation();
			const newLocation = isInSidebar ? 'main' : 'sidebar';
			void this.plugin.moveViewToLocation(newLocation);
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

		this.elements.badge.setCssProps({ '--tf-bg': color, '--tf-color': 'white' });
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
			this.elements.complianceBadge.addClass('tf-hidden');
			return;
		}

		const { status } = this.getComplianceStatus();

		this.elements.complianceBadge.removeClass('tf-hidden');
		this.elements.complianceBadge.removeClass('tf-compliance-ok', 'tf-compliance-approaching', 'tf-compliance-over');

		if (status === 'ok') {
			this.elements.complianceBadge.addClass('tf-compliance-ok');
			this.elements.complianceBadge.textContent = `🟩 ${t('compliance.ok')}`;
		} else if (status === 'approaching') {
			this.elements.complianceBadge.addClass('tf-compliance-approaching');
			this.elements.complianceBadge.textContent = `🟨 ${t('compliance.near')}`;
		} else {
			this.elements.complianceBadge.addClass('tf-compliance-over');
			this.elements.complianceBadge.textContent = `🟥 ${t('compliance.over')}`;
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
		panel.createEl('hr');

		let statusText: string;
		if (dailyStatus === 'exceeded' || weeklyStatus === 'exceeded' || restCheck.violated) {
			statusText = `${t('compliance.exceeds')} ${t('compliance.limit')}.`;
		} else if (dailyStatus === 'approaching' || weeklyStatus === 'approaching') {
			statusText = `${t('status.approachingLimits')} ${t('compliance.limit')}.`;
		} else {
			statusText = t('status.allLimitsOk');
		}
		panel.createEl('p', { text: statusText, cls: 'tf-compliance-status-text' });

		// Position panel near the badge, ensuring it stays on screen
		const badgeRect = this.elements.complianceBadge!.getBoundingClientRect();
		document.body.appendChild(panel);

		// Calculate position after adding to DOM so we can measure panel size
		const panelRect = panel.getBoundingClientRect();
		const padding = 10;
		let top = badgeRect.bottom + 8;
		let right = window.innerWidth - badgeRect.right;
		// Ensure panel stays within screen bounds
		const leftEdge = window.innerWidth - right - panelRect.width;
		if (leftEdge < padding) right = window.innerWidth - panelRect.width - padding;
		if (right < padding) right = padding;
		if (top + panelRect.height > window.innerHeight - padding) top = badgeRect.top - panelRect.height - 8;
		if (top < padding) top = padding;
		panel.style.top = `${top}px`;
		panel.style.right = `${right}px`;

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
			this.elements.dayCard.setCssProps({ '--tf-bg': 'var(--background-secondary)', '--tf-color': 'var(--text-normal)' });
			this.elements.dayCard.empty();

			this.elements.dayCard.createEl('h3', { text: 'I dag' });

			this.elements.dayCard.createDiv({ text: Utils.formatHoursToHM(todayHours, this.settings.hourUnit), cls: 'tf-card-big-number' });

			this.elements.dayCard.createDiv({ text: t('ui.hoursWorked'), cls: 'tf-card-label' });
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

		this.elements.dayCard.setCssProps({ '--tf-bg': bgColor, '--tf-color': textColor });
		this.elements.dayCard.empty();

		this.elements.dayCard.createEl('h3', { text: t('ui.today') });

		this.elements.dayCard.createDiv({ text: Utils.formatHoursToHM(todayHours, this.settings.hourUnit), cls: 'tf-card-big-number' });

		this.elements.dayCard.createDiv({ text: `${t('ui.goal')}: ${Utils.formatHoursToHM(goal, this.settings.hourUnit)}`, cls: 'tf-card-goal' });

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
			this.elements.weekCard.setCssProps({ '--tf-bg': 'var(--background-secondary)', '--tf-color': 'var(--text-normal)' });
			this.elements.weekCard.empty();

			addWeekBadge(this.elements.weekCard);

			this.elements.weekCard.createEl('h3', { text: t('ui.thisWeek') });

			this.elements.weekCard.createDiv({ text: Utils.formatHoursToHM(weekHours, this.settings.hourUnit), cls: 'tf-card-big-number' });

			this.elements.weekCard.createDiv({ text: t('ui.hoursWorked'), cls: 'tf-card-label' });
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

		this.elements.weekCard.setCssProps({ '--tf-bg': bgColor, '--tf-color': textColor });
		this.elements.weekCard.empty();

		addWeekBadge(this.elements.weekCard);

		this.elements.weekCard.createEl('h3', { text: t('ui.thisWeek') });

		this.elements.weekCard.createDiv({ text: Utils.formatHoursToHM(weekHours, this.settings.hourUnit), cls: 'tf-card-big-number' });

		// Conditionally show goal and progress bar based on settings
		if (this.settings.enableWeeklyGoals) {
			this.elements.weekCard.createDiv({ text: `${t('ui.goal')}: ${Utils.formatHoursToHM(adjustedGoal, this.settings.hourUnit)}`, cls: 'tf-card-goal' });

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
		const expectedWeeklyHours = this.settings.baseWorkweek * this.settings.workPercent;
		const workloadPct = expectedWeeklyHours > 0
			? ((avgWeekly / expectedWeeklyHours) * 100).toFixed(0)
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
					yearSelect.className = "tf-select";

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
					yearSelect.className = "tf-select";

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
						monthSelect.className = "tf-select";

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
				label.className = "tf-text-lg tf-font-bold";
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
		if (this.statsTimeframe === "year" && stats.ferie.max && stats.ferie.max > 0) {
			const feriePercent = ((stats.ferie.count / stats.ferie.max) * 100).toFixed(0);
			ferieDisplay = `${stats.ferie.count}/${stats.ferie.max} ${t('ui.days')} (${feriePercent}%)`;
		}

		// Egenmelding display - use stats.egenmelding.count for month view, getSpecialDayStats for year view
		let egenmeldingDisplay = `${stats.egenmelding.count} ${t('ui.days')}`;
		let egenmeldingPeriodLabel = '';
		if (this.statsTimeframe === "year") {
			// For year view, use getSpecialDayStats for rolling/max display
			const egenmeldingStats = this.data.getSpecialDayStats('egenmelding', this.selectedYear);
			if (egenmeldingStats.max && egenmeldingStats.max > 0) {
				const egenmeldingPercent = ((egenmeldingStats.count / egenmeldingStats.max) * 100).toFixed(0);
				egenmeldingDisplay = `${egenmeldingStats.count}/${egenmeldingStats.max} ${t('ui.days')} (${egenmeldingPercent}%)`;
			} else {
				egenmeldingDisplay = `${egenmeldingStats.count} ${t('ui.days')}`;
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
				item.createDiv({ text: subtitle, cls: 'tf-stat-subtitle' });
			}
			return { item, valueDiv };
		};

		// Flextime balance (conditional)
		if (this.settings.enableGoalTracking) {
			createStatItem(t('stats.flextimeBalance'), `${sign}${Utils.formatHoursToHM(Math.abs(balance), this.settings.hourUnit)}`, t('stats.totalBalance'), 'tf-stat-colored', `background: ${timesaldoColor};`);
		}

		// Hours
		if (!this.settings.hideEmptyStats || stats.totalHours > 0) {
			createStatItem(`⏱️ ${t('stats.hours')}`, `${stats.totalHours.toFixed(1)}t`);
		}

		// Avg per day
		if (!this.settings.hideEmptyStats || avgDaily > 0) {
			createStatItem(`📊 ${t('stats.avgPerDay')}`, `${avgDaily.toFixed(1)}t`);
		}

		// Avg per week with comparison
		if (!this.settings.hideEmptyStats || avgWeekly > 0) {
			const weekItem = this.elements.statsCard.createDiv({ cls: 'tf-stat-item' });
			weekItem.createDiv({ cls: 'tf-stat-label', text: `📅 ${t('stats.avgPerWeek')}` });
			weekItem.createDiv({ cls: 'tf-stat-value', text: `${avgWeekly.toFixed(1)}t` });
			if (context.lastWeekHours > 0) {
				const currWeekHours = this.data.getCurrentWeekHours(this.today);
				const diff = currWeekHours - context.lastWeekHours;
				if (Math.abs(diff) > 2) {
					const arrow = diff > 0 ? "📈" : "📉";
					const signDiff = diff > 0 ? "+" : "";
					weekItem.createDiv({ text: `${t('ui.vsLastWeek')}: ${signDiff}${diff.toFixed(1)}t ${arrow}`, cls: 'tf-comp-small' });
				}
			}
		}

		// Work intensity (conditional)
		if (this.settings.enableGoalTracking && this.settings.enableWeeklyGoals) {
			createStatItem(`💪 ${t('stats.workIntensity')}`, `${workloadPct}%`, t('stats.ofNormalWeek'));
		}

		// Work
		if (!this.settings.hideEmptyStats || stats.jobb.count > 0) {
			createStatItem(`💼 ${t('stats.work')}`, `${stats.jobb.count} ${t('ui.days')}`, `${stats.jobb.hours.toFixed(1)}t`);
		}

		// Weekend days (conditional)
		if (stats.weekendDays > 0) {
			createStatItem(`🌙 ${t('stats.weekendDaysWorked')}`, `${stats.weekendDays} ${t('ui.days')}`, `${stats.weekendHours.toFixed(1)}${this.settings.hourUnit}`);
		}

		// Flex time off
		if (!this.settings.hideEmptyStats || stats.avspasering.count > 0) {
			createStatItem(`🛌 ${t('stats.flexTimeOff')}`, `${stats.avspasering.count} ${t('ui.days')}`, `${stats.avspasering.hours.toFixed(1)}${this.settings.hourUnit}`);
		}

		// Vacation
		if (!this.settings.hideEmptyStats || stats.ferie.count > 0) {
			const vacationItem = this.elements.statsCard.createDiv({ cls: 'tf-stat-item' });
			vacationItem.createDiv({ cls: 'tf-stat-label', text: `🏖️ ${t('stats.vacation')}` });
			const sizeClass = this.statsTimeframe === 'year' ? 'tf-text-year-size' : 'tf-text-default-size';
			vacationItem.createDiv({ cls: `tf-stat-value ${sizeClass}`, text: ferieDisplay });
			vacationItem.createDiv({ cls: 'tf-stat-subtitle' });
		}

		// Welfare leave
		if (!this.settings.hideEmptyStats || stats.velferdspermisjon.count > 0) {
			createStatItem(`🏥 ${t('stats.welfareLeave')}`, `${stats.velferdspermisjon.count} ${t('ui.days')}`);
		}

		// Self-reported sick
		if (!this.settings.hideEmptyStats || stats.egenmelding.count > 0) {
			const sickItem = this.elements.statsCard.createDiv({ cls: 'tf-stat-item' });
			sickItem.createDiv({ cls: 'tf-stat-label', text: `🤒 ${t('stats.selfReportedSick')}` });
			const sickSizeClass = this.statsTimeframe === 'year' ? 'tf-text-year-size' : 'tf-text-default-size';
			sickItem.createDiv({ cls: `tf-stat-value ${sickSizeClass}`, text: egenmeldingDisplay });
			sickItem.createDiv({ text: egenmeldingPeriodLabel, cls: 'tf-stat-subtitle' });
		}

		// Doctor sick
		if (!this.settings.hideEmptyStats || stats.sykemelding.count > 0) {
			createStatItem(`🏥 ${t('stats.doctorSick')}`, `${stats.sykemelding.count} ${t('ui.days')}`);
		}

		// Study
		if (!this.settings.hideEmptyStats || stats.studie.count > 0) {
			createStatItem(`📚 ${t('stats.study')}`, `${stats.studie.count} ${t('ui.days')}`, `${stats.studie.hours.toFixed(1)}${this.settings.hourUnit}`);
		}

		// Course
		if (!this.settings.hideEmptyStats || stats.kurs.count > 0) {
			createStatItem(`📚 ${t('stats.course')}`, `${stats.kurs.count} ${t('ui.days')}`, `${stats.kurs.hours.toFixed(1)}${this.settings.hourUnit}`);
		}

		// Hours bar chart
		this.renderHoursBarChart();

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

	/**
	 * Render the hours bar chart at the bottom of the stats card section
	 */
	renderHoursBarChart(): void {
		if (!this.elements.statsCard) return;

		// Get the content wrapper (parent of stats grid)
		const contentWrapper = this.elements.statsCard.parentElement;
		if (!contentWrapper) return;

		// Remove existing chart if any
		const existingChart = contentWrapper.querySelector('.tf-hours-chart');
		if (existingChart) {
			existingChart.remove();
		}

		const chartData = this.data.getHistoricalHoursData(
			this.statsTimeframe as 'month' | 'year' | 'total',
			this.selectedYear,
			this.selectedMonth
		);

		// Skip if no data
		if (chartData.length === 0) return;

		// Find max value for scaling
		const maxHours = Math.max(...chartData.map(d => d.hours), ...chartData.map(d => d.target || 0));
		if (maxHours === 0) return; // No data to display

		// Create chart container and append to content wrapper (not stats grid)
		const chartContainer = document.createElement('div');
		chartContainer.className = 'tf-hours-chart';
		contentWrapper.appendChild(chartContainer);

		// Helper to create div elements
		const createDiv = (className: string, text?: string): HTMLDivElement => {
			const div = document.createElement('div');
			div.className = className;
			if (text) div.textContent = text;
			return div;
		};

		// Title based on timeframe
		let title = '';
		if (this.statsTimeframe === 'month') {
			title = t('stats.weeklyHours') || 'Uketimer';
		} else if (this.statsTimeframe === 'year') {
			title = t('stats.monthlyHours') || 'Månedstimer';
		} else {
			title = t('stats.yearlyHours') || 'Årstimer';
		}
		chartContainer.appendChild(createDiv('tf-hours-chart-title', title));

		const chartInner = createDiv('tf-hours-chart-container');
		chartContainer.appendChild(chartInner);

		// Create bars area (where bars go)
		const barsArea = createDiv('tf-hours-bars-area');
		chartInner.appendChild(barsArea);

		// Constants for bar sizing
		const maxBarHeight = 80; // pixels
		const bottomOffset = 20; // space for labels at bottom

		// Add target line if applicable (inside chartInner for correct absolute positioning)
		const target = chartData[0]?.target;
		if (target && target > 0) {
			const targetHeight = (target / maxHours) * maxBarHeight;
			const targetLine = createDiv('tf-hours-target-line');
			targetLine.style.bottom = `${targetHeight + bottomOffset}px`;
			const targetLabelLeft = createDiv('tf-hours-target-label-left', t('stats.target') || 'Mål');
			const targetLabelRight = createDiv('tf-hours-target-label', `${target.toFixed(0)}t`);
			targetLine.appendChild(targetLabelLeft);
			targetLine.appendChild(targetLabelRight);
			chartInner.appendChild(targetLine);
		}

		// Render bars
		chartData.forEach(item => {
			const barWrapper = createDiv('tf-hours-bar-wrapper');

			// Value label above bar
			const valueLabel = createDiv('tf-hours-bar-value', item.hours > 0 ? `${item.hours.toFixed(0)}` : '');
			barWrapper.appendChild(valueLabel);

			// Bar container with the actual bar
			const barContainer = createDiv('tf-hours-bar-container');
			const bar = createDiv('tf-hours-bar');
			const barHeight = maxHours > 0 ? (item.hours / maxHours) * maxBarHeight : 0;
			bar.style.height = `${Math.max(barHeight, 2)}px`;
			if (item.hours === 0) {
				bar.classList.add('empty');
			}
			barContainer.appendChild(bar);
			barWrapper.appendChild(barContainer);

			// Label below bar
			barWrapper.appendChild(createDiv('tf-hours-bar-label', item.label));
			barsArea.appendChild(barWrapper);
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

					// Build display label - special handling for 'annet' type
					let displayLabel = holiday.description || translatedLabel;
					if (holiday.type === 'annet') {
						const parts: string[] = [];

						// Add template icon and label if available
						if (holiday.annetTemplateId) {
							const template = this.settings.annetTemplates.find(t => t.id === holiday.annetTemplateId);
							if (template) {
								parts.push(`${template.icon} ${translateAnnetTemplateName(template.id, template.label)}`);
							}
						}

						// Add time range if specified
						if (holiday.startTime && holiday.endTime) {
							parts.push(`${holiday.startTime}-${holiday.endTime}`);
						}

						// Add description if available
						if (holiday.description) {
							parts.push(holiday.description);
						}

						// Combine parts or fall back to translated label
						displayLabel = parts.length > 0 ? parts.join(' · ') : translatedLabel;
					}

					futureDays.push({
						date: dateStr,
						type: translatedLabel,
						label: displayLabel,
						color: behavior.color,
						textColor: behavior.textColor || '#000000'
					});
				}
			}
		});

		// Sort by date
		futureDays.sort((a, b) => a.date.localeCompare(b.date));

		// Show fewer items when hideEmptyStats is enabled (fewer stats visible = shorter card)
		const maxEntries = this.settings.hideEmptyStats ? 10 : 15;
		const displayDays = futureDays.slice(0, maxEntries);
		const hasMore = futureDays.length > maxEntries;

		if (displayDays.length === 0) {
			container.empty();
			return;
		}

		// Build list using DOM API with inner container for fade effect
		container.empty();
		container.createEl('h4', { text: t('ui.upcomingPlannedDays') });

		// Inner container for items - allows fade overlay via CSS ::after when there are more items
		const innerContainer = container.createDiv({ cls: `tf-future-days-inner${hasMore ? ' has-more' : ''}` });

		displayDays.forEach(day => {
			const date = new Date(day.date + 'T00:00:00');
			const dateStr = formatDate(date, 'long');
			const itemDiv = innerContainer.createDiv({ cls: 'tf-future-day-item' });
			itemDiv.createSpan({ cls: 'tf-future-day-date', text: dateStr });
			const typeSpan = itemDiv.createSpan({ cls: 'tf-future-day-type tf-dynamic-bg-color', text: day.label });
			typeSpan.setCssProps({ '--tf-bg': day.color, '--tf-color': day.textColor });
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
		monthTitle.className = 'tf-month-title';
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
			header.className = 'tf-day-header';
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
				weekNumCell.addClass('tf-cursor-pointer');
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
					weekNumCell.addClass('tf-cursor-pointer');
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

			// Check for special day entries in daily data (exclude work types like 'jobb')
			const specialEntry = dayEntries?.find(e => {
				const entryName = e.name.toLowerCase();
				const behavior = this.settings.specialDayBehaviors.find(b => b.id === entryName);
				// Only count as special entry if it has a color AND is not a work type
				return specialDayColors[entryName] && (!behavior || !behavior.isWorkType);
			});

			// Calculate durations by type category (work vs special)
			let workDuration = 0;
			let specialDuration = 0;
			let dominantSpecialType: string | null = null;
			let hasFullDaySpecial = false; // Track if any special day is a "full day" type (ferie, helligdag, etc.)

			if (dayEntries) {
				const specialDurations = new Map<string, number>();
				for (const entry of dayEntries) {
					const entryName = entry.name.toLowerCase();
					const behavior = this.settings.specialDayBehaviors.find(b => b.id === entryName);
					const duration = entry.duration || 0;

					if (behavior?.isWorkType) {
						workDuration += duration;
					} else if (specialDayColors[entryName] || behavior?.color) {
						specialDuration += duration;
						specialDurations.set(entryName, (specialDurations.get(entryName) || 0) + duration);
						// Check if this is a "full day" special type (noHoursRequired or countsAsWorkday)
						// These types should always be dominant regardless of duration
						if (behavior?.noHoursRequired || behavior?.countsAsWorkday) {
							hasFullDaySpecial = true;
							// Set as dominant if we don't have one yet
							if (!dominantSpecialType) {
								dominantSpecialType = entryName;
							}
						}
					}
				}
				// Find the dominant special type by hours (only if we don't already have a full-day type)
				if (!dominantSpecialType) {
					let maxSpecialDuration = 0;
					for (const [typeName, duration] of specialDurations) {
						if (duration > maxSpecialDuration) {
							maxSpecialDuration = duration;
							dominantSpecialType = typeName;
						}
					}
				}
			}

			const hasMixedTypes = workDuration > 0 && (specialDuration > 0 || hasFullDaySpecial);
			// Full-day special types (ferie, helligdag, etc.) should always be dominant
			// Otherwise, compare by duration
			const workIsDominant = !hasFullDaySpecial && workDuration >= specialDuration;

			// Track if this day has any entries
			const hasEntry = !!(holidayInfo || specialEntry || dayEntries);

			if (holidayInfo) {
				// Holiday from holidays file
				const colorKey = holidayInfo.halfDay ? 'halfday' : holidayInfo.type;
				cell.setCssProps({
					'--tf-bg': specialDayColors[colorKey] || specialDayColors[holidayInfo.type] || "var(--background-secondary)",
					'--tf-color': specialDayTextColors[colorKey] || specialDayTextColors[holidayInfo.type] || "var(--text-normal)"
				});
			} else if (hasMixedTypes && !workIsDominant && dominantSpecialType) {
				// Special day has more hours - use special day color as main background
				const behavior = this.settings.specialDayBehaviors.find(b => b.id === dominantSpecialType);
				const bgColor = behavior?.color || specialDayColors[dominantSpecialType];
				cell.setCssProps({
					'--tf-bg': bgColor,
					'--tf-color': behavior?.textColor || specialDayTextColors[dominantSpecialType] || "var(--text-normal)"
				});
			} else if (specialEntry && !hasMixedTypes) {
				// Special day ONLY (no work entries) - use special day color for whole cell
				const entryKey = specialEntry.name.toLowerCase();
				const behavior = this.settings.specialDayBehaviors.find(b => b.id === entryKey);
				cell.setCssProps({
					'--tf-bg': behavior?.color || specialDayColors[entryKey],
					'--tf-color': behavior?.textColor || specialDayTextColors[entryKey] || "var(--text-normal)"
				});
			} else if (dayEntries) {
				// Work is dominant or only work entries - show flextime color or simple color
				const isWeekendDay = Utils.isWeekend(date, this.settings);
				const halfWorkday = (this.settings.baseWorkday * this.settings.workPercent) / 2;
				const isMinimalWeekendWork = isWeekendDay && workDuration < halfWorkday;

				if (isMinimalWeekendWork) {
					// Weekend with less than half workday - show gray base with work stripe
					cell.setCssProps({
						'--tf-bg': "var(--background-modifier-border)",
						'--tf-color': "var(--text-muted)"
					});

					// Add work stripe at bottom
					const dayFlextime = dayEntries.reduce((sum, e) => sum + (e.flextime || 0), 0);
					const stripeColor = !this.settings.enableGoalTracking
						? (this.settings.specialDayBehaviors.find(b => b.isWorkType)?.simpleColor || '#90caf9')
						: this.flextimeColor(dayFlextime);

					const stripe = document.createElement("div");
					stripe.className = "secondary-type-stripe";
					stripe.setCssProps({ '--tf-bg': stripeColor });
					cell.appendChild(stripe);
				} else if (!this.settings.enableGoalTracking) {
					// Simple tracking mode - use work type's simpleColor
					const workType = this.settings.specialDayBehaviors.find(b => b.isWorkType);
					cell.setCssProps({
						'--tf-bg': workType?.simpleColor || '#90caf9',
						'--tf-color': workType?.simpleTextColor || '#000000'
					});
				} else {
					// Goal-based mode - show flextime color gradient
					const dayFlextime = dayEntries.reduce((sum, e) => sum + (e.flextime || 0), 0);
					cell.setCssProps({
						'--tf-bg': this.flextimeColor(dayFlextime),
						'--tf-color': this.flextimeTextColor(dayFlextime)
					});
				}
			} else if (Utils.isWeekend(date, this.settings)) {
				// Gray for weekends with no data
				cell.setCssProps({ '--tf-bg': "var(--background-modifier-border)" });
			} else {
				// Check if date is in the past
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const cellDate = new Date(date);
				cellDate.setHours(0, 0, 0, 0);

				if (cellDate < today) {
					// Secondary background for past empty weekdays
					cell.setCssProps({ '--tf-bg': "var(--background-secondary)" });
				} else {
					// Transparent for future empty weekdays
					cell.setCssProps({ '--tf-bg': "transparent" });
				}
			}

			// Add secondary type stripe if day has mixed types (work + special)
			if (hasMixedTypes) {
				// Stripe shows the SECONDARY type (whichever is NOT dominant)
				let stripeColor: string | null = null;

				if (workIsDominant && dominantSpecialType) {
					// Work is main, special day is stripe
					const behavior = this.settings.specialDayBehaviors.find(b => b.id === dominantSpecialType);
					stripeColor = behavior?.color || specialDayColors[dominantSpecialType];
				} else {
					// Special day is main, work (flextime gradient) is stripe
					// Use the work type's color for the stripe
					const dayFlextime = dayEntries?.reduce((sum, e) => sum + (e.flextime || 0), 0) || 0;
					stripeColor = this.flextimeColor(dayFlextime);
				}

				// Add stripe
				if (stripeColor) {
					const stripe = document.createElement("div");
					stripe.className = "secondary-type-stripe";
					stripe.setCssProps({ '--tf-bg': stripeColor });
					cell.appendChild(stripe);
				}
			}

			// Add appropriate text color class
			if (hasEntry) {
				cell.classList.add("has-entry");
			} else {
				cell.classList.add("no-entry");
				// Use normal text color for empty cells
				cell.setCssProps({ '--tf-color': "var(--text-muted)" });
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
				indicator.className = "tf-active-entry-indicator";
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
		// Find work type behavior to get configured colors
		const workBehavior = this.settings.specialDayBehaviors?.find(b => b.isWorkType);

		// Helper to parse hex color to RGB
		const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
			const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
			return result ? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
			} : { r: 128, g: 128, b: 128 }; // Fallback gray
		};

		// Calculate dynamic scale based on compliance settings
		// Scale = dailyHoursLimit - baseWorkday (e.g., 9 - 7.5 = 1.5 hours)
		const dailyLimit = this.settings.complianceSettings?.dailyHoursLimit ?? 9;
		const baseWorkday = this.settings.baseWorkday * this.settings.workPercent;
		const scale = Math.max(dailyLimit - baseWorkday, 0.5); // Minimum 0.5 to avoid division issues

		if (val < 0) {
			// Negative hours: use negativeColor from work type settings (default blue)
			const baseColor = workBehavior?.negativeColor || '#64b5f6';
			const rgb = hexToRgb(baseColor);

			// Create gradient intensity based on how negative
			// Use the dynamic scale for full darkness
			const t = Math.min(Math.abs(val) / scale, 1);
			// Start at base color, transition to darker
			// darkFactor of 0.5 means we darken by up to 50% at maximum
			const darkFactor = t * 0.5;
			const r = Math.floor(rgb.r * (1 - darkFactor));
			const g = Math.floor(rgb.g * (1 - darkFactor));
			const b = Math.floor(rgb.b * (1 - darkFactor));
			return `rgb(${r},${g},${b})`;
		} else {
			// Positive hours: use color from work type settings (default green)
			const baseColor = workBehavior?.color || '#4caf50';
			const rgb = hexToRgb(baseColor);

			// Create gradient intensity based on how positive
			// Use the dynamic scale for full darkness
			const t = Math.min(val / scale, 1);
			// Start at base color, transition to darker
			// darkFactor of 0.5 means we darken by up to 50% at maximum
			const darkFactor = t * 0.5;
			const r = Math.floor(rgb.r * (1 - darkFactor));
			const g = Math.floor(rgb.g * (1 - darkFactor));
			const b = Math.floor(rgb.b * (1 - darkFactor));
			return `rgb(${r},${g},${b})`;
		}
	}

	flextimeTextColor(val: number): string {
		// Find work type behavior to get configured text colors
		const workBehavior = this.settings.specialDayBehaviors?.find(b => b.isWorkType);

		if (val < 0) {
			return workBehavior?.negativeTextColor || '#ffffff';
		} else {
			return workBehavior?.textColor || '#ffffff';
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
				// Check if this day has a special day that doesn't require hours (ferie, etc.)
				const holidayInfo = this.data.getHolidayInfo(dayKey);
				const behavior = holidayInfo ? this.settings.specialDayBehaviors.find(b => b.id === holidayInfo.type) : null;
				const isNoHoursDay = behavior?.noHoursRequired === true;

				if (!isNoHoursDay) {
					workDaysInWeek++;
					if (day <= today) {
						workDaysPassed++;
					}
				}
			}

			// Sum hours from entries
			const dayEntries = this.data.daily[dayKey] || [];
			dayEntries.forEach(entry => {
				const name = entry.name.toLowerCase();
				// Count work hours (exclude special leave types that don't count as work)
				if (name !== 'avspasering' && name !== 'ferie' && name !== 'egenmelding' && name !== 'sykemelding' && name !== 'velferdspermisjon') {
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
				// Check if this day has a special day that doesn't require hours (ferie, etc.)
				const holidayInfo = this.data.getHolidayInfo(dayKey);
				const behavior = holidayInfo ? this.settings.specialDayBehaviors.find(b => b.id === holidayInfo.type) : null;
				const isNoHoursDay = behavior?.noHoursRequired === true;

				if (!isNoHoursDay) {
					workDaysInWeek++;
					if (day <= today) {
						workDaysPassed++;
					}
				}
			}

			const dayEntries = this.data.daily[dayKey] || [];
			dayEntries.forEach(entry => {
				const name = entry.name.toLowerCase();
				// Count work hours (exclude special leave types that don't count as work)
				if (name !== 'avspasering' && name !== 'ferie' && name !== 'egenmelding' && name !== 'sykemelding' && name !== 'velferdspermisjon') {
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
		// Remove existing panel - toggle behavior if clicking the same week
		const existingPanel = document.querySelector<HTMLElement>('.tf-week-compliance-panel');
		if (existingPanel) {
			const existingWeek = existingPanel.dataset.weekMonday;
			existingPanel.remove();
			// If clicking the same week, just close (toggle off)
			if (existingWeek === Utils.toLocalDateStr(mondayOfWeek)) {
				return;
			}
		}

		const data = this.getWeekComplianceData(mondayOfWeek);

		const panel = document.createElement('div');
		panel.className = 'tf-week-compliance-panel';
		panel.dataset.weekMonday = Utils.toLocalDateStr(mondayOfWeek); // Store for toggle detection

		// Status icon and color
		let statusIcon = '🟩';
		let statusText = t('status.onTarget');
		let statusColor = '#4caf50';
		if (data.status === 'over') {
			statusIcon = '🟥';
			statusText = t('status.overTarget');
			statusColor = '#f44336'; // Red - over target (working too much)
		} else if (data.status === 'under') {
			statusIcon = '🟨';
			statusText = t('status.underTarget');
			statusColor = '#ff9800'; // Yellow - under target (needs to catch up)
		} else if (data.status === 'partial') {
			statusIcon = '⏳';
			statusText = t('status.inProgress');
			statusColor = '#9e9e9e';
		}

		const diff = data.totalHours - data.expectedHours;
		const diffText = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);

		// Build panel content using DOM API
		const headerRow = panel.createDiv({ cls: 'tf-panel-header-row' });
		headerRow.createEl('strong', { text: `${t('ui.week')} ${data.weekNumber}`, cls: 'tf-week-title' });
		const statusSpan = headerRow.createSpan({ text: `${statusIcon} ${statusText}`, cls: 'tf-font-bold tf-dynamic-color' });
		statusSpan.setCssProps({ '--tf-color': statusColor });

		const contentDiv = panel.createDiv({ cls: 'tf-panel-content-col' });

		// Hours logged row
		const hoursRow = contentDiv.createDiv({ cls: 'tf-panel-row' });
		hoursRow.createSpan({ text: `${t('ui.hoursLogged')}:` });
		hoursRow.createEl('strong', { text: `${data.totalHours.toFixed(1)}t` });

		// Expected row
		const expectedRow = contentDiv.createDiv({ cls: 'tf-panel-row' });
		expectedRow.createSpan({ text: `${t('ui.expected')}:` });
		expectedRow.createSpan({ text: `${data.expectedHours.toFixed(1)}t (${data.workDaysPassed}/${data.workDaysInWeek} ${t('ui.days')})` });

		// Difference row
		const diffRow = contentDiv.createDiv({ cls: 'tf-panel-row-border' });
		diffRow.createSpan({ text: `${t('ui.difference')}:` });
		const diffValue = diffRow.createEl('strong', { text: `${diffText}t`, cls: 'tf-dynamic-color' });
		diffValue.setCssProps({ '--tf-color': statusColor });

		// Warning if over limit
		if (data.totalHours > data.weeklyLimit) {
			contentDiv.createDiv({ text: `⚠️ ${t('ui.overWeekLimit')} (${data.weeklyLimit}t)`, cls: 'tf-warning-text' });
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
		// Remove existing menu - toggle behavior if clicking the same date
		const existingMenu = document.querySelector<HTMLElement>('.tf-context-menu');
		if (existingMenu) {
			const existingDate = existingMenu.dataset.menuDate;
			existingMenu.remove();
			// If clicking the same date, just close (toggle off)
			if (existingDate === Utils.toLocalDateStr(dateObj)) {
				return;
			}
		}

		const menu = document.createElement('div');
		menu.className = 'tf-context-menu';
		menu.dataset.menuDate = Utils.toLocalDateStr(dateObj); // Store for toggle detection

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
			menu.setCssProps({ '--tf-left': `${menuLeft}px`, '--tf-right': '10px', '--tf-width': 'calc(100vw - 20px)' });
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

		// Add edit planned day option if there's a planned day
		const plannedDayInfo = this.data.getHolidayInfo(dateStr);
		if (plannedDayInfo) {
			let typeName = translateSpecialDayName(plannedDayInfo.type);
			if (plannedDayInfo.type === 'annet' && plannedDayInfo.annetTemplateId) {
				const template = this.settings.annetTemplates?.find(tmpl => tmpl.id === plannedDayInfo.annetTemplateId);
				if (template) {
					typeName = translateAnnetTemplateName(template.id, template.label);
				}
			}

			const editPlannedItem = document.createElement('div');
			editPlannedItem.className = 'tf-menu-item';
			editPlannedItem.createSpan({ text: '✏️' });
			editPlannedItem.createSpan({ text: `${t('menu.editPlannedDay')} ${typeName}` });
			editPlannedItem.onclick = () => {
				menu.remove();
				this.showEditPlannedDayModal(dateObj, plannedDayInfo);
			};
			menuMain.appendChild(editPlannedItem);
		}

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

			// Get type name (translated) and for annet, include template label
			let typeName = translateSpecialDayName(plannedInfo.type);
			if (plannedInfo.type === 'annet' && plannedInfo.annetTemplateId) {
				const template = this.settings.annetTemplates?.find(tmpl => tmpl.id === plannedInfo.annetTemplateId);
				if (template) {
					typeName = `${template.icon} ${translateAnnetTemplateName(template.id, template.label)}`;
				}
			}

			const plannedP = menuInfo.createEl('p');
			// Show: "🌴 Vacation: Summer trip" or "🏥 Doctor: Annual checkup"
			let displayText = plannedInfo.description
				? `${emoji} ${typeName}: ${plannedInfo.description}`
				: `${emoji} ${typeName}`;
			if (plannedInfo.halfDay) {
				displayText += ' (½)';
			}
			plannedP.createEl('strong', { text: displayText });
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
				menuInfo.createEl('p', { text: '⏱️ ' + timer.name + ': ' + startTimeStr + ' - Pågår (' + elapsed + 't)', cls: 'tf-ml-8' });
			});
		}

		// Show completed entries for this day (filter out running timers - those without duration)
		// Also include special day entries with 0 duration (ferie, egenmelding, etc.)
		const completedEntries = allEntries.filter(e => {
			if (e.duration && e.duration > 0) return true;
			// Include special days with 0 duration (ferie entries from data.md)
			// Also include reduce_goal entries (sick days) with 0 duration
			const behavior = this.data.getSpecialDayBehavior(e.name);
			return behavior && (behavior.noHoursRequired || behavior.countsAsWorkday || behavior.flextimeEffect === 'reduce_goal');
		});
		if (completedEntries.length > 0) {
			const historyP = menuInfo.createEl('p');
			historyP.createEl('strong', { text: t('ui.history') + ':' });
			completedEntries.forEach(e => {
				const emoji = Utils.getEmoji(e);
				// Don't show "0.0t" for special days with no duration
				const behavior = this.data.getSpecialDayBehavior(e.name);
				const isFullDayReduceGoal = behavior?.flextimeEffect === 'reduce_goal' && (!e.duration || e.duration === 0);
				const durationText = (e.duration && e.duration > 0)
					? `: ${e.duration.toFixed(1)}${this.settings.hourUnit}`
					: isFullDayReduceGoal ? ` (${t('ui.fullDay')})` : '';
				menuInfo.createEl('p', { text: emoji + ' ' + translateSpecialDayName(e.name.toLowerCase(), e.name) + durationText, cls: 'tf-ml-8' });
			});

			// Add balance information for past days
			if (!isFutureDay) {
				const dayGoal = this.data.getDailyGoal(dateStr);
				// Use actual flextime from entries (accounts for accumulate/withdraw behaviors)
				const dailyDelta = allEntries.reduce((sum, e) => sum + (e.flextime || 0), 0);
				const runningBalance = this.data.getBalanceUpToDate(dateStr);

				const goalP = menuInfo.createEl('p', { cls: 'tf-menu-goal' });
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
			menuInfo.createEl('p', { text: t('ui.noRegistration'), cls: 'tf-text-muted' });
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
		menuInfo.createEl('p', { text: `💡 ${t('menu.selectOption')}`, cls: 'tf-tip-paragraph' });
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

	/**
	 * Show confirmation dialog for overnight shift detection.
	 */
	private showOvernightShiftConfirmation(onConfirm: () => void): void {
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim tf-modal-z1001';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => modal.remove();
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal tf-modal-content-350';

		const title = document.createElement('div');
		title.className = 'modal-title';
		title.textContent = t('confirm.overnightShiftTitle');
		modalContent.appendChild(title);

		const content = document.createElement('div');
		content.className = 'modal-content tf-modal-content-padded';

		const message = document.createElement('p');
		message.textContent = t('confirm.overnightShift');
		content.appendChild(message);

		const buttonDiv = document.createElement('div');
		buttonDiv.className = 'tf-btn-row-end-mt';

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => modal.remove();
		buttonDiv.appendChild(cancelBtn);

		const confirmBtn = document.createElement('button');
		confirmBtn.textContent = t('buttons.confirm');
		confirmBtn.className = 'mod-cta';
		confirmBtn.onclick = () => {
			modal.remove();
			onConfirm();
		};
		buttonDiv.appendChild(confirmBtn);

		content.appendChild(buttonDiv);
		modalContent.appendChild(content);
		modal.appendChild(modalContent);
		document.body.appendChild(modal);
	}

	/**
	 * Show a generic confirmation dialog that replaces browser confirm().
	 * @param message The message to display
	 * @param onConfirm Callback when user confirms
	 * @param title Optional title (defaults to "Confirm")
	 */
	private showConfirmDialog(message: string, onConfirm: () => void | Promise<void>, title?: string): void {
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim tf-modal-z1001';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => modal.remove();
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal tf-modal-content-350';

		const titleEl = document.createElement('div');
		titleEl.className = 'modal-title';
		titleEl.textContent = title || t('buttons.confirm');
		modalContent.appendChild(titleEl);

		const content = document.createElement('div');
		content.className = 'modal-content tf-modal-content-padded';

		const messageEl = document.createElement('p');
		messageEl.textContent = message;
		content.appendChild(messageEl);

		const buttonDiv = document.createElement('div');
		buttonDiv.className = 'tf-btn-row-end-mt';

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => modal.remove();
		buttonDiv.appendChild(cancelBtn);

		const confirmBtn = document.createElement('button');
		confirmBtn.textContent = t('buttons.confirm');
		confirmBtn.className = 'mod-cta mod-warning';
		confirmBtn.onclick = () => {
			modal.remove();
			void onConfirm();
		};
		buttonDiv.appendChild(confirmBtn);

		content.appendChild(buttonDiv);
		modalContent.appendChild(content);
		modal.appendChild(modalContent);
		document.body.appendChild(modal);
	}

	/**
	 * Check if a new/edited entry would create a prohibited overlap.
	 * Blocks: same-type overlaps AND overlaps between accumulate-type entries.
	 */
	private checkProhibitedOverlap(
		dateStr: string,
		entryType: string,
		startTime: Date,
		endTime: Date,
		excludeEntry?: Timer
	): boolean {
		const newBehavior = this.settings.specialDayBehaviors.find(b => b.id === entryType.toLowerCase());
		const newIsAccumulate = newBehavior?.flextimeEffect === 'accumulate';

		const dayEntries = this.timerManager.data.entries.filter(e => {
			if (e === excludeEntry) return false;
			if (!e.startTime || !e.endTime) return false;
			return Utils.toLocalDateStr(new Date(e.startTime)) === dateStr;
		});

		for (const entry of dayEntries) {
			const existingStart = new Date(entry.startTime!);
			const existingEnd = new Date(entry.endTime!);

			// Check if ranges overlap (startTime < existingEnd && endTime > existingStart)
			if (startTime < existingEnd && endTime > existingStart) {
				const existingType = entry.name.toLowerCase();
				const existingBehavior = this.settings.specialDayBehaviors.find(b => b.id === existingType);
				const existingIsAccumulate = existingBehavior?.flextimeEffect === 'accumulate';

				// Block if: same type OR both are accumulate types
				if (entryType.toLowerCase() === existingType) return true;
				if (newIsAccumulate && existingIsAccumulate) return true;
			}
		}
		return false;
	}

	showWorkTimeModal(dateObj: Date): void {
		const dateStr = Utils.toLocalDateStr(dateObj);
		this.isModalOpen = true;

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim tf-modal-z';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => { this.isModalOpen = false; modal.remove(); };
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal tf-modal-w-400';

		// Prevent Obsidian from capturing keyboard events in modal inputs
		modalContent.addEventListener('keydown', (e) => e.stopPropagation());
		modalContent.addEventListener('keyup', (e) => e.stopPropagation());
		modalContent.addEventListener('keypress', (e) => e.stopPropagation());
		modalContent.addEventListener('beforeinput', (e) => e.stopPropagation());
		modalContent.addEventListener('input', (e) => e.stopPropagation());

		// Title
		const title = document.createElement('div');
		title.className = 'modal-title';
		title.textContent = `${t('modals.logWorkTitle')} ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content tf-modal-content-padded';

		// Start time
		const startLabel = document.createElement('div');
		startLabel.textContent = t('modals.startTimeFormat');
		startLabel.className = 'tf-form-label-bold';
		content.appendChild(startLabel);

		const startInput = document.createElement('input');
		startInput.type = 'text';
		startInput.value = '08:00';
		startInput.placeholder = 'HH:MM';
		startInput.className = 'tf-form-input-full tf-form-input-mb';
		content.appendChild(startInput);

		// End time
		const endLabel = document.createElement('div');
		endLabel.textContent = t('modals.endTimeFormat');
		endLabel.className = 'tf-form-label-bold';
		content.appendChild(endLabel);

		const endInput = document.createElement('input');
		endInput.type = 'text';
		endInput.value = '15:30';
		endInput.placeholder = 'HH:MM';
		endInput.className = 'tf-form-input-full tf-form-input-mb-lg';
		content.appendChild(endInput);

		// Buttons
		const buttonDiv = document.createElement('div');
		buttonDiv.className = 'tf-btn-row-end';

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => { this.isModalOpen = false; modal.remove(); };
		buttonDiv.appendChild(cancelBtn);

		const addBtn = document.createElement('button');
		addBtn.textContent = t('buttons.add');
		addBtn.className = 'mod-cta';
		addBtn.onclick = () => {
			const startTime = startInput.value.trim();
			const endTime = endInput.value.trim();

			// Validate time format
			const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
			if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
				new Notice(`❌ ${t('validation.invalidTimeFormat')}`);
				return;
			}

			// Create ISO datetime strings for the timer manager
			const [startHour, startMin] = startTime.split(':').map(Number);
			const [endHour, endMin] = endTime.split(':').map(Number);

			const startDate = new Date(dateObj);
			startDate.setHours(startHour, startMin, 0, 0);

			const endDate = new Date(dateObj);
			endDate.setHours(endHour, endMin, 0, 0);

			// Helper to add the entry
			const addEntry = async (finalEndDate: Date) => {
				// Check for prohibited overlaps
				if (this.checkProhibitedOverlap(dateStr, 'jobb', startDate, finalEndDate)) {
					new Notice(`❌ ${t('validation.overlappingEntry')}`);
					return;
				}

				// Add the work session using the timer manager
				try {
					this.timerManager.data.entries.push({
						name: 'jobb',
						startTime: startDate.toISOString(),
						endTime: finalEndDate.toISOString(),
						subEntries: null,
						collapsed: false
					});

					await this.saveWithErrorHandling();

					const duration = (finalEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
					new Notice(`✅ ${t('notifications.addedWorkTime').replace('{duration}', duration.toFixed(1)).replace('{date}', dateStr)}`);

					// Reload data to reflect changes
					this.data.rawEntries = this.timerManager.convertToTimeEntries();
					this.data.processEntries();

					// Refresh the dashboard
					this.updateDayCard();
					this.updateWeekCard();
					this.updateStatsCard();
					this.updateMonthCard();

					this.isModalOpen = false;
					modal.remove();
				} catch (error) {
					console.error('Failed to add work time:', error);
					new Notice(`❌ ${t('notifications.errorAddingWorkTime')}`);
				}
			};

			// If end time is before or equal to start time, ask if it's an overnight shift
			if (endDate <= startDate) {
				this.showOvernightShiftConfirmation(() => {
					// User confirmed overnight shift - add a day to end date
					const nextDayEndDate = new Date(endDate);
					nextDayEndDate.setDate(nextDayEndDate.getDate() + 1);
					void addEntry(nextDayEndDate);
				});
			} else {
				void addEntry(endDate);
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
			if (entry.collapsed && Array.isArray(entry.subEntries)) {
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
			new Notice(t('notifications.noWorkEntriesFound'));
			return;
		}

		this.isModalOpen = true;

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim tf-modal-z';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => { this.isModalOpen = false; modal.remove(); };
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal tf-modal-w-500';

		// Prevent Obsidian from capturing keyboard events in modal inputs
		modalContent.addEventListener('keydown', (e) => e.stopPropagation());
		modalContent.addEventListener('keyup', (e) => e.stopPropagation());
		modalContent.addEventListener('keypress', (e) => e.stopPropagation());
		modalContent.addEventListener('beforeinput', (e) => e.stopPropagation());
		modalContent.addEventListener('input', (e) => e.stopPropagation());

		// Title
		const title = document.createElement('div');
		title.className = 'modal-title';
		title.textContent = `${t('modals.editWorkTitle')} ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content tf-modal-content-padded';

		// List all entries with edit/delete options
		workEntries.forEach((item, index) => {
			const entry = item.entry;
			const entryDiv = document.createElement('div');
			entryDiv.className = 'tf-entry-card';

			const startDate = new Date(entry.startTime!);
			const endDate = entry.endTime ? new Date(entry.endTime) : null;

			const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
			const endTimeStr = endDate ? `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}` : t('ui.ongoing');

			// Check if entry spans multiple days
			const startDateStr = Utils.toLocalDateStr(startDate);
			const endDateStr = endDate ? Utils.toLocalDateStr(endDate) : null;
			const isMultiDay = endDate && startDateStr !== endDateStr;

			const duration = endDate ? ((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)).toFixed(1) : 'N/A';

			// Entry info
			const infoDiv = document.createElement('div');
			infoDiv.className = 'tf-info-mb';

			// Show entry name for subEntries, or just number for regular entries
			const entryLabel = item.parent ? `${item.parent.name} - ${entry.name}` : `Oppføring ${index + 1}`;
			infoDiv.createDiv({ text: entryLabel, cls: 'tf-title-bold' });

			// Show time with date indicator for multi-day entries
			const timeDisplay = isMultiDay
				? `⏰ ${startDateStr} ${startTimeStr} → ${endDateStr} ${endTimeStr}`
				: `⏰ ${startTimeStr} - ${endTimeStr}`;
			infoDiv.createDiv({ text: timeDisplay });
			infoDiv.createDiv({ text: `⏱️ ${duration} timer` });

			entryDiv.appendChild(infoDiv);

			// Edit fields (initially hidden)
			const editDiv = document.createElement('div');
			editDiv.className = 'tf-edit-section tf-hidden';

			// Start date + time row
			const startLabel = document.createElement('div');
			startLabel.textContent = `${t('modals.startTime')}:`;
			startLabel.className = 'tf-label-bold-mb';
			editDiv.appendChild(startLabel);

			const startRow = document.createElement('div');
			startRow.className = 'tf-datetime-row';

			const startDateInput = document.createElement('input');
			startDateInput.type = 'date';
			startDateInput.value = startDateStr;
			startDateInput.className = 'tf-input-flex-p';
			startRow.appendChild(startDateInput);

			const startTimeInput = this.createTimeInput(startTimeStr, () => {});
			startTimeInput.className = 'tf-input-flex-p';
			startRow.appendChild(startTimeInput);

			editDiv.appendChild(startRow);

			// End date + time row
			const endLabel = document.createElement('div');
			endLabel.textContent = `${t('modals.endTime')}:`;
			endLabel.className = 'tf-label-bold-mb';
			editDiv.appendChild(endLabel);

			const endRow = document.createElement('div');
			endRow.className = 'tf-datetime-row';

			const endDateInput = document.createElement('input');
			endDateInput.type = 'date';
			endDateInput.value = endDateStr || startDateStr;
			endDateInput.className = 'tf-input-flex-p';
			endRow.appendChild(endDateInput);

			const endTimeInput = this.createTimeInput(endTimeStr !== t('ui.ongoing') ? endTimeStr : '', () => {});
			endTimeInput.className = 'tf-input-flex-p';
			endRow.appendChild(endTimeInput);

			editDiv.appendChild(endRow);

			entryDiv.appendChild(editDiv);

			// Buttons
			const buttonDiv = document.createElement('div');
			buttonDiv.className = "tf-modal-btn-row";

			const editBtn = document.createElement('button');
			editBtn.textContent = `✏️ ${t('buttons.edit')}`;
			editBtn.onclick = () => {
				if (editDiv.hasClass('tf-hidden')) {
					editDiv.removeClass('tf-hidden');
					editBtn.textContent = `💾 ${t('buttons.save')}`;
				} else {
					// Save changes - use date+time inputs
					const newStartDateValue = startDateInput.value;
					const newStartTimeValue = startTimeInput.value;
					const newEndDateValue = endDateInput.value;
					const newEndTimeValue = endTimeInput.value;

					// Validate inputs
					if (!newStartDateValue || !newStartTimeValue) {
						new Notice(`❌ ${t('validation.startTimeRequired')}`);
						return;
					}

					// Create new start date
					const newStartDate = new Date(`${newStartDateValue}T${newStartTimeValue}:00`);
					if (isNaN(newStartDate.getTime())) {
						new Notice(`❌ ${t('validation.invalidStartDateTime')}`);
						return;
					}

					// Helper to save the entry update
					const saveUpdate = async (finalEndDate: Date | null) => {
						if (finalEndDate) {
							// Check for prohibited overlaps (exclude current entry being edited)
							const checkDateStr = Utils.toLocalDateStr(newStartDate);
							if (this.checkProhibitedOverlap(checkDateStr, entry.name, newStartDate, finalEndDate, entry)) {
								new Notice(`❌ ${t('validation.overlappingEntry')}`);
								return;
							}
						}

						// Update the entry (use local ISO format)
						entry.startTime = Utils.toLocalISOString(newStartDate);
						entry.endTime = finalEndDate ? Utils.toLocalISOString(finalEndDate) : null;

						await this.saveWithErrorHandling();
						new Notice(`✅ ${t('notifications.entryUpdated')}`);

						// Reload data to reflect changes
						this.data.rawEntries = this.timerManager.convertToTimeEntries();
						this.data.processEntries();

						// Refresh the dashboard
						this.updateDayCard();
						this.updateWeekCard();
						this.updateStatsCard();
						this.updateMonthCard();

						this.isModalOpen = false;
						modal.remove();
					};

					if (newEndTimeValue) {
						// Create end date from inputs
						const newEndDate = new Date(`${newEndDateValue}T${newEndTimeValue}:00`);
						if (isNaN(newEndDate.getTime())) {
							new Notice(`❌ ${t('validation.invalidEndDateTime')}`);
							return;
						}

						if (newEndDate <= newStartDate) {
							new Notice(`❌ ${t('validation.endAfterStart')}`);
							return;
						}

						void saveUpdate(newEndDate);
					} else {
						// No end time (active timer)
						void saveUpdate(null);
					}
				}
			};
			buttonDiv.appendChild(editBtn);

			const deleteBtn = document.createElement('button');
			deleteBtn.textContent = `🗑️ ${t('buttons.delete')}`;
			deleteBtn.onclick = () => {
				// Show confirmation dialog
				this.showDeleteConfirmation(entry, dateObj, async () => {
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
						await this.saveWithErrorHandling();
						new Notice(`✅ ${t('notifications.deleted')}`);

						// Reload data to reflect changes
						this.data.rawEntries = this.timerManager.convertToTimeEntries();
						this.data.processEntries();

						// Refresh the dashboard
						this.updateDayCard();
						this.updateWeekCard();
						this.updateStatsCard();
						this.updateMonthCard();

						this.isModalOpen = false;
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
		closeDiv.className = "tf-modal-close-row";

		const closeBtn = document.createElement('button');
		closeBtn.textContent = t('buttons.close');
		closeBtn.onclick = () => { this.isModalOpen = false; modal.remove(); };
		closeDiv.appendChild(closeBtn);

		content.appendChild(closeDiv);
		modalContent.appendChild(content);
		modal.appendChild(modalContent);

		document.body.appendChild(modal);
	}

	showSpecialDayModal(dateObj: Date): void {
		const dateStr = Utils.toLocalDateStr(dateObj);
		this.isModalOpen = true;

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim tf-modal-z';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => { this.isModalOpen = false; modal.remove(); };
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal tf-modal-w-400';

		// Prevent Obsidian from capturing keyboard events in modal inputs
		modalContent.addEventListener('keydown', (e) => e.stopPropagation());
		modalContent.addEventListener('keyup', (e) => e.stopPropagation());
		modalContent.addEventListener('keypress', (e) => e.stopPropagation());
		modalContent.addEventListener('beforeinput', (e) => e.stopPropagation());
		modalContent.addEventListener('input', (e) => e.stopPropagation());

		// Title
		const title = document.createElement('div');
		title.className = 'modal-title';
		title.textContent = t('modals.registerSpecialDayTitle');
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content tf-modal-content-padded';

		// Date display (single day mode)
		const dateDisplay = document.createElement('div');
		dateDisplay.textContent = `${t('ui.date')}: ${dateStr}`;
		dateDisplay.className = 'tf-date-display';
		content.appendChild(dateDisplay);

		// Multi-day toggle container
		const multiDayContainer = document.createElement('div');
		multiDayContainer.className = 'tf-mb-15';

		// Multiple days checkbox row
		const multiDayRow = document.createElement('div');
		multiDayRow.className = 'tf-checkbox-row';

		const multiDayCheckbox = document.createElement('input');
		multiDayCheckbox.type = 'checkbox';
		multiDayCheckbox.id = 'multiDayCheckbox';
		multiDayRow.appendChild(multiDayCheckbox);

		const multiDayLabel = document.createElement('label');
		multiDayLabel.htmlFor = 'multiDayCheckbox';
		multiDayLabel.textContent = t('ui.multipleDays');
		multiDayLabel.className = 'tf-cursor-pointer';
		multiDayRow.appendChild(multiDayLabel);

		multiDayContainer.appendChild(multiDayRow);

		// Date range inputs (hidden by default)
		const dateRangeContainer = document.createElement('div');
		dateRangeContainer.className = 'tf-hidden';

		// Start date row
		const startDateRow = document.createElement('div');
		startDateRow.className = 'tf-date-row';

		const startDateLabel = document.createElement('span');
		startDateLabel.textContent = t('ui.startDate') + ':';
		startDateLabel.className = 'tf-date-label';
		startDateRow.appendChild(startDateLabel);

		const startDateInput = document.createElement('input');
		startDateInput.type = 'date';
		startDateInput.value = dateStr;
		startDateInput.className = 'tf-input-grow';
		startDateRow.appendChild(startDateInput);

		dateRangeContainer.appendChild(startDateRow);

		// End date row
		const endDateRow = document.createElement('div');
		endDateRow.className = 'tf-date-row tf-mb-0';

		const endDateLabel = document.createElement('span');
		endDateLabel.textContent = t('ui.endDate') + ':';
		endDateLabel.className = 'tf-date-label';
		endDateRow.appendChild(endDateLabel);

		const endDateInput = document.createElement('input');
		endDateInput.type = 'date';
		endDateInput.value = dateStr;
		endDateInput.className = 'tf-input-grow';
		endDateRow.appendChild(endDateInput);

		dateRangeContainer.appendChild(endDateRow);

		// Days count display
		const daysCountDisplay = document.createElement('div');
		daysCountDisplay.className = 'tf-days-count';

		const updateDaysCount = () => {
			const start = new Date(startDateInput.value);
			const end = new Date(endDateInput.value);
			if (start && end && end >= start) {
				const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
				daysCountDisplay.textContent = `${days} ${days === 1 ? t('units.day') : t('units.days')}`;
			} else {
				daysCountDisplay.textContent = t('validation.invalidDateRange') || 'Invalid date range';
			}
		};
		updateDaysCount();
		startDateInput.addEventListener('change', updateDaysCount);
		endDateInput.addEventListener('change', updateDaysCount);

		dateRangeContainer.appendChild(daysCountDisplay);
		multiDayContainer.appendChild(dateRangeContainer);

		// Toggle date range inputs based on multi-day checkbox
		const updateMultiDayVisibility = () => {
			const isMultiDay = multiDayCheckbox.checked;
			if (isMultiDay) {
				dateDisplay.addClass('tf-hidden');
				dateRangeContainer.removeClass('tf-hidden');
			} else {
				dateDisplay.removeClass('tf-hidden');
				dateRangeContainer.addClass('tf-hidden');
			}
		};
		multiDayCheckbox.addEventListener('change', updateMultiDayVisibility);

		content.appendChild(multiDayContainer);

		// Day type selection
		const typeLabel = document.createElement('div');
		typeLabel.textContent = t('modals.dayType');
		typeLabel.className = 'tf-label-bold-mb';
		content.appendChild(typeLabel);

		// Build day types from special day behaviors (exclude work types like 'jobb')
		const dayTypes = this.settings.specialDayBehaviors
			.filter(behavior => !behavior.isWorkType)
			.map(behavior => ({
				type: behavior.id,
				label: `${behavior.icon} ${translateSpecialDayName(behavior.id, behavior.label)}`
			}));

		const typeSelect = document.createElement('select');
		typeSelect.className = 'tf-select-full';

		dayTypes.forEach(({ type, label }) => {
			const option = document.createElement('option');
			option.value = type;
			option.textContent = label;
			typeSelect.appendChild(option);
		});
		content.appendChild(typeSelect);

		// Helper to check if type uses reduce_goal (sick day types)
		const isReduceGoalType = (typeId: string): boolean => {
			const behavior = this.settings.specialDayBehaviors.find(b => b.id === typeId);
			return behavior?.flextimeEffect === 'reduce_goal';
		};

		// Time range fields (for avspasering)
		const timeContainer = document.createElement('div');
		timeContainer.className = 'tf-mb-15 tf-hidden';

		const timeLabel = document.createElement('div');
		timeLabel.textContent = 'Tidsperiode:';
		timeLabel.className = 'tf-label-bold-mb';
		timeContainer.appendChild(timeLabel);

		// Time inputs row
		const timeInputRow = document.createElement('div');
		timeInputRow.className = 'tf-time-input-row';

		const fromLabel = document.createElement('span');
		fromLabel.textContent = 'Fra:';
		timeInputRow.appendChild(fromLabel);

		// Default to end of workday
		const workdayHours = this.settings.baseWorkday * this.settings.workPercent;
		const defaultEndHour = 8 + workdayHours; // Assuming 08:00 start
		const endH = Math.floor(defaultEndHour);
		const endM = Math.round((defaultEndHour - endH) * 60);
		const defaultEndTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

		const fromTimeInput = this.createTimeInput('08:00', () => {});
		fromTimeInput.className = 'tf-time-input-styled';
		timeInputRow.appendChild(fromTimeInput);

		const toLabel = document.createElement('span');
		toLabel.textContent = 'Til:';
		timeInputRow.appendChild(toLabel);

		const toTimeInput = this.createTimeInput(defaultEndTime, () => {});
		toTimeInput.className = 'tf-time-input-styled';
		timeInputRow.appendChild(toTimeInput);

		timeContainer.appendChild(timeInputRow);

		// Duration display for avspasering
		const durationDisplay = document.createElement('div');
		durationDisplay.className = 'tf-duration-display';

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

		// Time range container (for reduce_goal types like sick days)
		const sickTimeContainer = document.createElement('div');
		sickTimeContainer.className = 'tf-mb-15 tf-hidden';

		const sickTimeLabel = document.createElement('div');
		sickTimeLabel.textContent = t('modals.timePeriod') || 'Tidsperiode:';
		sickTimeLabel.className = 'tf-label-bold-mb';
		sickTimeContainer.appendChild(sickTimeLabel);

		// Time inputs row for sick days
		const sickTimeInputRow = document.createElement('div');
		sickTimeInputRow.className = 'tf-time-input-row';

		const sickFromLabel = document.createElement('span');
		sickFromLabel.textContent = t('modals.from') || 'Fra:';
		sickTimeInputRow.appendChild(sickFromLabel);

		// Find work entries for the selected date to auto-fill sick time
		const sickDateStr = Utils.toLocalDateStr(dateObj);
		let autoSickFromTime = '14:00'; // Default if no work entry found
		let autoSickToTime = defaultEndTime;

		// Check for work entries on this date
		const workEntries = this.timerManager.data.entries.filter(entry => {
			if (!entry.endTime) return false;
			const entryDate = Utils.toLocalDateStr(new Date(entry.startTime || ''));
			// Check if it's a work type (not a special day like ferie, egenmelding)
			const behavior = this.settings.specialDayBehaviors?.find(b => b.id === entry.name.toLowerCase());
			const isWorkType = behavior?.isWorkType || entry.name.toLowerCase() === 'jobb';
			return entryDate === sickDateStr && isWorkType;
		});

		if (workEntries.length > 0) {
			// Calculate total worked hours and find earliest start time
			let totalWorkedHours = 0;
			let earliestStartTime = new Date();
			let latestEndTime = new Date(0);

			for (const entry of workEntries) {
				const startDate = new Date(entry.startTime!);
				const endDate = new Date(entry.endTime!);
				totalWorkedHours += (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);

				if (startDate < earliestStartTime) {
					earliestStartTime = startDate;
				}
				if (endDate > latestEndTime) {
					latestEndTime = endDate;
				}
			}

			// Set sick time from end of work
			const endH = latestEndTime.getHours();
			const endM = latestEndTime.getMinutes();
			autoSickFromTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

			// Calculate remaining time needed to reach daily goal
			const dailyGoal = this.settings.baseWorkday * this.settings.workPercent;
			const remainingHours = Math.max(0, dailyGoal - totalWorkedHours);

			if (remainingHours > 0) {
				// Set end time to cover the remaining hours
				const sickEndDate = new Date(latestEndTime.getTime() + remainingHours * 60 * 60 * 1000);
				const sickEndH = sickEndDate.getHours();
				const sickEndM = sickEndDate.getMinutes();
				autoSickToTime = `${sickEndH.toString().padStart(2, '0')}:${sickEndM.toString().padStart(2, '0')}`;
			}
		}

		const sickFromTimeInput = this.createTimeInput(autoSickFromTime, () => {});
		sickFromTimeInput.className = 'tf-time-input-styled';
		sickTimeInputRow.appendChild(sickFromTimeInput);

		const sickToLabel = document.createElement('span');
		sickToLabel.textContent = t('modals.to') || 'Til:';
		sickTimeInputRow.appendChild(sickToLabel);

		const sickToTimeInput = this.createTimeInput(autoSickToTime, () => {});
		sickToTimeInput.className = 'tf-time-input-styled';
		sickTimeInputRow.appendChild(sickToTimeInput);

		sickTimeContainer.appendChild(sickTimeInputRow);

		// Duration display for sick days
		const sickDurationDisplay = document.createElement('div');
		sickDurationDisplay.className = 'tf-duration-display';

		const updateSickDuration = () => {
			const from = sickFromTimeInput.value;
			const to = sickToTimeInput.value;
			if (from && to) {
				const [fH, fM] = from.split(':').map(Number);
				const [tH, tM] = to.split(':').map(Number);
				const hours = (tH + tM/60) - (fH + fM/60);
				if (hours > 0) {
					sickDurationDisplay.textContent = `${t('ui.duration') || 'Varighet'}: ${hours.toFixed(1)} ${this.settings.hourUnit || 't'}`;
				} else if (hours === 0) {
					sickDurationDisplay.textContent = t('modals.fullDayHint') || 'La stå tom for hel dag';
				} else {
					sickDurationDisplay.textContent = t('validation.invalidTimePeriod') || 'Ugyldig tidsperiode';
				}
			}
		};
		updateSickDuration();
		sickFromTimeInput.addEventListener('change', updateSickDuration);
		sickToTimeInput.addEventListener('change', updateSickDuration);

		sickTimeContainer.appendChild(sickDurationDisplay);

		// Full day checkbox
		const fullDayRow = document.createElement('div');
		fullDayRow.className = 'tf-checkbox-row-mt';

		const fullDayCheckbox = document.createElement('input');
		fullDayCheckbox.type = 'checkbox';
		fullDayCheckbox.id = 'fullDayCheckbox';
		// If there are work entries for the day, default to partial sick day
		fullDayCheckbox.checked = workEntries.length === 0;
		fullDayRow.appendChild(fullDayCheckbox);

		const fullDayLabel = document.createElement('label');
		fullDayLabel.htmlFor = 'fullDayCheckbox';
		fullDayLabel.textContent = t('ui.fullDay') || 'Hel dag';
		fullDayLabel.className = 'tf-cursor-pointer';
		fullDayRow.appendChild(fullDayLabel);

		sickTimeContainer.appendChild(fullDayRow);

		// Toggle time inputs based on full day checkbox
		const updateSickTimeInputs = () => {
			const isFullDay = fullDayCheckbox.checked;
			if (isFullDay) {
				sickTimeInputRow.addClass('tf-hidden');
				sickDurationDisplay.addClass('tf-hidden');
			} else {
				sickTimeInputRow.removeClass('tf-hidden');
				sickDurationDisplay.removeClass('tf-hidden');
			}
		};
		fullDayCheckbox.addEventListener('change', updateSickTimeInputs);
		updateSickTimeInputs();

		content.appendChild(sickTimeContainer);

		// Annet (Other) container - shown only when annet type is selected
		const annetContainer = document.createElement('div');
		annetContainer.className = 'tf-mb-15 tf-hidden';

		// Template selector
		const annetTemplateLabel = document.createElement('div');
		annetTemplateLabel.textContent = t('annet.selectTemplate');
		annetTemplateLabel.className = 'tf-label-bold-mb-8';
		annetContainer.appendChild(annetTemplateLabel);

		// Template buttons container
		const annetTemplateButtons = document.createElement('div');
		annetTemplateButtons.className = 'tf-template-btn-container';

		let selectedAnnetTemplate: string | null = null;

		// Create template buttons
		const annetTemplates = this.settings.annetTemplates || [];
		// We'll store button references to update them after saveAsTemplateContainer is created
		const templateButtonRefs: HTMLButtonElement[] = [];
		annetTemplates.forEach(template => {
			const btn = document.createElement('button');
			btn.textContent = `${template.icon} ${translateAnnetTemplateName(template.id, template.label)}`;
			btn.className = 'tf-template-btn';
			btn.dataset.templateId = template.id;
			templateButtonRefs.push(btn);
			annetTemplateButtons.appendChild(btn);
		});

		// Custom/Egendefinert button
		const customBtn = document.createElement('button');
		customBtn.textContent = `📋 ${t('annet.custom')}`;
		customBtn.className = 'tf-template-btn';
		customBtn.onclick = () => {
			// Deselect all buttons
			annetTemplateButtons.querySelectorAll('button').forEach(b => {
				b.classList.remove('mod-cta');
			});
			// Select this button
			customBtn.classList.add('mod-cta');
			selectedAnnetTemplate = null; // Custom entry
			// Show save as template section
			saveAsTemplateContainer.removeClass('tf-hidden');
		};
		annetTemplateButtons.appendChild(customBtn);

		annetContainer.appendChild(annetTemplateButtons);

		// Custom entry section (shown only when custom is selected)
		const saveAsTemplateContainer = document.createElement('div');
		saveAsTemplateContainer.className = 'tf-save-template-container tf-hidden';

		// Name row (always visible when custom is selected)
		const templateNameRow = document.createElement('div');
		templateNameRow.className = 'tf-flex-input-row';

		const templateNameLabel = document.createElement('span');
		templateNameLabel.textContent = t('annet.templateName') + ':';
		templateNameLabel.className = 'tf-date-label';
		templateNameRow.appendChild(templateNameLabel);

		const templateNameInput = document.createElement('input');
		templateNameInput.type = 'text';
		templateNameInput.className = 'tf-input-grow';
		templateNameInput.placeholder = t('annet.labelPlaceholder');
		templateNameRow.appendChild(templateNameInput);

		saveAsTemplateContainer.appendChild(templateNameRow);

		// Icon row (always visible when custom is selected)
		const templateIconRow = document.createElement('div');
		templateIconRow.className = 'tf-flex-input-row';

		const templateIconLabel = document.createElement('span');
		templateIconLabel.textContent = t('annet.templateIcon') + ':';
		templateIconLabel.className = 'tf-date-label';
		templateIconRow.appendChild(templateIconLabel);

		const templateIconInput = document.createElement('input');
		templateIconInput.type = 'text';
		templateIconInput.className = 'tf-icon-input';
		templateIconInput.placeholder = '🏥';
		templateIconRow.appendChild(templateIconInput);

		saveAsTemplateContainer.appendChild(templateIconRow);

		// Save as template checkbox row
		const saveAsTemplateRow = document.createElement('div');
		saveAsTemplateRow.className = 'tf-save-template-row';

		const saveAsTemplateCheckbox = document.createElement('input');
		saveAsTemplateCheckbox.type = 'checkbox';
		saveAsTemplateCheckbox.id = 'saveAsTemplateCheckbox';
		saveAsTemplateRow.appendChild(saveAsTemplateCheckbox);

		const saveAsTemplateLabel = document.createElement('label');
		saveAsTemplateLabel.htmlFor = 'saveAsTemplateCheckbox';
		saveAsTemplateLabel.textContent = t('annet.saveAsTemplate');
		saveAsTemplateLabel.className = 'tf-cursor-pointer';
		saveAsTemplateRow.appendChild(saveAsTemplateLabel);

		saveAsTemplateContainer.appendChild(saveAsTemplateRow);

		annetContainer.appendChild(saveAsTemplateContainer);

		// Now set up onclick handlers for template buttons (after saveAsTemplateContainer exists)
		templateButtonRefs.forEach(btn => {
			const templateId = btn.dataset.templateId;
			btn.onclick = () => {
				// Deselect all buttons
				annetTemplateButtons.querySelectorAll('button').forEach(b => {
					b.classList.remove('mod-cta');
				});
				// Select this button
				btn.classList.add('mod-cta');
				selectedAnnetTemplate = templateId || null;
				// Hide custom entry section
				saveAsTemplateContainer.addClass('tf-hidden');
				saveAsTemplateCheckbox.checked = false;
				// Clear custom fields
				templateNameInput.value = '';
				templateIconInput.value = '';
			};
		});

		// Full day toggle for annet
		const annetFullDayRow = document.createElement('div');
		annetFullDayRow.className = 'tf-checkbox-row-mb';

		const annetFullDayCheckbox = document.createElement('input');
		annetFullDayCheckbox.type = 'checkbox';
		annetFullDayCheckbox.id = 'annetFullDayCheckbox';
		annetFullDayCheckbox.checked = true;
		annetFullDayRow.appendChild(annetFullDayCheckbox);

		const annetFullDayLabel = document.createElement('label');
		annetFullDayLabel.htmlFor = 'annetFullDayCheckbox';
		annetFullDayLabel.textContent = t('annet.fullDay');
		annetFullDayLabel.className = 'tf-cursor-pointer';
		annetFullDayRow.appendChild(annetFullDayLabel);

		annetContainer.appendChild(annetFullDayRow);

		// Time inputs for partial day annet
		const annetTimeInputRow = document.createElement('div');
		annetTimeInputRow.className = 'tf-time-input-row tf-mb-12 tf-hidden';

		const annetFromLabel = document.createElement('span');
		annetFromLabel.textContent = t('annet.fromTime') + ':';
		annetTimeInputRow.appendChild(annetFromLabel);

		const annetFromTimeInput = this.createTimeInput('09:00', () => {});
		annetFromTimeInput.className = 'tf-time-input-styled';
		annetTimeInputRow.appendChild(annetFromTimeInput);

		const annetToLabel = document.createElement('span');
		annetToLabel.textContent = t('annet.toTime') + ':';
		annetTimeInputRow.appendChild(annetToLabel);

		const annetToTimeInput = this.createTimeInput('11:00', () => {});
		annetToTimeInput.className = 'tf-time-input-styled';
		annetTimeInputRow.appendChild(annetToTimeInput);

		annetContainer.appendChild(annetTimeInputRow);

		// Duration display for annet
		const annetDurationDisplay = document.createElement('div');
		annetDurationDisplay.className = 'tf-duration-display-mb tf-hidden';

		const updateAnnetDuration = () => {
			const from = annetFromTimeInput.value;
			const to = annetToTimeInput.value;
			if (from && to) {
				const [fH, fM] = from.split(':').map(Number);
				const [tH, tM] = to.split(':').map(Number);
				const hours = (tH + tM/60) - (fH + fM/60);
				if (hours > 0) {
					annetDurationDisplay.textContent = `${t('modals.duration') || 'Varighet'}: ${hours.toFixed(1)} ${t('units.hours') || 'timer'}`;
				} else {
					annetDurationDisplay.textContent = t('validation.invalidTimePeriod') || 'Ugyldig tidsperiode';
				}
			}
		};
		updateAnnetDuration();
		annetFromTimeInput.addEventListener('change', updateAnnetDuration);
		annetToTimeInput.addEventListener('change', updateAnnetDuration);

		annetContainer.appendChild(annetDurationDisplay);

		// Toggle time inputs based on full day checkbox
		const updateAnnetTimeInputs = () => {
			const isFullDay = annetFullDayCheckbox.checked;
			if (isFullDay) {
				annetTimeInputRow.addClass('tf-hidden');
				annetDurationDisplay.addClass('tf-hidden');
			} else {
				annetTimeInputRow.removeClass('tf-hidden');
				annetDurationDisplay.removeClass('tf-hidden');
			}
		};
		annetFullDayCheckbox.addEventListener('change', updateAnnetTimeInputs);
		updateAnnetTimeInputs();

		content.appendChild(annetContainer);

		// Note/comment field
		const noteLabel = document.createElement('div');
		noteLabel.textContent = t('modals.commentOptional');
		noteLabel.className = 'tf-label-bold-mb';
		content.appendChild(noteLabel);

		const noteInput = document.createElement('input');
		noteInput.type = 'text';
		noteInput.className = 'tf-text-input-full';
		content.appendChild(noteInput);

		// Helper to get placeholder for absence type
		const getPlaceholderForType = (type: string): string => {
			const placeholders = t('modals.commentPlaceholders') as unknown as Record<string, string>;
			return placeholders[type] || placeholders['default'] || t('modals.commentPlaceholder');
		};

		// Show/hide time fields and update placeholder based on type selection
		const updateFieldVisibility = () => {
			const selectedType = typeSelect.value;
			// Toggle visibility of containers
			if (selectedType === 'avspasering') {
				timeContainer.removeClass('tf-hidden');
			} else {
				timeContainer.addClass('tf-hidden');
			}
			// Exclude annet from sick time container - annet has its own UI
			if (isReduceGoalType(selectedType) && selectedType !== 'annet') {
				sickTimeContainer.removeClass('tf-hidden');
			} else {
				sickTimeContainer.addClass('tf-hidden');
			}
			if (selectedType === 'annet') {
				annetContainer.removeClass('tf-hidden');
			} else {
				annetContainer.addClass('tf-hidden');
			}
			// Hide multi-day option for annet (Other) type - it has its own single-day UI
			if (selectedType === 'annet') {
				multiDayContainer.addClass('tf-hidden');
			} else {
				multiDayContainer.removeClass('tf-hidden');
			}
			// Reset multi-day checkbox when switching to annet
			if (selectedType === 'annet') {
				multiDayCheckbox.checked = false;
				updateMultiDayVisibility();
			}
			noteInput.placeholder = getPlaceholderForType(selectedType);
		};
		typeSelect.addEventListener('change', updateFieldVisibility);
		updateFieldVisibility(); // Initial update

		// Buttons
		const buttonDiv = document.createElement('div');
		buttonDiv.className = 'tf-btn-container';

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => { this.isModalOpen = false; modal.remove(); };
		buttonDiv.appendChild(cancelBtn);

		const addBtn = document.createElement('button');
		addBtn.textContent = t('buttons.add');
		addBtn.className = 'mod-cta';
		addBtn.onclick = async () => {
			const dayType = typeSelect.value;
			const note = noteInput.value.trim();
			const startTime = dayType === 'avspasering' ? fromTimeInput.value : undefined;
			const endTime = dayType === 'avspasering' ? toTimeInput.value : undefined;

			// Handle annet type with templates and full/partial day
			if (dayType === 'annet') {
				const isFullDay = annetFullDayCheckbox.checked;
				let templateId = selectedAnnetTemplate; // Can be null for custom
				let entryDescription = note;

				// Handle custom entry (when no template is selected)
				if (selectedAnnetTemplate === null) {
					const customName = templateNameInput.value.trim();
					const customIcon = templateIconInput.value.trim() || '📋';

					// Check if user wants to save as template
					if (saveAsTemplateCheckbox.checked) {
						if (!customName) {
							new Notice(`❌ ${t('annet.labelRequired')}`);
							return;
						}

						// Generate ID from name (lowercase, no spaces)
						const newTemplateId = customName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

						// Check for duplicate ID
						if (this.settings.annetTemplates.some(tmpl => tmpl.id === newTemplateId)) {
							new Notice(`❌ ${t('annet.duplicateId')}`);
							return;
						}

						// Save new template
						this.settings.annetTemplates.push({
							id: newTemplateId,
							label: customName,
							icon: customIcon
						});
						await this.plugin.saveSettings();
						new Notice(`✅ ${t('annet.addTemplate')}: ${customIcon} ${customName}`);

						// Use the new template ID for this entry
						templateId = newTemplateId;
					} else if (customName) {
						// Not saving as template, but user provided name/icon - include in description
						const prefix = `${customIcon} ${customName}`;
						entryDescription = note ? `${prefix}: ${note}` : prefix;
					}
				}

				if (!isFullDay) {
					// Partial day - add with time range
					const from = annetFromTimeInput.value;
					const to = annetToTimeInput.value;
					const [fH, fM] = from.split(':').map(Number);
					const [tH, tM] = to.split(':').map(Number);
					const hours = (tH + tM/60) - (fH + fM/60);

					if (hours <= 0) {
						new Notice(`❌ ${t('validation.invalidTimePeriod') || 'Ugyldig tidsperiode'}`);
						return;
					}

					// Format: annet:templateId:HH:MM-HH:MM: description (or annet:HH:MM-HH:MM: for custom)
					await this.addAnnetEntry(dateObj, templateId, from, to, entryDescription);
				} else {
					// Full day - format: annet:templateId: description (or annet: for custom)
					await this.addAnnetEntry(dateObj, templateId, null, null, entryDescription);
				}
			} else if (isReduceGoalType(dayType)) {
				// Handle reduce_goal types (sick days) with duration
				const isFullDay = fullDayCheckbox.checked;

				if (!isFullDay) {
					// Calculate duration from time inputs
					const from = sickFromTimeInput.value;
					const to = sickToTimeInput.value;
					const [fH, fM] = from.split(':').map(Number);
					const [tH, tM] = to.split(':').map(Number);
					const sickHours = (tH + tM/60) - (fH + fM/60);

					if (sickHours > 0) {
						// Create a time entry for the partial sick day using the actual times
						const entryStartDate = new Date(dateObj);
						entryStartDate.setHours(fH, fM, 0, 0);
						const entryEndDate = new Date(dateObj);
						entryEndDate.setHours(tH, tM, 0, 0);

						this.timerManager.data.entries.push({
							name: dayType,
							startTime: Utils.toLocalISOString(entryStartDate),
							endTime: Utils.toLocalISOString(entryEndDate),
							subEntries: null
						});
						await this.saveWithErrorHandling();
						new Notice(`✅ ${translateSpecialDayName(dayType)}: ${sickHours.toFixed(1)}${this.settings.hourUnit || 't'} for ${Utils.toLocalDateStr(dateObj)}`);
						this.plugin.timerManager.onTimerChange?.();
					} else {
						new Notice(`❌ ${t('validation.invalidTimePeriod') || 'Ugyldig tidsperiode'}`);
						return;
					}
				} else {
					// Full day - add to holidays.md
					await this.addSpecialDay(dateObj, dayType, note);
				}
			} else {
				// Regular special day (ferie, avspasering, etc.)
				// Check if multi-day is enabled
				if (multiDayCheckbox.checked) {
					const startDate = new Date(startDateInput.value);
					const endDate = new Date(endDateInput.value);

					if (endDate < startDate) {
						new Notice(`❌ ${t('validation.invalidDateRange') || 'Invalid date range'}`);
						return;
					}

					// Loop through each day in the range and create entries
					// Skip weekends (unless they are configured as work days)
					const currentDate = new Date(startDate);
					let daysAdded = 0;
					while (currentDate <= endDate) {
						// Only add if it's a work day (not a weekend)
						if (!Utils.isWeekend(currentDate, this.settings)) {
							await this.addSpecialDay(new Date(currentDate), dayType, note, startTime, endTime);
							daysAdded++;
						}
						currentDate.setDate(currentDate.getDate() + 1);
					}

					const behavior = this.settings.specialDayBehaviors.find(b => b.id === dayType);
					const typeName = behavior ? translateSpecialDayName(behavior.id, behavior.label) : dayType;
					new Notice(`✅ ${typeName}: ${daysAdded} ${daysAdded === 1 ? t('units.day') : t('units.days')}`);
				} else {
					// Single day entry (existing behavior)
					await this.addSpecialDay(dateObj, dayType, note, startTime, endTime);
				}
			}

			this.isModalOpen = false;
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
			const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));

			if (!file || !(file instanceof TFile)) {
				new Notice(`❌ ${t('notifications.fileNotFound').replace('{path}', filePath)}`);
				return;
			}

			// Format the date as YYYY-MM-DD
			const year = dateObj.getFullYear();
			const month = String(dateObj.getMonth() + 1).padStart(2, '0');
			const day = String(dateObj.getDate()).padStart(2, '0');
			const dateStr = `${year}-${month}-${day}`;

			// Read the file content
			let content = await this.app.vault.read(file);

			// Find the "Planlagte egne fridager" section
			const sectionMarker = '## Planlagte egne fridager';
			const sectionIndex = content.indexOf(sectionMarker);

			if (sectionIndex === -1) {
				new Notice(`❌ ${t('notifications.sectionNotFound')}`);
				return;
			}

			// Find the code block after the section
			const codeBlockStart = content.indexOf('```', sectionIndex);
			const codeBlockEnd = content.indexOf('```', codeBlockStart + 3);

			if (codeBlockStart === -1 || codeBlockEnd === -1) {
				new Notice(`❌ ${t('notifications.codeBlockNotFound')}`);
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
			await this.app.vault.modify(file, content);

			// Get the label for the day type
			const label = translateSpecialDayName(dayType);
			new Notice(`✅ ${t('notifications.added')} ${dateStr} (${label})`);

			// Reload holidays to pick up the new entry
			await this.data.loadHolidays();

			// Refresh the dashboard to show the special day
			this.updateMonthCard();
		} catch (error) {
			console.error('Failed to add special day:', error);
			new Notice(`❌ ${t('notifications.errorAddingSpecialDay')}`);
		}
	}

	/**
	 * Add an annet (other) entry to the holidays file
	 * Format: - YYYY-MM-DD: annet:templateId:HH:MM-HH:MM: description
	 *    or:  - YYYY-MM-DD: annet:templateId: description (full day)
	 *    or:  - YYYY-MM-DD: annet:HH:MM-HH:MM: description (partial, no template)
	 *    or:  - YYYY-MM-DD: annet: description (full day, no template)
	 */
	async addAnnetEntry(dateObj: Date, templateId: string | null, startTime: string | null, endTime: string | null, note: string): Promise<void> {
		try {
			const filePath = this.settings.holidaysFilePath;
			const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));

			if (!file || !(file instanceof TFile)) {
				new Notice(`❌ ${t('notifications.fileNotFound').replace('{path}', filePath)}`);
				return;
			}

			// Format the date as YYYY-MM-DD
			const year = dateObj.getFullYear();
			const month = String(dateObj.getMonth() + 1).padStart(2, '0');
			const day = String(dateObj.getDate()).padStart(2, '0');
			const dateStr = `${year}-${month}-${day}`;

			// Read the file content
			let content = await this.app.vault.read(file);

			// Find the "Planlagte egne fridager" section
			const sectionMarker = '## Planlagte egne fridager';
			const sectionIndex = content.indexOf(sectionMarker);

			if (sectionIndex === -1) {
				new Notice(`❌ ${t('notifications.sectionNotFound')}`);
				return;
			}

			// Find the code block after the section
			const codeBlockStart = content.indexOf('```', sectionIndex);
			const codeBlockEnd = content.indexOf('```', codeBlockStart + 3);

			if (codeBlockStart === -1 || codeBlockEnd === -1) {
				new Notice(`❌ ${t('notifications.codeBlockNotFound')}`);
				return;
			}

			// Build the annet entry string
			// Format: annet:templateId:HH:MM-HH:MM (with time) or annet:templateId (full day)
			let annetType = 'annet';
			if (templateId) {
				annetType += `:${templateId}`;
			}
			if (startTime && endTime) {
				annetType += `:${startTime}-${endTime}`;
			}

			const newEntry = `- ${dateStr}: ${annetType}: ${note}`;

			// Insert the new line at the end of the code block, before the closing ```
			const beforeClosing = content.substring(0, codeBlockEnd);
			const afterClosing = content.substring(codeBlockEnd);

			// Add newline if needed
			const needsNewline = !beforeClosing.endsWith('\n');
			content = beforeClosing + (needsNewline ? '\n' : '') + newEntry + '\n' + afterClosing;

			// Write back to file
			await this.app.vault.modify(file, content);

			// Get the label for display
			let label = t('annet.title');
			if (templateId) {
				const template = this.settings.annetTemplates.find(t => t.id === templateId);
				if (template) {
					label = `${template.icon} ${translateAnnetTemplateName(template.id, template.label)}`;
				}
			}

			if (startTime && endTime) {
				new Notice(`✅ ${t('notifications.added')} ${dateStr} (${label} ${startTime}-${endTime})`);
			} else {
				new Notice(`✅ ${t('notifications.added')} ${dateStr} (${label})`);
			}

			// Reload holidays to pick up the new entry
			await this.data.loadHolidays();

			// Refresh the dashboard to show the special day
			this.updateMonthCard();
		} catch (error) {
			console.error('Failed to add annet entry:', error);
			new Notice(`❌ ${t('notifications.errorAddingSpecialDay')}`);
		}
	}

	/**
	 * Show modal to edit or delete an existing planned day
	 */
	showEditPlannedDayModal(dateObj: Date, plannedInfo: HolidayInfo): void {
		const dateStr = Utils.toLocalDateStr(dateObj);
		this.isModalOpen = true;

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim tf-modal-z1000';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => { this.isModalOpen = false; modal.remove(); };
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal tf-modal-content-400';

		// Prevent Obsidian from capturing keyboard events
		modalContent.addEventListener('keydown', (e) => e.stopPropagation());
		modalContent.addEventListener('keyup', (e) => e.stopPropagation());
		modalContent.addEventListener('keypress', (e) => e.stopPropagation());
		modalContent.addEventListener('beforeinput', (e) => e.stopPropagation());
		modalContent.addEventListener('input', (e) => e.stopPropagation());

		// Title
		const title = document.createElement('div');
		title.className = 'modal-title';
		const emoji = Utils.getEmoji({ name: plannedInfo.type, date: dateObj });
		let typeName = translateSpecialDayName(plannedInfo.type);
		if (plannedInfo.type === 'annet' && plannedInfo.annetTemplateId) {
			const template = this.settings.annetTemplates?.find(tmpl => tmpl.id === plannedInfo.annetTemplateId);
			if (template) {
				typeName = translateAnnetTemplateName(template.id, template.label);
			}
		}
		title.textContent = `${t('menu.editPlannedDay')} ${emoji} ${typeName}`;
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content tf-modal-content-padded';

		// Date display
		const dateDisplay = document.createElement('div');
		dateDisplay.textContent = `${t('ui.date')}: ${dateStr}`;
		dateDisplay.className = 'tf-date-display';
		content.appendChild(dateDisplay);

		// Type display (read-only)
		const typeDisplay = document.createElement('div');
		typeDisplay.className = 'tf-type-display';
		const typeLabel = document.createElement('strong');
		typeLabel.textContent = `${t('ui.type')}:`;
		typeDisplay.appendChild(typeLabel);
		typeDisplay.appendText(` ${emoji} ${typeName}`);
		if (plannedInfo.halfDay) {
			typeDisplay.appendText(' (½)');
		}
		content.appendChild(typeDisplay);

		// Time display (if applicable)
		if (plannedInfo.startTime && plannedInfo.endTime) {
			const timeDisplay = document.createElement('div');
			timeDisplay.className = 'tf-mb-15';
			const timeLabel = document.createElement('strong');
			timeLabel.textContent = `${t('ui.start')} - ${t('ui.end')}:`;
			timeDisplay.appendChild(timeLabel);
			timeDisplay.appendText(` ${plannedInfo.startTime} - ${plannedInfo.endTime}`);
			content.appendChild(timeDisplay);
		}

		// Description input
		const descRow = document.createElement('div');
		descRow.className = 'tf-desc-row';

		const descLabel = document.createElement('label');
		descLabel.textContent = `${t('ui.comment')} (${t('ui.optional')}):`;
		descLabel.className = 'tf-label-block';
		descRow.appendChild(descLabel);

		const descInput = document.createElement('input');
		descInput.type = 'text';
		descInput.value = plannedInfo.description || '';
		descInput.className = 'tf-input-full';
		descRow.appendChild(descInput);

		content.appendChild(descRow);

		// Button container
		const buttonDiv = document.createElement('div');
		buttonDiv.className = 'tf-btn-space-between';

		// Delete button (left side)
		const deleteBtn = document.createElement('button');
		deleteBtn.textContent = `🗑️ ${t('buttons.delete')}`;
		deleteBtn.className = 'mod-warning tf-delete-btn';
		deleteBtn.onclick = () => {
			// Confirm deletion
			this.showConfirmDialog(t('confirm.deleteEntry'), async () => {
				await this.deletePlannedDay(dateStr);
				this.isModalOpen = false;
				modal.remove();
			});
		};
		buttonDiv.appendChild(deleteBtn);

		// Right side buttons
		const rightButtons = document.createElement('div');
		rightButtons.className = "tf-flex tf-gap-10";

		// Cancel button
		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => {
			this.isModalOpen = false;
			modal.remove();
		};
		rightButtons.appendChild(cancelBtn);

		// Save button
		const saveBtn = document.createElement('button');
		saveBtn.textContent = t('buttons.save');
		saveBtn.className = 'mod-cta';
		saveBtn.onclick = async () => {
			const newDescription = descInput.value.trim();
			await this.updatePlannedDayDescription(dateStr, newDescription);
			this.isModalOpen = false;
			modal.remove();
		};
		rightButtons.appendChild(saveBtn);

		buttonDiv.appendChild(rightButtons);
		content.appendChild(buttonDiv);

		modalContent.appendChild(content);
		modal.appendChild(modalContent);
		document.body.appendChild(modal);

		descInput.focus();
	}

	/**
	 * Delete a planned day entry from the holidays file
	 */
	async deletePlannedDay(dateStr: string): Promise<void> {
		try {
			const filePath = this.settings.holidaysFilePath;
			const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));

			if (!file || !(file instanceof TFile)) {
				new Notice(`❌ ${t('notifications.fileNotFound').replace('{path}', filePath)}`);
				return;
			}

			let content = await this.app.vault.read(file);

			// Find the "Planlagte egne fridager" section
			const sectionMarker = '## Planlagte egne fridager';
			const sectionIndex = content.indexOf(sectionMarker);

			if (sectionIndex === -1) {
				new Notice(`❌ ${t('notifications.sectionNotFound')}`);
				return;
			}

			// Find the code block after the section
			const codeBlockStart = content.indexOf('```', sectionIndex);
			const codeBlockEnd = content.indexOf('```', codeBlockStart + 3);

			if (codeBlockStart === -1 || codeBlockEnd === -1) {
				new Notice(`❌ ${t('notifications.codeBlockNotFound')}`);
				return;
			}

			// Get the code block content
			const codeBlockContent = content.substring(codeBlockStart, codeBlockEnd + 3);

			// Find and remove the line with this date
			const lines = codeBlockContent.split('\n');
			const filteredLines = lines.filter(line => !line.includes(`- ${dateStr}:`));

			if (filteredLines.length === lines.length) {
				// No line was removed, entry not found
				new Notice(`❌ Entry not found for ${dateStr}`);
				return;
			}

			// Replace the code block with the filtered content
			const newCodeBlock = filteredLines.join('\n');
			content = content.substring(0, codeBlockStart) + newCodeBlock + content.substring(codeBlockEnd + 3);

			await this.app.vault.modify(file, content);
			new Notice(`✅ ${t('notifications.deleted')} ${dateStr}`);

			// Reload holidays and refresh all UI
			await this.data.loadHolidays();
			this.data.processEntries();
			this.updateMonthCard();
			this.updateStatsCard();
			this.updateWeekCard();
			this.updateDayCard();
		} catch (error) {
			console.error('Failed to delete planned day:', error);
			new Notice(`❌ ${t('notifications.errorDeletingEntry')}`);
		}
	}

	/**
	 * Update the description of a planned day entry
	 */
	async updatePlannedDayDescription(dateStr: string, newDescription: string): Promise<void> {
		try {
			const filePath = this.settings.holidaysFilePath;
			const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));

			if (!file || !(file instanceof TFile)) {
				new Notice(`❌ ${t('notifications.fileNotFound').replace('{path}', filePath)}`);
				return;
			}

			let content = await this.app.vault.read(file);

			// Find the "Planlagte egne fridager" section
			const sectionMarker = '## Planlagte egne fridager';
			const sectionIndex = content.indexOf(sectionMarker);

			if (sectionIndex === -1) {
				new Notice(`❌ ${t('notifications.sectionNotFound')}`);
				return;
			}

			// Find the code block after the section
			const codeBlockStart = content.indexOf('```', sectionIndex);
			const codeBlockEnd = content.indexOf('```', codeBlockStart + 3);

			if (codeBlockStart === -1 || codeBlockEnd === -1) {
				new Notice(`❌ ${t('notifications.codeBlockNotFound')}`);
				return;
			}

			// Get the code block content
			const codeBlockContent = content.substring(codeBlockStart, codeBlockEnd + 3);

			// Find and update the line with this date
			const lines = codeBlockContent.split('\n');
			let updated = false;
			const updatedLines = lines.map(line => {
				if (line.includes(`- ${dateStr}:`)) {
					updated = true;
					// Parse the existing line to preserve the type
					// Format: - YYYY-MM-DD: type:modifiers: description
					const match = line.match(/^- (\d{4}-\d{2}-\d{2}): ([^:]+(?::[^:]+)*): ?(.*)$/);
					if (match) {
						const [, date, typeWithModifiers] = match;
						return `- ${date}: ${typeWithModifiers}: ${newDescription}`;
					}
					return line;
				}
				return line;
			});

			if (!updated) {
				new Notice(`❌ Entry not found for ${dateStr}`);
				return;
			}

			// Replace the code block with the updated content
			const newCodeBlock = updatedLines.join('\n');
			content = content.substring(0, codeBlockStart) + newCodeBlock + content.substring(codeBlockEnd + 3);

			await this.app.vault.modify(file, content);
			new Notice(`✅ ${t('notifications.updated')} ${dateStr}`);

			// Reload holidays and refresh all UI
			await this.data.loadHolidays();
			this.data.processEntries();
			this.updateMonthCard();
			this.updateStatsCard();
			this.updateWeekCard();
			this.updateDayCard();
		} catch (error) {
			console.error('Failed to update planned day:', error);
			new Notice(`❌ ${t('notifications.errorUpdatingEntry')}`);
		}
	}

	async createNoteFromType(dateObj: Date, noteType: NoteType): Promise<void> {
		try {
			const dateStr = Utils.toLocalDateStr(dateObj);
			const weekNum = Utils.getWeekNumber(dateObj);

			let filename = noteType.filenamePattern
				.replace('{YYYY}', dateObj.getFullYear().toString())
				.replace('{MM}', (dateObj.getMonth() + 1).toString().padStart(2, '0'))
				.replace('{DD}', dateObj.getDate().toString().padStart(2, '0'))
				.replace('{WEEK}', weekNum.toString());

			const filePath = normalizePath(`${noteType.folder}/${filename}.md`);

			// Check if file exists
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(existingFile);
				new Notice(t('notifications.openedExistingNote').replace('{filename}', filename));
				return;
			}

			// Create folder if it doesn't exist
			const folderPath = noteType.folder;
			if (!await this.app.vault.adapter.exists(folderPath)) {
				await this.app.vault.createFolder(folderPath);
			}

			// Load template
			let content = '';
			const templateFile = this.app.vault.getAbstractFileByPath(normalizePath(noteType.template));
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
			new Notice(t('notifications.createdNote').replace('{filename}', filename));

		} catch (error) {
			new Notice(t('notifications.errorCreatingNote').replace('{error}', error instanceof Error ? error.message : String(error)));
			console.error('Error creating note:', error);
		}
	}

	refreshHistoryView(container: HTMLElement): void {
		container.empty();

		// Collect active entries separately for display at top
		const activeEntries: TimeEntry[] = [];

		// Build years data structure from daily entries
		const years: Record<string, Record<string, TimeEntry[]>> = {};
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
				// Separate active entries for top display (only in list view)
				if (entry.isActive && this.historyView === 'list') {
					activeEntries.push(entry);
				} else {
					years[year][month].push(entry);
				}
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
			this.renderListView(container, years, activeEntries);
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

		const editToggle = historyCard.querySelector<HTMLElement>('.tf-history-edit-toggle');
		if (!editToggle) return;

		// Only show edit toggle in list view and when wide enough
		const isWide = container.offsetWidth >= 450;
		const isListView = this.historyView === 'list';

		if (isWide && isListView) {
			editToggle.removeClass('tf-hidden');
		} else {
			editToggle.addClass('tf-hidden');
		}

		// Update button text based on current mode
		editToggle.textContent = this.inlineEditMode ? `✓ ${t('buttons.done')}` : `✏️ ${t('buttons.edit')}`;
		editToggle.classList.toggle('active', this.inlineEditMode);
	}

	renderListView(container: HTMLElement, years: Record<string, Record<string, TimeEntry[]>>, activeEntries: TimeEntry[] = []): void {
		// Add filter bar at the top
		this.renderFilterBar(container);

		// Render active entries section at the top if there are any
		if (activeEntries.length > 0) {
			this.renderActiveEntriesSection(container, activeEntries);
		}

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
				if (activeEntries.length > 0) {
					this.renderActiveEntriesSection(container, activeEntries);
				}
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

	renderActiveEntriesSection(container: HTMLElement, activeEntries: TimeEntry[]): void {
		const section = this.createActiveEntriesSection(activeEntries, container);
		container.appendChild(section);
	}

	createActiveEntriesSection(activeEntries: TimeEntry[], containerForWidth?: HTMLElement): HTMLElement {
		const section = document.createElement('div');
		section.className = 'tf-active-entries-section tf-active-section-container';

		const header = document.createElement('div');
		header.className = 'tf-active-section-header';
		header.textContent = `⏱️ ${t('ui.activeTimers')} (${activeEntries.length})`;
		section.appendChild(header);

		// Detect if we're in wide mode
		const isWide = containerForWidth ? containerForWidth.offsetWidth >= 450 : false;

		// Create table for active entries
		const table = document.createElement('table');
		table.className = isWide ? 'tf-history-table-wide tf-w-full' : 'tf-history-table-narrow tf-w-full';

		// Get raw timer entries for matching (needed for inline editing)
		const rawEntries = this.timerManager.data.entries;
		const flatRawEntries: { entry: Timer; parent?: Timer; subIndex?: number }[] = [];
		rawEntries.forEach(entry => {
			if (entry.collapsed && Array.isArray(entry.subEntries)) {
				entry.subEntries.forEach((sub, idx) => {
					if (sub.startTime) {
						flatRawEntries.push({ entry: sub, parent: entry, subIndex: idx });
					}
				});
			} else if (entry.startTime) {
				flatRawEntries.push({ entry });
			}
		});

		// Table header - different columns for wide vs narrow
		const thead = document.createElement('thead');
		const headerRow = document.createElement('tr');
		const headers = isWide
			? (this.inlineEditMode
				? [t('ui.date'), t('ui.type'), t('ui.start'), t('ui.hours'), t('ui.flextime'), '']
				: [t('ui.date'), t('ui.type'), t('ui.start'), t('ui.hours'), t('ui.flextime')])
			: [t('ui.date'), t('ui.type'), t('ui.hours'), ''];
		headers.forEach(h => {
			const th = document.createElement('th');
			th.textContent = h;
			headerRow.appendChild(th);
		});
		thead.appendChild(headerRow);
		table.appendChild(thead);

		// Table body
		const tbody = document.createElement('tbody');
		activeEntries.forEach(e => {
			const row = document.createElement('tr');
			row.className = 'tf-history-row-active';

			const dateStr = e.date ? Utils.toLocalDateStr(e.date) : '';

			// Find matching raw entry for this active entry
			const matchingItem = flatRawEntries.find(item =>
				item.entry.name.toLowerCase() === e.name.toLowerCase() &&
				!item.entry.endTime &&
				Utils.toLocalDateStr(new Date(item.entry.startTime!)) === dateStr
			);
			const matchingRaw = matchingItem?.entry;

			// Date cell
			const dateCell = document.createElement('td');
			const activeIcon = document.createElement('span');
			activeIcon.textContent = '⏱️ ';
			activeIcon.title = t('ui.activeTimer');
			activeIcon.className = 'tf-cursor-help';
			dateCell.appendChild(activeIcon);
			dateCell.appendChild(document.createTextNode(dateStr));
			row.appendChild(dateCell);

			// Type cell - with inline editing in wide mode
			const typeCell = document.createElement('td');
			if (isWide && this.inlineEditMode && matchingRaw) {
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
					await this.saveWithErrorHandling();
					this.plugin.timerManager.onTimerChange?.();
				};
				typeCell.appendChild(select);
			} else {
				typeCell.textContent = translateSpecialDayName(e.name.toLowerCase(), e.name);
			}
			row.appendChild(typeCell);

			// Start time cell (only in wide mode)
			if (isWide) {
				const startCell = document.createElement('td');
				if (matchingRaw?.startTime) {
					const startDate = new Date(matchingRaw.startTime);
					const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;

					if (this.inlineEditMode) {
						const input = this.createTimeInput(startTimeStr, async (newValue) => {
							const parsed = this.parseTimeInput(newValue);
							if (!parsed) return;
							const newStart = new Date(matchingRaw.startTime!);
							newStart.setHours(parsed.hours, parsed.minutes, 0, 0);
							matchingRaw.startTime = Utils.toLocalISOString(newStart);
							await this.saveWithErrorHandling();
							this.plugin.timerManager.onTimerChange?.();
						});
						startCell.appendChild(input);
					} else {
						startCell.textContent = startTimeStr;
					}
				} else {
					startCell.textContent = '-';
				}
				row.appendChild(startCell);
			}

			// Hours cell (running duration)
			const hoursCell = document.createElement('td');
			const hoursText = Utils.formatHoursToHM(e.duration || 0, this.settings.hourUnit);
			hoursCell.textContent = `${hoursText}...`;
			row.appendChild(hoursCell);

			// Flextime cell (only in wide mode)
			if (isWide) {
				const flextimeCell = document.createElement('td');
				flextimeCell.textContent = Utils.formatHoursToHM(e.flextime || 0, this.settings.hourUnit);
				row.appendChild(flextimeCell);
			}

			// Action cell - edit button in narrow, delete in wide edit mode
			if (isWide && this.inlineEditMode) {
				const actionCell = document.createElement('td');
				if (matchingItem) {
					const deleteBtn = document.createElement('button');
					deleteBtn.className = 'tf-history-delete-btn';
					deleteBtn.textContent = '🗑️';
					deleteBtn.title = t('menu.deleteEntry');
					deleteBtn.onclick = () => {
						this.showConfirmDialog(`${t('confirm.deleteEntryFor')} ${dateStr}?`, async () => {
							if (matchingItem.parent && matchingItem.subIndex !== undefined) {
								if (matchingItem.parent.subEntries) {
									matchingItem.parent.subEntries.splice(matchingItem.subIndex, 1);
									if (matchingItem.parent.subEntries.length === 0) {
										const parentIndex = this.timerManager.data.entries.indexOf(matchingItem.parent);
										if (parentIndex > -1) {
											this.timerManager.data.entries.splice(parentIndex, 1);
										}
									}
								}
							} else {
								const entryIndex = this.timerManager.data.entries.indexOf(matchingRaw!);
								if (entryIndex > -1) {
									this.timerManager.data.entries.splice(entryIndex, 1);
								}
							}
							await this.saveWithErrorHandling();
							this.softRefreshHistory();
						});
					};
					actionCell.appendChild(deleteBtn);
				}
				row.appendChild(actionCell);
			} else if (!isWide) {
				// Narrow mode - show edit button
				const actionCell = document.createElement('td');
				const editBtn = document.createElement('button');
				editBtn.textContent = '✏️';
				editBtn.className = 'tf-edit-btn';
				editBtn.title = t('menu.editWork');
				editBtn.onclick = () => {
					if (e.date) {
						this.showEditEntriesModal(e.date);
					}
				};
				actionCell.appendChild(editBtn);
				row.appendChild(actionCell);
			}

			tbody.appendChild(row);
		});
		table.appendChild(tbody);
		section.appendChild(table);

		return section;
	}

	renderNarrowListView(container: HTMLElement, years: Record<string, Record<string, TimeEntry[]>>): void {
		const currentYear = new Date().getFullYear().toString();

		// Sort years descending (newest first)
		Object.keys(years).sort().reverse().forEach((year, index) => {
			const yearSection = document.createElement('details');
			yearSection.className = 'tf-history-year-section';
			// Expand current year by default, or first year if current year has no entries
			yearSection.open = (year === currentYear) || (index === 0 && !years[currentYear]);

			const summary = document.createElement('summary');
			summary.className = 'tf-year-summary';
			const arrow = document.createElement('span');
			arrow.className = 'tf-mr-8';
			arrow.textContent = yearSection.open ? '▼' : '▶';
			summary.appendChild(arrow);
			summary.appendChild(document.createTextNode(year.toString()));
			yearSection.appendChild(summary);

			// Toggle arrow on open/close
			yearSection.addEventListener('toggle', () => {
				arrow.textContent = yearSection.open ? '▼' : '▶';
			});

			const yearDiv = document.createElement('div');
			yearDiv.className = 'tf-year-content';

			// Sort months descending (newest first)
			Object.keys(years[year]).sort().reverse().forEach(month => {
				const monthEntries = years[year][month];

				// Add month name header
				const monthHeader = document.createElement('h5');
				monthHeader.textContent = getMonthName(new Date(parseInt(year), parseInt(month) - 1, 1));
				monthHeader.className = 'tf-month-header';
				yearDiv.appendChild(monthHeader);

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
				monthEntries.forEach((e: TimeEntry) => {
					const row = document.createElement('tr');

					// Style active entries differently
					if (e.isActive) {
						row.className = 'tf-history-row-active';
					}

					// Date cell
					const dateCell = document.createElement('td');
					const dateStr = e.date ? Utils.toLocalDateStr(e.date) : '';
					const holidayInfo = dateStr ? this.data.getHolidayInfo(dateStr) : null;
					// Only show warning on work entries (jobb, kurs, studie) on special days
					const entryBehavior = this.settings.specialDayBehaviors.find(
						b => b.id === e.name.toLowerCase()
					);
					const isWorkEntry = entryBehavior?.isWorkType ||
						['jobb', 'kurs', 'studie'].includes(e.name.toLowerCase());
					const hasConflict = holidayInfo &&
						['ferie', 'helligdag', 'egenmelding', 'sykemelding', 'velferdspermisjon'].includes(holidayInfo.type) &&
						isWorkEntry;

					// Show active indicator
					if (e.isActive) {
						const activeIcon = document.createElement('span');
						activeIcon.textContent = '⏱️ ';
						activeIcon.title = t('ui.activeTimer');
						activeIcon.className = 'tf-cursor-help';
						dateCell.appendChild(activeIcon);
					} else if (hasConflict && holidayInfo) {
						const flagIcon = document.createElement('span');
						flagIcon.textContent = '⚠️ ';
						flagIcon.title = t('info.workRegisteredOnSpecialDay').replace('{dayType}', translateSpecialDayName(holidayInfo.type));
						flagIcon.className = 'tf-cursor-help';
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
					const hoursText = Utils.formatHoursToHM(e.duration || 0, this.settings.hourUnit);
					hoursCell.textContent = e.isActive ? `${hoursText}...` : hoursText;
					row.appendChild(hoursCell);

					// Flextime cell
					const flextimeCell = document.createElement('td');
					flextimeCell.textContent = Utils.formatHoursToHM(e.flextime || 0, this.settings.hourUnit);
					row.appendChild(flextimeCell);

					// Action cell
					const actionCell = document.createElement('td');
					const editBtn = document.createElement('button');
					editBtn.textContent = '✏️';
					editBtn.className = 'tf-edit-btn';
					editBtn.title = t('menu.editWork');
					editBtn.onclick = () => {
						if (e.date) {
							this.showEditEntriesModal(e.date);
						}
					};
					actionCell.appendChild(editBtn);
					row.appendChild(actionCell);

					tbody.appendChild(row);
				});
				table.appendChild(tbody);

				yearDiv.appendChild(table);
			});

			yearSection.appendChild(yearDiv);
			container.appendChild(yearSection);
		});
	}

	renderWideListView(container: HTMLElement, years: Record<string, Record<string, TimeEntry[]>>): void {
		const currentYear = new Date().getFullYear().toString();

		// Sort years descending (newest first)
		Object.keys(years).sort().reverse().forEach((year, index) => {
			const yearSection = document.createElement('details');
			yearSection.className = 'tf-history-year-section';
			// Expand current year by default, or first year if current year has no entries
			yearSection.open = (year === currentYear) || (index === 0 && !years[currentYear]);

			const summary = document.createElement('summary');
			summary.className = 'tf-year-summary';
			const arrow = document.createElement('span');
			arrow.className = 'tf-mr-8';
			arrow.textContent = yearSection.open ? '▼' : '▶';
			summary.appendChild(arrow);
			summary.appendChild(document.createTextNode(year.toString()));
			yearSection.appendChild(summary);

			// Toggle arrow on open/close
			yearSection.addEventListener('toggle', () => {
				arrow.textContent = yearSection.open ? '▼' : '▶';
			});

			const yearDiv = document.createElement('div');
			yearDiv.className = 'tf-year-content';

			// Sort months descending (newest first)
			Object.keys(years[year]).sort().reverse().forEach(month => {
				const monthEntries = years[year][month];

				// Add month name header
				const monthHeader = document.createElement('h5');
				monthHeader.textContent = getMonthName(new Date(parseInt(year), parseInt(month) - 1, 1));
				monthHeader.className = 'tf-month-header';
				yearDiv.appendChild(monthHeader);

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
				const entriesByDate: Record<string, TimeEntry[]> = {};
				monthEntries.forEach((e: TimeEntry) => {
					const dateStr = e.date ? Utils.toLocalDateStr(e.date) : '';
					if (dateStr) {
						if (!entriesByDate[dateStr]) entriesByDate[dateStr] = [];
						entriesByDate[dateStr].push(e);
					}
				});

				// Get raw timer entries for start/end times
				// Include subEntries from collapsed Timekeep entries
				const rawEntries = this.timerManager.data.entries;
				const flatRawEntries: { entry: Timer; parent?: Timer; subIndex?: number }[] = [];
				rawEntries.forEach(entry => {
					if (entry.collapsed && Array.isArray(entry.subEntries)) {
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

					// Track which raw entries have been matched to avoid duplicates
					const usedRawEntries = new Set<Timer>();

					dayEntries.forEach((e: TimeEntry, idx: number) => {
						const row = document.createElement('tr');

						// Style active entries differently
						if (e.isActive) {
							row.className = 'tf-history-row-active';
						}

						// Find matching raw entry for this processed entry (exclude already used ones)
						// Match by name + startTime for better accuracy
						const matchingItem = rawDayEntries.find(item =>
							!usedRawEntries.has(item.entry) &&
							item.entry.name.toLowerCase() === e.name.toLowerCase() &&
							item.entry.startTime === e.startTime
						) || rawDayEntries.find(item =>
							!usedRawEntries.has(item.entry) &&
							item.entry.name.toLowerCase() === e.name.toLowerCase()
						);
						// Don't fall back to index - only match if we find a real match
						const matchingRaw = matchingItem?.entry;
						if (matchingRaw) usedRawEntries.add(matchingRaw);

						// Date cell
						const dateCell = document.createElement('td');
						const holidayInfo = this.data.getHolidayInfo(dateStr);
						// Only show warning on work entries (jobb, kurs, studie) on special days
						const entryBehavior = this.settings.specialDayBehaviors.find(
							b => b.id === e.name.toLowerCase()
						);
						const isWorkEntry = entryBehavior?.isWorkType ||
							['jobb', 'kurs', 'studie'].includes(e.name.toLowerCase());
						const hasSpecialDayConflict = holidayInfo &&
							['ferie', 'helligdag', 'egenmelding', 'sykemelding', 'velferdspermisjon'].includes(holidayInfo.type) &&
							isWorkEntry;

						// Check for time overlap with other entries on same day
						let hasTimeOverlap = false;
						let overlapDetails = '';
						if (matchingRaw?.startTime && matchingRaw?.endTime) {
							const thisStart = new Date(matchingRaw.startTime).getTime();
							const thisEnd = new Date(matchingRaw.endTime).getTime();

							// Check against all other entries on this day
							for (const otherItem of rawDayEntries) {
								if (otherItem.entry === matchingRaw) continue; // Skip self
								if (!otherItem.entry.startTime || !otherItem.entry.endTime) continue;

								const otherStart = new Date(otherItem.entry.startTime).getTime();
								const otherEnd = new Date(otherItem.entry.endTime).getTime();

								// Check if ranges overlap
								if (thisStart < otherEnd && thisEnd > otherStart) {
									hasTimeOverlap = true;
									const otherStartTime = new Date(otherItem.entry.startTime);
									const otherEndTime = new Date(otherItem.entry.endTime);
									overlapDetails = `${otherItem.entry.name} (${otherStartTime.getHours().toString().padStart(2, '0')}:${otherStartTime.getMinutes().toString().padStart(2, '0')}-${otherEndTime.getHours().toString().padStart(2, '0')}:${otherEndTime.getMinutes().toString().padStart(2, '0')})`;
									break;
								}
							}
						}

						// Show active indicator
						if (e.isActive) {
							const activeIcon = document.createElement('span');
							activeIcon.textContent = '⏱️ ';
							activeIcon.title = t('ui.activeTimer');
							activeIcon.className = 'tf-cursor-help';
							dateCell.appendChild(activeIcon);
						} else if (hasTimeOverlap) {
							const overlapIcon = document.createElement('span');
							overlapIcon.textContent = '🔴 ';
							overlapIcon.title = `Overlapper med: ${overlapDetails}`;
							overlapIcon.className = 'tf-cursor-help';
							dateCell.appendChild(overlapIcon);
						} else if (hasSpecialDayConflict && holidayInfo) {
							const flagIcon = document.createElement('span');
							flagIcon.textContent = '⚠️ ';
							flagIcon.title = t('info.workRegisteredOnSpecialDay').replace('{dayType}', translateSpecialDayName(holidayInfo.type));
							flagIcon.className = 'tf-cursor-help';
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
								await this.saveWithErrorHandling();
								this.softRefreshHistory();
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
							const startDateStr = Utils.toLocalDateStr(startDate);
							const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;

							// Check if entry spans multiple days
							const endDateForCheck = matchingRaw.endTime ? new Date(matchingRaw.endTime) : null;
							const isMultiDay = endDateForCheck && Utils.toLocalDateStr(startDate) !== Utils.toLocalDateStr(endDateForCheck);

							if (this.inlineEditMode) {
								const container = document.createElement('div');
								container.className = 'tf-inline-edit-container';

								// Show date input for multi-day entries
								if (isMultiDay) {
									const dateInput = document.createElement('input');
									dateInput.type = 'date';
									dateInput.value = startDateStr;
									dateInput.className = 'tf-text-12px';
									dateInput.onchange = async () => {
										const newStart = new Date(`${dateInput.value}T${timeInput.value}:00`);
										matchingRaw.startTime = Utils.toLocalISOString(newStart);
										await this.saveWithErrorHandling();
										this.softRefreshHistory();
									};
									container.appendChild(dateInput);
								}

								const timeInput = this.createTimeInput(startTimeStr, async (newValue) => {
									const parsed = this.parseTimeInput(newValue);
									if (!parsed) return;
									const newStart = new Date(matchingRaw.startTime!);
									newStart.setHours(parsed.hours, parsed.minutes, 0, 0);
									matchingRaw.startTime = Utils.toLocalISOString(newStart);
									await this.saveWithErrorHandling();
									this.softRefreshHistory();
								});
								container.appendChild(timeInput);
								startCell.appendChild(container);
							} else {
								// Show date for multi-day entries in display mode
								startCell.textContent = isMultiDay ? `${startDateStr} ${startTimeStr}` : startTimeStr;
							}
						} else {
							startCell.textContent = '-';
						}
						row.appendChild(startCell);

						// End time cell
						const endCell = document.createElement('td');
						// Check if endTime exists AND is a valid date (not NaN)
						const endDateParsed = matchingRaw?.endTime ? new Date(matchingRaw.endTime) : null;
						const hasValidEndTime = endDateParsed && !isNaN(endDateParsed.getTime());

						if (hasValidEndTime && matchingRaw) {
							const endDate = endDateParsed;
							const endDateStr = Utils.toLocalDateStr(endDate);
							const endTimeStr = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

							// Check if entry spans multiple days
							const startDateForCheck = matchingRaw.startTime ? new Date(matchingRaw.startTime) : null;
							const isMultiDay = startDateForCheck && Utils.toLocalDateStr(startDateForCheck) !== Utils.toLocalDateStr(endDate);

							if (this.inlineEditMode) {
								const container = document.createElement('div');
								container.className = "tf-time-input-container";

								// Show date input for multi-day entries
								if (isMultiDay) {
									const dateInput = document.createElement('input');
									dateInput.type = 'date';
									dateInput.value = endDateStr;
									dateInput.className = "tf-date-input-sm";
									dateInput.onchange = async () => {
										const newEnd = new Date(`${dateInput.value}T${timeInput.value}:00`);
										matchingRaw.endTime = Utils.toLocalISOString(newEnd);
										await this.saveWithErrorHandling();
										this.softRefreshHistory();
									};
									container.appendChild(dateInput);
								}

								const timeInput = this.createTimeInput(endTimeStr, async (newValue) => {
									const parsed = this.parseTimeInput(newValue);
									if (!parsed) return;
									const newEnd = new Date(matchingRaw.endTime!);
									newEnd.setHours(parsed.hours, parsed.minutes, 0, 0);
									matchingRaw.endTime = Utils.toLocalISOString(newEnd);
									await this.saveWithErrorHandling();
									this.softRefreshHistory();
								});
								container.appendChild(timeInput);
								endCell.appendChild(container);
							} else {
								// Show date for multi-day entries in display mode
								endCell.textContent = isMultiDay ? `${endDateStr} ${endTimeStr}` : endTimeStr;
							}
						} else if (this.inlineEditMode && matchingRaw) {
							// No end time yet (active entry) - allow setting one in edit mode
							const startDate = matchingRaw.startTime ? new Date(matchingRaw.startTime) : new Date();

							const container = document.createElement('div');
							container.className = "tf-time-input-container";

							const timeInput = this.createTimeInput('', async (newValue) => {
								const parsed = this.parseTimeInput(newValue);
								if (!parsed) return;
								// Use the start date as the base for end time
								const newEnd = new Date(startDate);
								newEnd.setHours(parsed.hours, parsed.minutes, 0, 0);
								// If end time is before start time, assume next day
								if (newEnd <= startDate) {
									newEnd.setDate(newEnd.getDate() + 1);
									new Notice(t('validation.endTimeNextDay'));
								}
								matchingRaw.endTime = Utils.toLocalISOString(newEnd);
								await this.saveWithErrorHandling();
								this.softRefreshHistory();
							});
							container.appendChild(timeInput);
							endCell.appendChild(container);
						} else {
							endCell.textContent = matchingRaw ? t('ui.ongoing') : '-';
						}
						row.appendChild(endCell);

						// Hours cell (always read-only)
						const hoursCell = document.createElement('td');
						const hoursText = Utils.formatHoursToHM(e.duration || 0, this.settings.hourUnit);
						hoursCell.textContent = e.isActive ? `${hoursText}...` : hoursText;
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
								deleteBtn.onclick = () => {
									this.showConfirmDialog(`${t('confirm.deleteEntryFor')} ${dateStr}?`, async () => {
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
										await this.saveWithErrorHandling();
										this.softRefreshHistory();
									});
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
					addCell.textContent = t('ui.addNewEntry');
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

			yearSection.appendChild(yearDiv);
			container.appendChild(yearSection);
		});
	}

	showAddEntryModal(targetDate: Date): void {
		const dateStr = Utils.toLocalDateStr(targetDate);
		this.isModalOpen = true;

		// Create modal
		const modal = document.createElement('div');
		modal.className = 'modal-container mod-dim tf-modal-z1000';

		const modalBg = document.createElement('div');
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => { this.isModalOpen = false; modal.remove(); };
		modal.appendChild(modalBg);

		const modalContent = document.createElement('div');
		modalContent.className = 'modal tf-modal-content-400';

		// Prevent Obsidian from capturing keyboard events in modal inputs
		modalContent.addEventListener('keydown', (e) => e.stopPropagation());
		modalContent.addEventListener('keyup', (e) => e.stopPropagation());
		modalContent.addEventListener('keypress', (e) => e.stopPropagation());
		modalContent.addEventListener('beforeinput', (e) => e.stopPropagation());
		modalContent.addEventListener('input', (e) => e.stopPropagation());

		// Title
		const title = document.createElement('div');
		title.className = 'modal-title';
		title.textContent = `${t('modals.addEntryTitle')} ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = document.createElement('div');
		content.className = 'modal-content tf-p-20';

		// Type selector
		const typeLabel = document.createElement('div');
		typeLabel.textContent = t('ui.type') + ':';
		typeLabel.className = 'tf-form-label';
		content.appendChild(typeLabel);

		const typeSelect = document.createElement('select');
		typeSelect.className = 'tf-form-input-mb';
		this.settings.specialDayBehaviors.forEach(behavior => {
			const option = document.createElement('option');
			option.value = behavior.id;
			option.textContent = `${behavior.icon} ${translateSpecialDayName(behavior.id, behavior.label)}`;
			typeSelect.appendChild(option);
		});
		content.appendChild(typeSelect);

		// Start time (for regular entries)
		const startLabel = document.createElement('div');
		startLabel.textContent = `${t('modals.startTime')}:`;
		startLabel.className = 'tf-form-label';
		content.appendChild(startLabel);

		const startInput = this.createTimeInput('08:00', () => {});
		startInput.className = 'tf-form-input-mb';
		content.appendChild(startInput);

		// End time (for regular entries)
		const endLabel = document.createElement('div');
		endLabel.textContent = `${t('modals.endTime')}:`;
		endLabel.className = 'tf-form-label';
		content.appendChild(endLabel);

		const endInput = this.createTimeInput('16:00', () => {});
		endInput.className = 'tf-form-input-mb-lg';
		content.appendChild(endInput);

		// Duration input (for reduce_goal types like sick days)
		const durationContainer = document.createElement('div');
		durationContainer.className = 'tf-duration-container tf-hidden';

		const durationLabel = document.createElement('div');
		durationLabel.textContent = t('ui.duration') + ':';
		durationLabel.className = 'tf-form-label';
		durationContainer.appendChild(durationLabel);

		const durationInput = document.createElement('input');
		durationInput.type = 'number';
		durationInput.step = '0.5';
		durationInput.min = '0.5';
		durationInput.max = '24';
		durationInput.value = '3.5';
		durationInput.className = 'tf-form-input';
		durationContainer.appendChild(durationInput);

		const durationHint = document.createElement('div');
		durationHint.className = 'tf-duration-hint';
		durationHint.textContent = t('modals.durationHint') || 'Antall timer (f.eks. 3.5 for resten av dagen etter sykdom)';
		durationContainer.appendChild(durationHint);

		content.appendChild(durationContainer);

		// Helper to check if type uses reduce_goal (sick day types)
		const isReduceGoalType = (typeId: string): boolean => {
			const behavior = this.settings.specialDayBehaviors.find(b => b.id === typeId);
			return behavior?.flextimeEffect === 'reduce_goal';
		};

		// Toggle between time inputs and duration input based on type
		const updateInputVisibility = () => {
			const showDuration = isReduceGoalType(typeSelect.value);
			if (showDuration) {
				startLabel.addClass('tf-hidden');
				startInput.addClass('tf-hidden');
				endLabel.addClass('tf-hidden');
				endInput.addClass('tf-hidden');
				durationContainer.removeClass('tf-hidden');
			} else {
				startLabel.removeClass('tf-hidden');
				startInput.removeClass('tf-hidden');
				endLabel.removeClass('tf-hidden');
				endInput.removeClass('tf-hidden');
				durationContainer.addClass('tf-hidden');
			}
		};

		typeSelect.onchange = updateInputVisibility;
		updateInputVisibility(); // Initial update

		// Buttons
		const buttonContainer = document.createElement('div');
		buttonContainer.className = 'tf-btn-container';

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => { this.isModalOpen = false; modal.remove(); };
		buttonContainer.appendChild(cancelBtn);

		const saveBtn = document.createElement('button');
		saveBtn.className = 'mod-cta';
		saveBtn.textContent = t('buttons.save');
		saveBtn.onclick = async () => {
			let startDate: Date;
			let endDate: Date;

			if (isReduceGoalType(typeSelect.value)) {
				// For reduce_goal types, use duration input
				const duration = parseFloat(durationInput.value);
				if (isNaN(duration) || duration <= 0) {
					new Notice(t('validation.invalidDuration') || 'Ugyldig varighet');
					return;
				}

				// Create an entry that spans the duration from noon (arbitrary anchor point)
				// The actual times don't matter much for reduce_goal - only the duration counts
				startDate = new Date(targetDate);
				startDate.setHours(12, 0, 0, 0);

				endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);
			} else {
				// For regular types, use start/end time inputs
				const parsedStart = this.parseTimeInput(startInput.value);
				const parsedEnd = this.parseTimeInput(endInput.value);

				if (!parsedStart || !parsedEnd) {
					new Notice(t('validation.invalidTime'));
					return;
				}

				startDate = new Date(targetDate);
				startDate.setHours(parsedStart.hours, parsedStart.minutes, 0, 0);

				endDate = new Date(targetDate);
				endDate.setHours(parsedEnd.hours, parsedEnd.minutes, 0, 0);

				if (endDate <= startDate) {
					new Notice(t('validation.endAfterStart'));
					return;
				}
			}

			// Add new entry
			this.timerManager.data.entries.push({
				name: typeSelect.value,
				startTime: Utils.toLocalISOString(startDate),
				endTime: Utils.toLocalISOString(endDate),
				subEntries: null
			});

			await this.saveWithErrorHandling();
			this.isModalOpen = false;
			modal.remove();

			const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
			new Notice(`✅ ${t('notifications.addedHours').replace('{duration}', duration.toFixed(1)).replace('{date}', dateStr)}`);

			this.plugin.timerManager.onTimerChange?.();
		};
		buttonContainer.appendChild(saveBtn);
		content.appendChild(buttonContainer);

		modalContent.appendChild(content);
		modal.appendChild(modalContent);
		document.body.appendChild(modal);
	}

	renderWeeklyView(container: HTMLElement, years: Record<string, Record<string, TimeEntry[]>>): void {
		container.empty();
		const div = container.createDiv();
		div.className = 'tf-heatmap-no-data';
		div.textContent = t('ui.weeklyViewComingSoon');
	}

	renderHeatmapView(container: HTMLElement, years: Record<string, Record<string, TimeEntry[]>>): void {
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
			const holidayInfo = this.data.getHolidayInfo(dateKey);

			// Check for special day color first (if enabled)
			if (this.settings.heatmapShowSpecialDayColors) {
				let specialDayBehavior: typeof this.settings.specialDayBehaviors[0] | undefined = undefined;

				// First check holiday file
				if (holidayInfo) {
					specialDayBehavior = this.settings.specialDayBehaviors.find(b => b.id === holidayInfo.type);
				}

				// Then check entries for special day types (studie, kurs, ferie entries, etc.)
				// Exclude regular work entries (jobb) - only show special day colors
				if (!specialDayBehavior && dayEntries) {
					for (const entry of dayEntries) {
						const entryName = entry.name.toLowerCase();
						// Skip regular work entries
						if (entryName === 'jobb') continue;

						const entryBehavior = this.settings.specialDayBehaviors.find(
							b => b.id === entryName
						);
						if (entryBehavior) {
							specialDayBehavior = entryBehavior;
							break;
						}
					}
				}

				if (specialDayBehavior) {
					cell.setCssProps({ '--tf-bg': specialDayBehavior.color, '--tf-color': specialDayBehavior.textColor || '#000000' });
					cell.addClass('tf-dynamic-bg-color');
					cell.title = `${dateKey} - ${specialDayBehavior.icon} ${specialDayBehavior.label}`;
				} else if (dayEntries) {
					// Has entries but no special day - show flextime or simple color
					if (!this.settings.enableGoalTracking) {
						// Simple tracking mode - use work type's simpleColor
						const workType = this.settings.specialDayBehaviors.find(b => b.isWorkType);
						cell.setCssProps({ '--tf-bg': workType?.simpleColor || '#90caf9', '--tf-color': workType?.simpleTextColor || '#000000' });
						cell.addClass('tf-dynamic-bg-color');
					} else {
						const dayFlextime = dayEntries.reduce((sum, e) => sum + (e.flextime || 0), 0);
						cell.setCssProps({ '--tf-bg': this.flextimeColor(dayFlextime), '--tf-color': this.flextimeTextColor(dayFlextime) });
						cell.addClass('tf-dynamic-bg-color');
					}
				} else {
					cell.setCssProps({ '--tf-bg': 'var(--background-modifier-border)' });
					cell.addClass('tf-dynamic-bg');
				}
			} else if (dayEntries) {
				// Regular work day - show flextime color or simple color
				if (!this.settings.enableGoalTracking) {
					// Simple tracking mode - use work type's simpleColor
					const workType = this.settings.specialDayBehaviors.find(b => b.isWorkType);
					cell.setCssProps({ '--tf-bg': workType?.simpleColor || '#90caf9', '--tf-color': workType?.simpleTextColor || '#000000' });
					cell.addClass('tf-dynamic-bg-color');
				} else {
					// Goal-based mode - show flextime color gradient
					const dayFlextime = dayEntries.reduce((sum, e) => sum + (e.flextime || 0), 0);
					cell.setCssProps({ '--tf-bg': this.flextimeColor(dayFlextime), '--tf-color': this.flextimeTextColor(dayFlextime) });
					cell.addClass('tf-dynamic-bg-color');
				}
			} else {
				cell.setCssProps({ '--tf-bg': 'var(--background-modifier-border)' });
				cell.addClass('tf-dynamic-bg');
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

		new Notice(t('notifications.exported'));
	}

	startUpdates(): void {
		// Update clock every second (settings in seconds, setInterval needs ms)
		const clockMs = (this.settings.clockInterval || 1) * 1000;
		const clockInterval = window.setInterval(() => {
			this.updateClock();
		}, clockMs);
		this.intervals.push(clockInterval);

		// Update data periodically (settings in seconds, setInterval needs ms)
		const updateMs = (this.settings.updateInterval || 30) * 1000;
		const dataInterval = window.setInterval(() => {
			this.updateAll();
		}, updateMs);
		this.intervals.push(dataInterval);
	}

	updateAll(): void {
		// Skip refresh while modal is open to prevent input interference
		if (this.isModalOpen) return;

		// Reload data from timer manager to get latest state
		this.data.rawEntries = this.timerManager.convertToTimeEntries();
		this.data.processEntries();

		this.updateBadge();
		this.updateTimerBadge();
		this.updateDayCard();
		this.updateWeekCard();
		this.updateStatsCard();
		this.updateMonthCard();

		// Update active timers section in history (shows running timer duration)
		// Just update the duration text in existing rows instead of rebuilding
		const activeSection = this.container.querySelector('.tf-active-entries-section') as HTMLElement;
		if (activeSection && this.data.activeEntries.length > 0) {
			// Update duration cells in the table
			const tbody = activeSection.querySelector('tbody');
			if (tbody) {
				const rows = tbody.querySelectorAll('tr');
				const now = new Date();
				rows.forEach((row, index) => {
					if (index < this.data.activeEntries.length) {
						const entry = this.data.activeEntries[index];
						// Calculate duration fresh from start time to now
						const start = Utils.parseDate(entry.startTime);
						let duration = start ? Utils.hoursDiff(start, now) : 0;

						// Deduct lunch break for work entries
						if (entry.name.toLowerCase() === 'jobb' && this.settings.lunchBreakMinutes > 0) {
							duration = Math.max(0, duration - (this.settings.lunchBreakMinutes / 60));
						}

						// Find the hours cell (varies by wide/narrow mode)
						const cells = row.querySelectorAll('td');
						// In wide mode: date, type, start, hours, flextime
						// In narrow mode: date, type, hours, action
						const isWide = cells.length >= 5;
						const hoursCell = isWide ? cells[3] : cells[2];
						if (hoursCell) {
							const hoursText = Utils.formatHoursToHM(duration, this.settings.hourUnit);
							hoursCell.textContent = `${hoursText}...`;
						}
						// Update flextime cell in wide mode
						if (isWide && cells[4]) {
							// Calculate flextime properly: total work today minus daily goal
							const dateStr = Utils.toLocalDateStr(start || new Date());
							const dayGoal = this.data.getDailyGoal(dateStr);

							// Sum all completed work hours for today
							let completedHoursToday = 0;
							const todayEntries = this.data.daily[dateStr] || [];
							todayEntries.forEach(e => {
								if (!e.isActive) {
									const behavior = this.data.getSpecialDayBehavior(e.name);
									if (!behavior || behavior.isWorkType || behavior.flextimeEffect === 'accumulate') {
										completedHoursToday += e.duration || 0;
									}
								}
							});

							// Total work = completed + current active timer duration
							const totalWorkToday = completedHoursToday + duration;
							const flextime = totalWorkToday - dayGoal;
							cells[4].textContent = Utils.formatHoursToHM(flextime, this.settings.hourUnit);
						}
					}
				});
			}
		} else if (activeSection && this.data.activeEntries.length === 0) {
			// Remove section if no more active entries
			activeSection.remove();
		}

		// Update history edit toggle visibility (width may have changed)
		const historyContainer = this.container.querySelector('.tf-history-content');
		if (historyContainer) {
			this.updateEditToggleVisibility(historyContainer as HTMLElement);
		}
	}

	/**
	 * Soft refresh for inline editing - updates data and history view
	 * without rebuilding the entire dashboard. Preserves edit mode state.
	 */
	softRefreshHistory(): void {
		// Reload data from timer manager
		this.data.rawEntries = this.timerManager.convertToTimeEntries();
		this.data.processEntries();

		// Find and refresh the active entries section
		const activeSection = this.container.querySelector('.tf-active-entries-section') as HTMLElement;
		if (activeSection && this.data.activeEntries.length > 0) {
			const parent = activeSection.parentElement;
			if (parent) {
				// Replace the content of the existing section instead of removing/recreating
				const newSection = this.createActiveEntriesSection(this.data.activeEntries, parent);
				activeSection.replaceWith(newSection);
			}
		} else if (activeSection && this.data.activeEntries.length === 0) {
			// Remove section if no more active entries
			activeSection.remove();
		}

		// Find and refresh the history container
		const historyContainer = this.container.querySelector('.tf-history-content');
		if (historyContainer) {
			this.refreshHistoryView(historyContainer as HTMLElement);
		}

		// Also update cards to reflect changes
		this.updateDayCard();
		this.updateWeekCard();
		this.updateStatsCard();
	}

	showDeleteConfirmation(entry: TimeEntry | Timer, dateObj: Date, onConfirm: () => void | Promise<void>): void {
		// Create overlay
		const overlay = document.createElement('div');
		overlay.className = 'tf-confirm-overlay';

		// Create dialog
		const dialog = document.createElement('div');
		dialog.className = 'tf-confirm-dialog';

		// Title
		const title = document.createElement('div');
		title.className = 'tf-confirm-title';
		title.textContent = '🗑️ ' + t('modals.deleteEntryTitle');
		dialog.appendChild(title);

		// Message
		const message = document.createElement('div');
		message.className = 'tf-confirm-message';
		message.textContent = t('confirm.deleteEntry');
		dialog.appendChild(message);

		// Entry details
		const details = document.createElement('div');
		details.className = 'tf-confirm-details';

		const startDate = entry.startTime ? new Date(entry.startTime) : new Date();
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
		// duration is always a string (from .toFixed() or t('ui.ongoing'))
		// If it's a numeric string (from .toFixed), append the hours unit
		const durationDisplay = endDate ? `${duration} ${t('ui.hours').toLowerCase()}` : duration;
		durationRow.appendText(' ' + durationDisplay);
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
			void onConfirm();
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
