import { App, TFile, Notice, normalizePath, setIcon } from 'obsidian';
import { DataManager, HolidayInfo, ValidationResults, TimeEntry } from './dataManager';
import { TimeFlowSettings, SpecialDayBehavior, NoteType } from './settings';
import { TimerManager, Timer } from './timerManager';
import { Utils, getSpecialDayColors, getSpecialDayTextColors } from './utils';
import type TimeFlowPlugin from './main';
import { t, formatDate, formatTime, getDayNamesShort, getMonthName, translateSpecialDayName, translateNoteTypeName, translateAnnetTemplateName } from './i18n';
import { CommentModal } from './commentModal';

export interface SystemStatus {
	validation?: ValidationResults;
	holiday?: {
		message?: string;
		parseErrors?: number;
		duplicates?: string[];
		invalidTimeRanges?: string[];
	};
	activeTimers?: number;
	dataParseError?: boolean;
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
	// v3 state
	selectedDayDate: string | null = null;
	balanceHeroEl: HTMLElement | null = null;
	progressStripEl: HTMLElement | null = null;
	barCalendarBodyEl: HTMLElement | null = null;
	statsFooterEl: HTMLElement | null = null;
	heroClockEl: HTMLElement | null = null;
	// Sidebar (narrow) extras: expand-in-place state + section refs for targeted rebuilds.
	private _showAllLeaveNarrow = false;
	private _showAllHistoryNarrow = false;
	private _narrowLeaveEl: HTMLElement | null = null;
	private _narrowHistoryEl: HTMLElement | null = null;
	// Upcoming list (wide layout grows to fill the right column's height).
	private _upcomingGroups: Array<{ startDate: string; endDate: string; label: string; color: string; textColor: string; count: number }> = [];
	private _upcomingItemsEl: HTMLElement | null = null;
	private _resizeObserver: ResizeObserver | null = null;
	systemStatus: SystemStatus;
	settings: TimeFlowSettings;
	app: App;
	timerManager: TimerManager;
	plugin: TimeFlowPlugin;
	elements: {
		complianceBadge: HTMLElement | null;
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
			complianceBadge: null,
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
		const input = createEl('input');
		input.type = 'text';
		input.value = initialValue;
		input.placeholder = 'Hh:mm';
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
		const container = createDiv();
		container.className = "tf-container";
		return container;
	}

	// Note: Styles are now in styles.css instead of being injected dynamically

	/**
	 * Stop a timer with optional comment modal.
	 * Shows comment modal; skip is disabled if overtime threshold is exceeded.
	 */
	private async stopTimerWithCommentCheck(timer: Timer): Promise<void> {
		// Calculate timer duration
		if (!timer.startTime) return;

		const start = new Date(timer.startTime);
		const now = new Date();
		let duration = Utils.hoursDiff(start, now);

		// Deduct lunch break for work entries if configured
		if (timer.name.toLowerCase() === 'jobb' && this.settings.lunchBreakMinutes > 0) {
			duration = Math.max(0, duration - (this.settings.lunchBreakMinutes / 60));
		}

		// Check if comment is required
		const dateStr = Utils.toLocalDateStr(start);
		const commentCheck = this.data.checkCommentRequired(dateStr, timer.name, duration);

		// Always show modal - skip is disabled if required
		return new Promise((resolve) => {
			const modal = new CommentModal(
				this.app,
				timer,
				commentCheck.required,
				commentCheck.hoursOverGoal,
				async (comment: string) => {
					// Save comment and stop timer
					timer.comment = comment || undefined;
					await this.timerManager.stopTimer(timer);
					resolve();
				},
				async () => {
					// Skip pressed (only works if not required)
					await this.timerManager.stopTimer(timer);
					resolve();
				}
			);
			modal.open();
		});
	}

	showTimerTypeMenu(button: HTMLElement): void {
		// Remove any existing menu
		const existingMenu = activeDocument.querySelector('.tf-timer-type-menu');
		if (existingMenu) {
			existingMenu.remove();
			return;
		}

		const menu = createDiv();
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
			const item = createDiv();
			item.className = 'tf-menu-item';
			item.createSpan({ text: type.icon });
			item.createSpan({ text: type.label });

			item.onclick = async () => {
				await this.timerManager.startTimer(type.name);
				menu.remove();
			};

			menu.appendChild(item);
		});

		activeDocument.body.appendChild(menu);

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
				activeDocument.removeEventListener('click', closeMenu);
			}
		};
		window.setTimeout(() => activeDocument.addEventListener('click', closeMenu), 0);
	}

	buildHistoryCard(): HTMLElement {
		const card = createDiv();
		card.className = "tf-card tf-card-history tf-card-spaced";

		// Collapsible header with title and tabs
		const header = createDiv();
		header.className = "tf-collapsible tf-history-header";

		// Left side: title
		const title = createEl('h3');
		title.textContent = t('ui.history');
		title.className = 'tf-history-title';
		header.appendChild(title);

		// Right side container for edit button and tabs
		const rightControls = createDiv();
		rightControls.className = "tf-history-controls";

		// Collapsible content container — collapsed on first load so the status bar stays visible
		const content = createDiv();
		content.className = "tf-collapsible-content";

		// Create details element (for the actual content)
		const detailsElement = createDiv();
		detailsElement.className = "tf-history-content";

		// Export CSV button
		const exportBtn = createEl('button');
		exportBtn.className = 'tf-history-export-btn';
		exportBtn.textContent = t('buttons.export');
		exportBtn.title = t('export.csvTooltip');
		exportBtn.onclick = (e) => {
			e.stopPropagation();
			this.exportHistoryToCSV();
		};
		rightControls.appendChild(exportBtn);

		// Edit toggle button (to the LEFT of tabs so tabs don't shift)
		const editToggle = createEl('button');
		editToggle.className = `tf-history-edit-btn ${this.inlineEditMode ? 'active' : ''}`;
		editToggle.textContent = this.inlineEditMode ? t('buttons.done') : t('buttons.edit');
		editToggle.onclick = (e) => {
			e.stopPropagation(); // Don't trigger header collapse
			this.inlineEditMode = !this.inlineEditMode;
			editToggle.textContent = this.inlineEditMode ? t('buttons.done') : t('buttons.edit');
			editToggle.classList.toggle('active', this.inlineEditMode);
			this.refreshHistoryView(detailsElement);
		};
		rightControls.appendChild(editToggle);

		// View tabs in header (matching stats card style)
		const tabs = createDiv();
		tabs.className = "tf-tabs tf-tabs-inline";

		const views = [
			{ id: "list", label: t('buttons.list') },
			{ id: "heatmap", label: t('buttons.heatmap') }
		];

		views.forEach(view => {
			const tab = createEl('button');
			tab.textContent = view.label;
			tab.className = `tf-tab ${this.historyView === view.id ? 'active' : ''}`;
			tab.onclick = (e) => {
				e.stopPropagation(); // Don't trigger header collapse
				this.historyView = view.id;
				// Exit edit mode when switching views
				this.inlineEditMode = false;
				editToggle.textContent = t('buttons.edit');
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
		window.requestAnimationFrame(() => {
			this.updateEditToggleVisibility(detailsElement);
		});

		// Add ResizeObserver to re-render when crossing narrow/wide threshold
		let lastWasWide = detailsElement.offsetWidth >= 450;
		const resizeObserver = new ResizeObserver(() => {
			const isWide = detailsElement.offsetWidth >= 450;
			// Only re-render if we crossed the threshold and we're in list view
			if (isWide !== lastWasWide && this.historyView === 'list') {
				lastWasWide = isWide;
				this.refreshHistoryView(detailsElement);
			}
			// Always update edit toggle visibility
			this.updateEditToggleVisibility(detailsElement);
		});
		resizeObserver.observe(detailsElement);

		return card;
	}

	buildViewToggle(): HTMLElement {
		const container = createDiv();
		container.className = "tf-view-toggle-container";

		const viewToggle = createEl('button');
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
		const existingPanel = activeDocument.querySelector('.tf-compliance-info-panel');
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
		const panel = createDiv();
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
		activeDocument.body.appendChild(panel);

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
				activeDocument.removeEventListener('click', closeHandler);
			}
		};
		window.setTimeout(() => activeDocument.addEventListener('click', closeHandler), 0);
	}

	/**
	 * Generate compliance warning HTML for daily hours
	 */

	/**
	 * Generate compliance warning HTML for weekly hours
	 */

	/**
	 * Render the hours bar chart at the bottom of the stats card section
	 */

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

		const container = createDiv();

		const monthTitle = createDiv();
		monthTitle.textContent = monthName;
		monthTitle.className = 'tf-month-title';
		container.appendChild(monthTitle);

		const grid = createDiv();
		grid.className = showWeekNumbers ? "tf-month-grid with-week-numbers" : "tf-month-grid";

		// Add week number header if enabled
		if (showWeekNumbers) {
			const weekHeader = createDiv();
			weekHeader.className = "tf-week-number-header";
			weekHeader.textContent = t('ui.week');
			grid.appendChild(weekHeader);
		}

		// Add day headers
		const dayNames = getDayNamesShort();
		dayNames.forEach(name => {
			const header = createDiv();
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
			const weekNumCell = createDiv();
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
			const emptyCell = createDiv();
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
				const weekNumCell = createDiv();
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

			const cell = createDiv();
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

					const stripe = createDiv();
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
					const stripe = createDiv();
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
				const indicator = createDiv();
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
			const fullDayHours = this.settings.baseWorkday * this.settings.workPercent;
			const halfDayHours = this.settings.halfDayMode === 'percentage'
				? fullDayHours / 2
				: this.settings.halfDayHours * this.settings.workPercent;
			const halfDayReduction = fullDayHours - halfDayHours;
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
		let goalReduction = 0; // Track goal reduction from reduce_goal entries (sick days)
		let halfDayReduction = 0; // Track goal reduction from half-day entries
		const dailyGoal = this.settings.baseWorkday * this.settings.workPercent;

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
				// First check holidays.md
				const holidayInfo = this.data.getHolidayInfo(dayKey);
				const holidayBehavior = holidayInfo ? this.settings.specialDayBehaviors.find(b => b.id === holidayInfo.type) : null;
				let isNoHoursDay = holidayBehavior?.noHoursRequired === true;

				// Check for half-day entries and calculate reduction (accounting for work percent)
				if (holidayInfo?.halfDay && day <= today) {
					const halfDayHours = this.settings.halfDayMode === 'percentage'
						? dailyGoal / 2
						: this.settings.halfDayHours * this.settings.workPercent;
					// Reduction = full day goal - half day hours
					halfDayReduction += dailyGoal - halfDayHours;
				}

				// Also check timer entries for ferie/avspasering
				if (!isNoHoursDay) {
					const dayEntries = this.data.daily[dayKey] || [];
					isNoHoursDay = dayEntries.some(entry => {
						const name = entry.name.toLowerCase();
						const behavior = this.settings.specialDayBehaviors.find(b => b.id === name);
						// Check if it's a noHoursRequired type or a withdraw type (avspasering)
						return behavior?.noHoursRequired === true || behavior?.flextimeEffect === 'withdraw';
					});
				}

				if (!isNoHoursDay) {
					workDaysInWeek++;
					if (day <= today) {
						workDaysPassed++;
					}
				}
			}

			// Sum hours from entries and track goal reductions
			const dayEntries = this.data.daily[dayKey] || [];
			dayEntries.forEach(entry => {
				const name = entry.name.toLowerCase();
				const behavior = this.settings.specialDayBehaviors.find(b => b.id === name);

				if (behavior?.flextimeEffect === 'reduce_goal') {
					// For full-day sick leave (0 duration), reduce by full daily goal
					// For partial sick leave, reduce by the logged hours
					goalReduction += (entry.duration && entry.duration > 0) ? entry.duration : dailyGoal;
				} else if (!behavior?.noHoursRequired && behavior?.flextimeEffect !== 'withdraw') {
					// Count work hours (exclude noHoursRequired types and withdraw types)
					totalHours += entry.duration || 0;
				}
			});
		}

		// If no work days have passed yet, it's a partial/future week
		if (workDaysPassed === 0) {
			return 'week-future';
		}

		// Calculate expected hours for days that have passed, minus goal reductions from sick days and half-days
		const expectedHoursPerDay = this.settings.baseWorkday;
		const expectedHours = Math.max(0, (workDaysPassed * expectedHoursPerDay * this.settings.workPercent) - goalReduction - halfDayReduction);

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
		let goalReduction = 0; // Track goal reduction from reduce_goal entries (sick days)
		let halfDayReduction = 0; // Track goal reduction from half-day entries
		const dailyGoal = this.settings.baseWorkday * this.settings.workPercent;

		for (let i = 0; i < 7; i++) {
			const day = new Date(mondayOfWeek);
			day.setDate(mondayOfWeek.getDate() + i);
			const dayKey = Utils.toLocalDateStr(day);

			if (day < balanceStartDate) continue;

			const isWorkDay = this.settings.workDays.includes(day.getDay());
			if (isWorkDay) {
				// Check if this day has a special day that doesn't require hours (ferie, etc.)
				// First check holidays.md
				const holidayInfo = this.data.getHolidayInfo(dayKey);
				const holidayBehavior = holidayInfo ? this.settings.specialDayBehaviors.find(b => b.id === holidayInfo.type) : null;
				let isNoHoursDay = holidayBehavior?.noHoursRequired === true;

				// Check for half-day entries and calculate reduction (accounting for work percent)
				if (holidayInfo?.halfDay && day <= today) {
					const halfDayHours = this.settings.halfDayMode === 'percentage'
						? dailyGoal / 2
						: this.settings.halfDayHours * this.settings.workPercent;
					// Reduction = full day goal - half day hours
					halfDayReduction += dailyGoal - halfDayHours;
				}

				// Also check timer entries for ferie/avspasering
				if (!isNoHoursDay) {
					const dayEntries = this.data.daily[dayKey] || [];
					isNoHoursDay = dayEntries.some(entry => {
						const name = entry.name.toLowerCase();
						const behavior = this.settings.specialDayBehaviors.find(b => b.id === name);
						// Check if it's a noHoursRequired type or a withdraw type (avspasering)
						return behavior?.noHoursRequired === true || behavior?.flextimeEffect === 'withdraw';
					});
				}

				if (!isNoHoursDay) {
					workDaysInWeek++;
					if (day <= today) {
						workDaysPassed++;
					}
				}
			}

			// Sum hours from entries and track goal reductions
			const dayEntries = this.data.daily[dayKey] || [];
			dayEntries.forEach(entry => {
				const name = entry.name.toLowerCase();
				const behavior = this.settings.specialDayBehaviors.find(b => b.id === name);

				if (behavior?.flextimeEffect === 'reduce_goal') {
					// For full-day sick leave (0 duration), reduce by full daily goal
					// For partial sick leave, reduce by the logged hours
					goalReduction += (entry.duration && entry.duration > 0) ? entry.duration : dailyGoal;
				} else if (!behavior?.noHoursRequired && behavior?.flextimeEffect !== 'withdraw') {
					// Count work hours (exclude noHoursRequired types and withdraw types)
					totalHours += entry.duration || 0;
				}
			});
		}

		const expectedHoursPerDay = this.settings.baseWorkday;
		const expectedHours = Math.max(0, (workDaysPassed * expectedHoursPerDay * this.settings.workPercent) - goalReduction - halfDayReduction);
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
		const existingPanel = activeDocument.querySelector<HTMLElement>('.tf-week-compliance-panel');
		if (existingPanel) {
			const existingWeek = existingPanel.dataset.weekMonday;
			existingPanel.remove();
			// If clicking the same week, just close (toggle off)
			if (existingWeek === Utils.toLocalDateStr(mondayOfWeek)) {
				return;
			}
		}

		const data = this.getWeekComplianceData(mondayOfWeek);

		const panel = createDiv();
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

		activeDocument.body.appendChild(panel);

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
				activeDocument.removeEventListener('click', closeHandler);
			}
		};
		window.setTimeout(() => activeDocument.addEventListener('click', closeHandler), 0);
	}

	showNoteTypeMenu(cellRect: DOMRect, dateObj: Date): void {
		// Remove existing menu - toggle behavior if clicking the same date
		const existingMenu = activeDocument.querySelector<HTMLElement>('.tf-context-menu');
		if (existingMenu) {
			const existingDate = existingMenu.dataset.menuDate;
			existingMenu.remove();
			// If clicking the same date, just close (toggle off)
			if (existingDate === Utils.toLocalDateStr(dateObj)) {
				return;
			}
		}

		const menu = createDiv();
		menu.className = 'tf-context-menu';
		menu.dataset.menuDate = Utils.toLocalDateStr(dateObj); // Store for toggle detection

		// Create main menu container
		const menuMain = createDiv();
		menuMain.className = 'tf-context-menu-main';

		// Position menu, but check if it goes off-screen
		// Note: Using fixed positioning, so coordinates are relative to viewport
		let menuLeft = cellRect.right;
		let menuTop = cellRect.top;

		// Append to body first to measure dimensions
		activeDocument.body.appendChild(menu);

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
		window.setTimeout(() => {
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
		const workTimeItem = createDiv();
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
			const editItem = createDiv();
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
		const specialDayItem = createDiv();
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

			const editPlannedItem = createDiv();
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
		const separator1 = createDiv();
		separator1.className = 'tf-menu-separator';
		menuMain.appendChild(separator1);

		// Create note options
		this.settings.noteTypes.forEach(noteType => {
			const item = createDiv();
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
		const menuInfo = createDiv();
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

			// Get raw timer entries for this date to access comments
			const rawEntriesForDate = this.timerManager.data.entries.filter(entry => {
				if (!entry.startTime) return false;
				const entryDate = new Date(entry.startTime);
				return Utils.toLocalDateStr(entryDate) === dateStr;
			});
			// Track used entries to avoid duplicates
			const usedRawEntries = new Set<typeof rawEntriesForDate[0]>();

			completedEntries.forEach(e => {
				const emoji = Utils.getEmoji(e);
				// Don't show "0.0t" for special days with no duration
				const behavior = this.data.getSpecialDayBehavior(e.name);
				const isFullDayReduceGoal = behavior?.flextimeEffect === 'reduce_goal' && (!e.duration || e.duration === 0);
				const durationText = (e.duration && e.duration > 0)
					? `: ${e.duration.toFixed(1)}${this.settings.hourUnit}`
					: isFullDayReduceGoal ? ` (${t('ui.fullDay')})` : '';

				// Find matching raw entry to get comment
				const matchingRaw = rawEntriesForDate.find(raw =>
					!usedRawEntries.has(raw) &&
					raw.name.toLowerCase() === e.name.toLowerCase() &&
					raw.startTime === e.startTime
				) || rawEntriesForDate.find(raw =>
					!usedRawEntries.has(raw) &&
					raw.name.toLowerCase() === e.name.toLowerCase()
				);
				if (matchingRaw) usedRawEntries.add(matchingRaw);

				const entryP = menuInfo.createEl('p', { cls: 'tf-ml-8' });
				entryP.appendText(emoji + ' ' + translateSpecialDayName(e.name.toLowerCase(), e.name) + durationText);

				// Show comment if exists
				if (matchingRaw?.comment) {
					const commentSpan = entryP.createSpan({ cls: 'tf-context-menu-comment' });
					commentSpan.appendText(' 💬 ' + (matchingRaw.comment.length > 40 ? matchingRaw.comment.substring(0, 37) + '...' : matchingRaw.comment));
					commentSpan.title = matchingRaw.comment; // Full text on hover
				}

				// Show overtime payout if exists
				if (matchingRaw?.overtimePayout && matchingRaw.overtimePayout > 0) {
					const payoutSpan = entryP.createSpan({ cls: 'tf-context-menu-payout tf-text-muted' });
					const payoutFormatted = Utils.formatHoursToHM(matchingRaw.overtimePayout, this.settings.hourUnit);
					payoutSpan.appendText(` | ${payoutFormatted} ${t('modals.hoursPayedOut')}`);
				}
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
		window.setTimeout(() => {
			const closeMenu = (e: MouseEvent) => {
				if (!menu.contains(e.target as Node)) {
					menu.remove();
					activeDocument.removeEventListener('click', closeMenu);
				}
			};
			activeDocument.addEventListener('click', closeMenu);
		}, 0);
	}

	/**
	 * Show confirmation dialog for overnight shift detection.
	 */
	private showOvernightShiftConfirmation(onConfirm: () => void): void {
		const modal = createDiv();
		modal.className = 'modal-container mod-dim tf-modal-z1001';

		const modalBg = createDiv();
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => modal.remove();
		modal.appendChild(modalBg);

		const modalContent = createDiv();
		modalContent.className = 'modal tf-modal-content-350';

		const title = createDiv();
		title.className = 'modal-title';
		title.textContent = t('confirm.overnightShiftTitle');
		modalContent.appendChild(title);

		const content = createDiv();
		content.className = 'modal-content tf-modal-content-padded';

		const message = createEl('p');
		message.textContent = t('confirm.overnightShift');
		content.appendChild(message);

		const buttonDiv = createDiv();
		buttonDiv.className = 'tf-btn-row-end-mt';

		const cancelBtn = createEl('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => modal.remove();
		buttonDiv.appendChild(cancelBtn);

		const confirmBtn = createEl('button');
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
		activeDocument.body.appendChild(modal);
	}

	/**
	 * Show a generic confirmation dialog that replaces browser confirm().
	 * @param message The message to display
	 * @param onConfirm Callback when user confirms
	 * @param title Optional title (defaults to "Confirm")
	 */
	private showConfirmDialog(message: string, onConfirm: () => void | Promise<void>, title?: string): void {
		const modal = createDiv();
		modal.className = 'modal-container mod-dim tf-modal-z1001';

		const modalBg = createDiv();
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => modal.remove();
		modal.appendChild(modalBg);

		const modalContent = createDiv();
		modalContent.className = 'modal tf-modal-content-350';

		const titleEl = createDiv();
		titleEl.className = 'modal-title';
		titleEl.textContent = title || t('buttons.confirm');
		modalContent.appendChild(titleEl);

		const content = createDiv();
		content.className = 'modal-content tf-modal-content-padded';

		const messageEl = createEl('p');
		messageEl.textContent = message;
		content.appendChild(messageEl);

		const buttonDiv = createDiv();
		buttonDiv.className = 'tf-btn-row-end-mt';

		const cancelBtn = createEl('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => modal.remove();
		buttonDiv.appendChild(cancelBtn);

		const confirmBtn = createEl('button');
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
		activeDocument.body.appendChild(modal);
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
		const modal = createDiv();
		modal.className = 'modal-container mod-dim tf-modal-z';

		const modalBg = createDiv();
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => { this.isModalOpen = false; modal.remove(); };
		modal.appendChild(modalBg);

		const modalContent = createDiv();
		modalContent.className = 'modal tf-modal-w-400';

		// Prevent Obsidian from capturing keyboard events in modal inputs
		modalContent.addEventListener('keydown', (e) => e.stopPropagation());
		modalContent.addEventListener('keyup', (e) => e.stopPropagation());
		modalContent.addEventListener('keypress', (e) => e.stopPropagation());
		modalContent.addEventListener('beforeinput', (e) => e.stopPropagation());
		modalContent.addEventListener('input', (e) => e.stopPropagation());

		// Title
		const title = createDiv();
		title.className = 'modal-title';
		title.textContent = `${t('modals.logWorkTitle')} ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = createDiv();
		content.className = 'modal-content tf-modal-content-padded';

		// Start time
		const startLabel = createDiv();
		startLabel.textContent = t('modals.startTimeFormat');
		startLabel.className = 'tf-form-label-bold';
		content.appendChild(startLabel);

		const startInput = this.createTimeInput('08:00', () => {});
		startInput.className = 'tf-form-input-full tf-form-input-mb';
		content.appendChild(startInput);

		// End time
		const endLabel = createDiv();
		endLabel.textContent = t('modals.endTimeFormat');
		endLabel.className = 'tf-form-label-bold';
		content.appendChild(endLabel);

		const endInput = this.createTimeInput('15:30', () => {});
		endInput.className = 'tf-form-input-full tf-form-input-mb-lg';
		content.appendChild(endInput);

		// Buttons
		const buttonDiv = createDiv();
		buttonDiv.className = 'tf-btn-row-end';

		const cancelBtn = createEl('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => { this.isModalOpen = false; modal.remove(); };
		buttonDiv.appendChild(cancelBtn);

		const addBtn = createEl('button');
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

					this.isModalOpen = false;
					modal.remove();

					// Trigger full dashboard refresh to update all UI including system status
					this.timerManager.onTimerChange?.();
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

		activeDocument.body.appendChild(modal);
		startInput.focus();
		startInput.select();
	}

	// Collect all work entries for a date (including subEntries from collapsed Timekeep entries).
	private getWorkEntriesForDate(dateStr: string): { entry: Timer; parent?: Timer; subIndex?: number }[] {
		const workEntries: { entry: Timer; parent?: Timer; subIndex?: number }[] = [];
		this.timerManager.data.entries.forEach(entry => {
			if (entry.collapsed && Array.isArray(entry.subEntries)) {
				entry.subEntries.forEach((sub, idx) => {
					if (sub.startTime && Utils.toLocalDateStr(new Date(sub.startTime)) === dateStr) {
						workEntries.push({ entry: sub, parent: entry, subIndex: idx });
					}
				});
			} else if (entry.startTime && Utils.toLocalDateStr(new Date(entry.startTime)) === dateStr) {
				workEntries.push({ entry });
			}
		});
		return workEntries;
	}

	showEditEntriesModal(dateObj: Date): void {
		const dateStr = Utils.toLocalDateStr(dateObj);

		// Get all work entries for this date (incl. collapsed Timekeep subEntries)
		const workEntries = this.getWorkEntriesForDate(dateStr);

		if (workEntries.length === 0) {
			new Notice(t('notifications.noWorkEntriesFound'));
			return;
		}

		// Sort entries by end time to find the last one (for overtime payout UI)
		const sortedWorkEntries = [...workEntries].sort((a, b) => {
			const endA = a.entry.endTime ? new Date(a.entry.endTime).getTime() : Date.now();
			const endB = b.entry.endTime ? new Date(b.entry.endTime).getTime() : Date.now();
			return endA - endB;
		});
		const lastEntryItem = sortedWorkEntries[sortedWorkEntries.length - 1];

		// Calculate total worked hours for the day and overtime
		const dayGoal = this.data.getDailyGoal(dateStr);
		let totalWorkedHours = 0;
		workEntries.forEach(item => {
			if (item.entry.endTime) {
				const start = new Date(item.entry.startTime!);
				const end = new Date(item.entry.endTime);
				totalWorkedHours += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
			}
		});
		const dayOvertime = Math.max(0, totalWorkedHours - dayGoal);

		this.isModalOpen = true;

		// Create modal
		const modal = createDiv();
		modal.className = 'modal-container mod-dim tf-modal-z';

		const modalBg = createDiv();
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => { this.isModalOpen = false; modal.remove(); };
		modal.appendChild(modalBg);

		const modalContent = createDiv();
		modalContent.className = 'modal tf-modal-w-500';

		// Prevent Obsidian from capturing keyboard events in modal inputs
		modalContent.addEventListener('keydown', (e) => e.stopPropagation());
		modalContent.addEventListener('keyup', (e) => e.stopPropagation());
		modalContent.addEventListener('keypress', (e) => e.stopPropagation());
		modalContent.addEventListener('beforeinput', (e) => e.stopPropagation());
		modalContent.addEventListener('input', (e) => e.stopPropagation());

		// Title
		const title = createDiv();
		title.className = 'modal-title';
		title.textContent = `${t('modals.editWorkTitle')} ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = createDiv();
		content.className = 'modal-content tf-modal-content-padded';

		// List all entries with edit/delete options
		workEntries.forEach((item, index) => {
			const entry = item.entry;
			const entryDiv = createDiv();
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
			const infoDiv = createDiv();
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
			const editDiv = createDiv();
			editDiv.className = 'tf-edit-section tf-hidden';

			// Start date + time row
			const startLabel = createDiv();
			startLabel.textContent = `${t('modals.startTime')}:`;
			startLabel.className = 'tf-label-bold-mb';
			editDiv.appendChild(startLabel);

			const startRow = createDiv();
			startRow.className = 'tf-datetime-row';

			const startDateInput = createEl('input');
			startDateInput.type = 'date';
			startDateInput.value = startDateStr;
			startDateInput.className = 'tf-input-flex-p';
			startRow.appendChild(startDateInput);

			const startTimeInput = this.createTimeInput(startTimeStr, () => {});
			startTimeInput.className = 'tf-input-flex-p';
			startRow.appendChild(startTimeInput);

			editDiv.appendChild(startRow);

			// End date + time row
			const endLabel = createDiv();
			endLabel.textContent = `${t('modals.endTime')}:`;
			endLabel.className = 'tf-label-bold-mb';
			editDiv.appendChild(endLabel);

			const endRow = createDiv();
			endRow.className = 'tf-datetime-row';

			const endDateInput = createEl('input');
			endDateInput.type = 'date';
			endDateInput.value = endDateStr || startDateStr;
			endDateInput.className = 'tf-input-flex-p';
			endRow.appendChild(endDateInput);

			const endTimeInput = this.createTimeInput(endTimeStr !== t('ui.ongoing') ? endTimeStr : '', () => {});
			endTimeInput.className = 'tf-input-flex-p';
			endRow.appendChild(endTimeInput);

			editDiv.appendChild(endRow);

			// Overtime payout section (only for the last entry of the day)
			let overtimePayoutInput: HTMLInputElement | null = null;
			let overtimePayoutCheckbox: HTMLInputElement | null = null;
			const isLastEntry = item.entry === lastEntryItem.entry;

			if (isLastEntry && dayOvertime > 0) {
				const payoutSection = createDiv();
				payoutSection.className = 'tf-overtime-payout-section tf-section-divider';

				const checkboxRow = createDiv();
				checkboxRow.className = 'tf-checkbox-row';

				overtimePayoutCheckbox = createEl('input');
				overtimePayoutCheckbox.type = 'checkbox';
				overtimePayoutCheckbox.id = `overtime-payout-${index}`;
				overtimePayoutCheckbox.checked = (entry.overtimePayout ?? 0) > 0;

				const checkboxLabel = createEl('label');
				checkboxLabel.htmlFor = `overtime-payout-${index}`;
				checkboxLabel.textContent = t('modals.overtimePayout');
				checkboxLabel.className = 'tf-cursor-pointer';

				checkboxRow.appendChild(overtimePayoutCheckbox);
				checkboxRow.appendChild(checkboxLabel);
				payoutSection.appendChild(checkboxRow);

				// Hours + minutes inputs (shown when checkbox is checked)
				const inputRow = createDiv();
				inputRow.className = 'tf-overtime-payout-input-row tf-input-row tf-mt-8';
				if (!overtimePayoutCheckbox.checked) {
					inputRow.addClass('tf-hidden');
				}

				const inputLabel = createEl('label');
				inputLabel.textContent = `${t('modals.overtimePayoutHours')}:`;
				inputLabel.className = 'tf-whitespace-nowrap';

				// Convert decimal hours to hours and minutes
				const initialValue = entry.overtimePayout ?? dayOvertime;
				const initialHours = Math.floor(initialValue);
				const initialMinutes = Math.round((initialValue - initialHours) * 60);

				// Hours input
				const hoursInput = createEl('input');
				hoursInput.type = 'number';
				hoursInput.min = '0';
				hoursInput.value = initialHours.toString();
				hoursInput.className = 'tf-input-flex-p tf-input-w-50';

				const hoursLabel = createSpan();
				hoursLabel.textContent = this.settings.hourUnit;

				// Minutes input
				const minutesInput = createEl('input');
				minutesInput.type = 'number';
				minutesInput.min = '0';
				minutesInput.max = '59';
				minutesInput.value = initialMinutes.toString();
				minutesInput.className = 'tf-input-flex-p tf-input-w-50';

				const minutesLabel = createSpan();
				minutesLabel.textContent = 'Min';

				// Hidden input to store the decimal value (used by save logic)
				overtimePayoutInput = createEl('input');
				overtimePayoutInput.type = 'hidden';
				overtimePayoutInput.value = initialValue.toFixed(2);

				// Capture non-null references for closures
				const payoutInput = overtimePayoutInput;
				const checkbox = overtimePayoutCheckbox;

				// Update hidden input when hours/minutes change
				const updateHiddenValue = () => {
					const hours = parseInt(hoursInput.value) || 0;
					const minutes = parseInt(minutesInput.value) || 0;
					const decimalValue = hours + (minutes / 60);
					payoutInput.value = decimalValue.toFixed(2);
				};
				hoursInput.onchange = updateHiddenValue;
				hoursInput.oninput = updateHiddenValue;
				minutesInput.onchange = updateHiddenValue;
				minutesInput.oninput = updateHiddenValue;

				const maxLabel = createSpan();
				maxLabel.textContent = `(max ${Utils.formatHoursToHM(dayOvertime, this.settings.hourUnit)})`;
				maxLabel.className = 'tf-text-muted tf-text-small';

				inputRow.appendChild(inputLabel);
				inputRow.appendChild(hoursInput);
				inputRow.appendChild(hoursLabel);
				inputRow.appendChild(minutesInput);
				inputRow.appendChild(minutesLabel);
				inputRow.appendChild(maxLabel);
				inputRow.appendChild(overtimePayoutInput);
				payoutSection.appendChild(inputRow);

				// Toggle input visibility when checkbox changes
				checkbox.onchange = () => {
					inputRow.toggleClass('tf-hidden', !checkbox.checked);
					if (checkbox.checked && payoutInput) {
						// Auto-populate with current overtime if not already set
						if (!entry.overtimePayout) {
							const hours = Math.floor(dayOvertime);
							const minutes = Math.round((dayOvertime - hours) * 60);
							hoursInput.value = hours.toString();
							minutesInput.value = minutes.toString();
							payoutInput.value = dayOvertime.toFixed(2);
						}
					}
				};

				editDiv.appendChild(payoutSection);
			} else if (isLastEntry && dayOvertime === 0) {
				// Show disabled message when there's no overtime
				const noOvertimeDiv = createDiv();
				noOvertimeDiv.className = 'tf-section-divider tf-text-muted tf-italic';
				noOvertimeDiv.textContent = t('modals.noOvertimeAvailable');
				editDiv.appendChild(noOvertimeDiv);
			}

			entryDiv.appendChild(editDiv);

			// Buttons
			const buttonDiv = createDiv();
			buttonDiv.className = "tf-modal-btn-row";

			const editBtn = createEl('button');
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

						// Handle overtime payout (only for last entry)
						if (isLastEntry && overtimePayoutCheckbox && overtimePayoutInput) {
							if (overtimePayoutCheckbox.checked) {
								const payoutValue = parseFloat(overtimePayoutInput.value);
								if (!isNaN(payoutValue) && payoutValue >= 0) {
									// Add small tolerance (0.01) for floating point comparison
									// This handles cases where dayOvertime=1.479999 displays as "1.48" but 1.48 > 1.479999
									if (payoutValue > dayOvertime + 0.01) {
										new Notice(`❌ ${t('modals.payoutExceedsOvertime').replace('{hours}', dayOvertime.toFixed(2))}`);
										return;
									}
									entry.overtimePayout = payoutValue;
								}
							} else {
								// Checkbox unchecked - remove overtime payout
								delete entry.overtimePayout;
							}
						}

						// Update the entry (use local ISO format)
						entry.startTime = Utils.toLocalISOString(newStartDate);
						entry.endTime = finalEndDate ? Utils.toLocalISOString(finalEndDate) : null;

						await this.saveWithErrorHandling();
						new Notice(`✅ ${t('notifications.entryUpdated')}`);

						this.isModalOpen = false;
						modal.remove();

						// Trigger full dashboard refresh to update all UI including system status
						this.timerManager.onTimerChange?.();
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

			const deleteBtn = createEl('button');
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

						this.isModalOpen = false;
						modal.remove();

						// Trigger full dashboard refresh to update all UI including system status
						this.timerManager.onTimerChange?.();
					}
				});
			};
			buttonDiv.appendChild(deleteBtn);

			entryDiv.appendChild(buttonDiv);
			content.appendChild(entryDiv);
		});

		// Close button
		const closeDiv = createDiv();
		closeDiv.className = "tf-modal-close-row";

		const closeBtn = createEl('button');
		closeBtn.textContent = t('buttons.close');
		closeBtn.onclick = () => { this.isModalOpen = false; modal.remove(); };
		closeDiv.appendChild(closeBtn);

		content.appendChild(closeDiv);
		modalContent.appendChild(content);
		modal.appendChild(modalContent);

		activeDocument.body.appendChild(modal);
	}

	// Register an absence. Renders as a modal by default, or inline into opts.container
	// (used by the calendar day drawer's "Add absence" action so it matches the inline edit flow).
	showSpecialDayModal(dateObj: Date, opts: { container?: HTMLElement; onComplete?: () => void; onCancel?: () => void } = {}): void {
		const dateStr = Utils.toLocalDateStr(dateObj);
		const inline = !!opts.container;

		// Prevent Obsidian from capturing keyboard events in the form inputs.
		const guardKeys = (el: HTMLElement) => {
			['keydown', 'keyup', 'keypress', 'beforeinput', 'input'].forEach(ev =>
				el.addEventListener(ev, (e) => e.stopPropagation()));
		};

		let modal: HTMLElement | null = null;
		let modalContent: HTMLElement | null = null;
		let content: HTMLElement;

		if (inline) {
			content = opts.container!;
			content.empty();
			content.addClass('tf-absence-inline');
			guardKeys(content);
		} else {
			this.isModalOpen = true;
			modal = createDiv();
			modal.className = 'modal-container mod-dim tf-modal-z';
			const modalBg = createDiv();
			modalBg.className = 'modal-bg';
			modalBg.onclick = () => { this.isModalOpen = false; modal!.remove(); };
			modal.appendChild(modalBg);

			modalContent = createDiv();
			modalContent.className = 'modal tf-modal-w-400';
			guardKeys(modalContent);

			const title = createDiv();
			title.className = 'modal-title';
			title.textContent = t('modals.registerSpecialDayTitle');
			modalContent.appendChild(title);

			content = createDiv();
			content.className = 'modal-content tf-modal-content-padded';
		}

		// Close the form: collapse inline, or tear down the modal.
		const closeForm = () => {
			if (inline) { opts.onCancel?.(); }
			else { this.isModalOpen = false; modal!.remove(); }
		};
		const completeForm = () => {
			if (inline) { opts.onComplete?.(); }
			else { this.isModalOpen = false; modal!.remove(); }
		};

		// Date display (single day mode)
		const dateDisplay = createDiv();
		dateDisplay.textContent = `${t('ui.date')}: ${dateStr}`;
		dateDisplay.className = 'tf-date-display';
		content.appendChild(dateDisplay);

		// Multi-day toggle container
		const multiDayContainer = createDiv();
		multiDayContainer.className = 'tf-mb-15';

		// Multiple days checkbox row
		const multiDayRow = createDiv();
		multiDayRow.className = 'tf-checkbox-row';

		const multiDayCheckbox = createEl('input');
		multiDayCheckbox.type = 'checkbox';
		multiDayCheckbox.id = 'multiDayCheckbox';
		multiDayRow.appendChild(multiDayCheckbox);

		const multiDayLabel = createEl('label');
		multiDayLabel.htmlFor = 'multiDayCheckbox';
		multiDayLabel.textContent = t('ui.multipleDays');
		multiDayLabel.className = 'tf-cursor-pointer';
		multiDayRow.appendChild(multiDayLabel);

		multiDayContainer.appendChild(multiDayRow);

		// Date range inputs (hidden by default)
		const dateRangeContainer = createDiv();
		dateRangeContainer.className = 'tf-hidden';

		// Start date row
		const startDateRow = createDiv();
		startDateRow.className = 'tf-date-row';

		const startDateLabel = createSpan();
		startDateLabel.textContent = t('ui.startDate') + ':';
		startDateLabel.className = 'tf-date-label';
		startDateRow.appendChild(startDateLabel);

		const startDateInput = createEl('input');
		startDateInput.type = 'date';
		startDateInput.value = dateStr;
		startDateInput.className = 'tf-input-grow';
		startDateRow.appendChild(startDateInput);

		dateRangeContainer.appendChild(startDateRow);

		// End date row
		const endDateRow = createDiv();
		endDateRow.className = 'tf-date-row tf-mb-0';

		const endDateLabel = createSpan();
		endDateLabel.textContent = t('ui.endDate') + ':';
		endDateLabel.className = 'tf-date-label';
		endDateRow.appendChild(endDateLabel);

		const endDateInput = createEl('input');
		endDateInput.type = 'date';
		endDateInput.value = dateStr;
		endDateInput.className = 'tf-input-grow';
		endDateRow.appendChild(endDateInput);

		dateRangeContainer.appendChild(endDateRow);

		// Days count display
		const daysCountDisplay = createDiv();
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
		const typeLabel = createDiv();
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

		const typeSelect = createEl('select');
		typeSelect.className = 'tf-select-full';

		dayTypes.forEach(({ type, label }) => {
			const option = createEl('option');
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
		const timeContainer = createDiv();
		timeContainer.className = 'tf-mb-15 tf-hidden';

		const timeLabel = createDiv();
		timeLabel.textContent = 'Tidsperiode:';
		timeLabel.className = 'tf-label-bold-mb';
		timeContainer.appendChild(timeLabel);

		// Time inputs row
		const timeInputRow = createDiv();
		timeInputRow.className = 'tf-time-input-row';

		const fromLabel = createSpan();
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

		const toLabel = createSpan();
		toLabel.textContent = 'Til:';
		timeInputRow.appendChild(toLabel);

		const toTimeInput = this.createTimeInput(defaultEndTime, () => {});
		toTimeInput.className = 'tf-time-input-styled';
		timeInputRow.appendChild(toTimeInput);

		timeContainer.appendChild(timeInputRow);

		// Duration display for avspasering
		const durationDisplay = createDiv();
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
		const sickTimeContainer = createDiv();
		sickTimeContainer.className = 'tf-mb-15 tf-hidden';

		const sickTimeLabel = createDiv();
		sickTimeLabel.textContent = t('modals.timePeriod') || 'Tidsperiode:';
		sickTimeLabel.className = 'tf-label-bold-mb';
		sickTimeContainer.appendChild(sickTimeLabel);

		// Time inputs row for sick days
		const sickTimeInputRow = createDiv();
		sickTimeInputRow.className = 'tf-time-input-row';

		const sickFromLabel = createSpan();
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

		const sickToLabel = createSpan();
		sickToLabel.textContent = t('modals.to') || 'Til:';
		sickTimeInputRow.appendChild(sickToLabel);

		const sickToTimeInput = this.createTimeInput(autoSickToTime, () => {});
		sickToTimeInput.className = 'tf-time-input-styled';
		sickTimeInputRow.appendChild(sickToTimeInput);

		sickTimeContainer.appendChild(sickTimeInputRow);

		// Duration display for sick days
		const sickDurationDisplay = createDiv();
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
		const fullDayRow = createDiv();
		fullDayRow.className = 'tf-checkbox-row-mt';

		const fullDayCheckbox = createEl('input');
		fullDayCheckbox.type = 'checkbox';
		fullDayCheckbox.id = 'fullDayCheckbox';
		// If there are work entries for the day, default to partial sick day
		fullDayCheckbox.checked = workEntries.length === 0;
		fullDayRow.appendChild(fullDayCheckbox);

		const fullDayLabel = createEl('label');
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
		const annetContainer = createDiv();
		annetContainer.className = 'tf-mb-15 tf-hidden';

		// Template selector
		const annetTemplateLabel = createDiv();
		annetTemplateLabel.textContent = t('annet.selectTemplate');
		annetTemplateLabel.className = 'tf-label-bold-mb-8';
		annetContainer.appendChild(annetTemplateLabel);

		// Template buttons container
		const annetTemplateButtons = createDiv();
		annetTemplateButtons.className = 'tf-template-btn-container';

		let selectedAnnetTemplate: string | null = null;

		// Create template buttons
		const annetTemplates = this.settings.annetTemplates || [];
		// We'll store button references to update them after saveAsTemplateContainer is created
		const templateButtonRefs: HTMLButtonElement[] = [];
		annetTemplates.forEach(template => {
			const btn = createEl('button');
			btn.textContent = `${template.icon} ${translateAnnetTemplateName(template.id, template.label)}`;
			btn.className = 'tf-template-btn';
			btn.dataset.templateId = template.id;
			templateButtonRefs.push(btn);
			annetTemplateButtons.appendChild(btn);
		});

		// Custom/Egendefinert button
		const customBtn = createEl('button');
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
		const saveAsTemplateContainer = createDiv();
		saveAsTemplateContainer.className = 'tf-save-template-container tf-hidden';

		// Name row (always visible when custom is selected)
		const templateNameRow = createDiv();
		templateNameRow.className = 'tf-flex-input-row';

		const templateNameLabel = createSpan();
		templateNameLabel.textContent = t('annet.templateName') + ':';
		templateNameLabel.className = 'tf-date-label';
		templateNameRow.appendChild(templateNameLabel);

		const templateNameInput = createEl('input');
		templateNameInput.type = 'text';
		templateNameInput.className = 'tf-input-grow';
		templateNameInput.placeholder = t('annet.labelPlaceholder');
		templateNameRow.appendChild(templateNameInput);

		saveAsTemplateContainer.appendChild(templateNameRow);

		// Icon row (always visible when custom is selected)
		const templateIconRow = createDiv();
		templateIconRow.className = 'tf-flex-input-row';

		const templateIconLabel = createSpan();
		templateIconLabel.textContent = t('annet.templateIcon') + ':';
		templateIconLabel.className = 'tf-date-label';
		templateIconRow.appendChild(templateIconLabel);

		const templateIconInput = createEl('input');
		templateIconInput.type = 'text';
		templateIconInput.className = 'tf-icon-input';
		templateIconInput.placeholder = '🏥';
		templateIconRow.appendChild(templateIconInput);

		saveAsTemplateContainer.appendChild(templateIconRow);

		// Save as template checkbox row
		const saveAsTemplateRow = createDiv();
		saveAsTemplateRow.className = 'tf-save-template-row';

		const saveAsTemplateCheckbox = createEl('input');
		saveAsTemplateCheckbox.type = 'checkbox';
		saveAsTemplateCheckbox.id = 'saveAsTemplateCheckbox';
		saveAsTemplateRow.appendChild(saveAsTemplateCheckbox);

		const saveAsTemplateLabel = createEl('label');
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
		const annetFullDayRow = createDiv();
		annetFullDayRow.className = 'tf-checkbox-row-mb';

		const annetFullDayCheckbox = createEl('input');
		annetFullDayCheckbox.type = 'checkbox';
		annetFullDayCheckbox.id = 'annetFullDayCheckbox';
		annetFullDayCheckbox.checked = true;
		annetFullDayRow.appendChild(annetFullDayCheckbox);

		const annetFullDayLabel = createEl('label');
		annetFullDayLabel.htmlFor = 'annetFullDayCheckbox';
		annetFullDayLabel.textContent = t('annet.fullDay');
		annetFullDayLabel.className = 'tf-cursor-pointer';
		annetFullDayRow.appendChild(annetFullDayLabel);

		annetContainer.appendChild(annetFullDayRow);

		// Time inputs for partial day annet
		const annetTimeInputRow = createDiv();
		annetTimeInputRow.className = 'tf-time-input-row tf-mb-12 tf-hidden';

		const annetFromLabel = createSpan();
		annetFromLabel.textContent = t('annet.fromTime') + ':';
		annetTimeInputRow.appendChild(annetFromLabel);

		const annetFromTimeInput = this.createTimeInput('09:00', () => {});
		annetFromTimeInput.className = 'tf-time-input-styled';
		annetTimeInputRow.appendChild(annetFromTimeInput);

		const annetToLabel = createSpan();
		annetToLabel.textContent = t('annet.toTime') + ':';
		annetTimeInputRow.appendChild(annetToLabel);

		const annetToTimeInput = this.createTimeInput('11:00', () => {});
		annetToTimeInput.className = 'tf-time-input-styled';
		annetTimeInputRow.appendChild(annetToTimeInput);

		annetContainer.appendChild(annetTimeInputRow);

		// Duration display for annet
		const annetDurationDisplay = createDiv();
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
		const noteLabel = createDiv();
		noteLabel.textContent = t('modals.commentOptional');
		noteLabel.className = 'tf-label-bold-mb';
		content.appendChild(noteLabel);

		const noteInput = createEl('input');
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
		const buttonDiv = createDiv();
		buttonDiv.className = 'tf-btn-container';

		// Inline mode mirrors the edit flow: no Cancel button (the toggle collapses it) and a
		// single full-width accent button. Modal mode keeps Cancel + a standard CTA.
		const cancelBtn = createEl('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = closeForm;
		if (!inline) buttonDiv.appendChild(cancelBtn);

		const addBtn = createEl('button');
		addBtn.textContent = t('buttons.add');
		addBtn.className = inline ? 'tf-drawer-action-btn tf-drawer-edit-save' : 'mod-cta';
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

			completeForm();
		};
		buttonDiv.appendChild(addBtn);

		content.appendChild(buttonDiv);

		if (inline) {
			typeSelect.focus();
		} else {
			modalContent!.appendChild(content);
			modal!.appendChild(modalContent!);
			activeDocument.body.appendChild(modal!);
			typeSelect.focus();
		}
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

			// Trigger full dashboard refresh to update all UI including system status
			this.timerManager.onTimerChange?.();
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

			// Trigger full dashboard refresh to update all UI including system status
			this.timerManager.onTimerChange?.();
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
		const modal = createDiv();
		modal.className = 'modal-container mod-dim tf-modal-z1000';

		const modalBg = createDiv();
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => { this.isModalOpen = false; modal.remove(); };
		modal.appendChild(modalBg);

		const modalContent = createDiv();
		modalContent.className = 'modal tf-modal-content-400';

		// Prevent Obsidian from capturing keyboard events
		modalContent.addEventListener('keydown', (e) => e.stopPropagation());
		modalContent.addEventListener('keyup', (e) => e.stopPropagation());
		modalContent.addEventListener('keypress', (e) => e.stopPropagation());
		modalContent.addEventListener('beforeinput', (e) => e.stopPropagation());
		modalContent.addEventListener('input', (e) => e.stopPropagation());

		// Title
		const title = createDiv();
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
		const content = createDiv();
		content.className = 'modal-content tf-modal-content-padded';

		// Date display
		const dateDisplay = createDiv();
		dateDisplay.textContent = `${t('ui.date')}: ${dateStr}`;
		dateDisplay.className = 'tf-date-display';
		content.appendChild(dateDisplay);

		// Type display (read-only)
		const typeDisplay = createDiv();
		typeDisplay.className = 'tf-type-display';
		const typeLabel = createEl('strong');
		typeLabel.textContent = `${t('ui.type')}:`;
		typeDisplay.appendChild(typeLabel);
		typeDisplay.appendText(` ${emoji} ${typeName}`);
		if (plannedInfo.halfDay) {
			typeDisplay.appendText(' (½)');
		}
		content.appendChild(typeDisplay);

		// Time display (if applicable)
		if (plannedInfo.startTime && plannedInfo.endTime) {
			const timeDisplay = createDiv();
			timeDisplay.className = 'tf-mb-15';
			const timeLabel = createEl('strong');
			timeLabel.textContent = `${t('ui.start')} - ${t('ui.end')}:`;
			timeDisplay.appendChild(timeLabel);
			timeDisplay.appendText(` ${plannedInfo.startTime} - ${plannedInfo.endTime}`);
			content.appendChild(timeDisplay);
		}

		// Description input
		const descRow = createDiv();
		descRow.className = 'tf-desc-row';

		const descLabel = createEl('label');
		descLabel.textContent = `${t('ui.comment')} (${t('ui.optional')}):`;
		descLabel.className = 'tf-label-block';
		descRow.appendChild(descLabel);

		const descInput = createEl('input');
		descInput.type = 'text';
		descInput.value = plannedInfo.description || '';
		descInput.className = 'tf-input-full';
		descRow.appendChild(descInput);

		content.appendChild(descRow);

		// Button container
		const buttonDiv = createDiv();
		buttonDiv.className = 'tf-btn-space-between';

		// Delete button (left side)
		const deleteBtn = createEl('button');
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
		const rightButtons = createDiv();
		rightButtons.className = "tf-flex tf-gap-10";

		// Cancel button
		const cancelBtn = createEl('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => {
			this.isModalOpen = false;
			modal.remove();
		};
		rightButtons.appendChild(cancelBtn);

		// Save button
		const saveBtn = createEl('button');
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
		activeDocument.body.appendChild(modal);

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

			// Trigger full dashboard refresh to update all UI including system status
			this.timerManager.onTimerChange?.();
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

			// Trigger full dashboard refresh to update all UI including system status
			this.timerManager.onTimerChange?.();
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
		editToggle.textContent = this.inlineEditMode ? t('buttons.done') : t('buttons.edit');
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
		window.requestAnimationFrame(() => {
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
		const filterBar = createDiv();
		filterBar.className = 'tf-history-filters';

		// "Alle" chip (active when no filter applied)
		const alleChip = createEl('button');
		alleChip.className = `tf-filter-chip ${this.historyFilter.length === 0 ? 'active' : ''}`;
		alleChip.textContent = t('ui.all');
		alleChip.onclick = () => {
			this.historyFilter = [];
			this.refreshHistoryView(container);
		};
		filterBar.appendChild(alleChip);

		// Add chips for each special day behavior
		this.settings.specialDayBehaviors.forEach(behavior => {
			const chip = createEl('button');
			const isActive = this.historyFilter.includes(behavior.id);
			chip.className = `tf-filter-chip ${isActive ? 'active' : ''}`;
			chip.textContent = translateSpecialDayName(behavior.id, behavior.label);
			// Inactive chips take the type colour (active chips use the accent via CSS)
			if (!isActive) {
				chip.style.color = behavior.color;
			}
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
		const section = createDiv();
		section.className = 'tf-active-entries-section tf-active-section-container';

		const header = createDiv();
		header.className = 'tf-active-section-header';
		header.textContent = `⏱️ ${t('ui.activeTimers')} (${activeEntries.length})`;
		section.appendChild(header);

		// Detect if we're in wide mode
		const isWide = containerForWidth ? containerForWidth.offsetWidth >= 450 : false;

		// Create table for active entries
		const table = createEl('table');
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
		const thead = createEl('thead');
		const headerRow = createEl('tr');
		const headers = isWide
			? (this.inlineEditMode
				? [t('ui.date'), t('ui.type'), t('ui.start'), t('ui.hours'), t('ui.flextime'), '']
				: [t('ui.date'), t('ui.type'), t('ui.start'), t('ui.hours'), t('ui.flextime')])
			: [t('ui.date'), t('ui.type'), t('ui.hours'), ''];
		headers.forEach(h => {
			const th = createEl('th');
			th.textContent = h;
			headerRow.appendChild(th);
		});
		thead.appendChild(headerRow);
		table.appendChild(thead);

		// Table body
		const tbody = createEl('tbody');
		activeEntries.forEach(e => {
			const row = createEl('tr');
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
			const dateCell = createEl('td');
			const activeIcon = createSpan();
			activeIcon.textContent = '⏱️ ';
			activeIcon.title = t('ui.activeTimer');
			activeIcon.className = 'tf-cursor-help';
			dateCell.appendChild(activeIcon);
			dateCell.appendChild(activeDocument.createTextNode(formatDate(new Date(dateStr + 'T00:00:00'), 'long')));
			row.appendChild(dateCell);

			// Type cell - with inline editing in wide mode
			const typeCell = createEl('td');
			if (isWide && this.inlineEditMode && matchingRaw) {
				const select = createEl('select');
				this.settings.specialDayBehaviors.forEach(behavior => {
					const option = createEl('option');
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
				const entryNameLower = e.name.toLowerCase();
				const typeBehavior = this.settings.specialDayBehaviors.find(b => b.id === entryNameLower);
				const typeChip = typeCell.createSpan({ cls: 'tf-history-type-chip', text: translateSpecialDayName(entryNameLower, e.name) });
				if (typeBehavior?.color && /^#[0-9a-f]{6}$/i.test(typeBehavior.color)) {
					typeChip.setCssStyles({ color: typeBehavior.textColor || '#fff', background: typeBehavior.color });
				} else {
					typeChip.setCssStyles({ color: 'var(--color-muted)', background: 'var(--color-raised)' });
				}
			}
			row.appendChild(typeCell);

			// Start time cell (only in wide mode)
			if (isWide) {
				const startCell = createEl('td');
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
			const hoursCell = createEl('td');
			const hoursText = Utils.formatHoursToHM(e.duration || 0, this.settings.hourUnit);
			hoursCell.textContent = `${hoursText}...`;
			row.appendChild(hoursCell);

			// Flextime cell (only in wide mode)
			if (isWide) {
				const flextimeCell = createEl('td');
				const netFlextime = (e.flextime || 0) - (matchingRaw?.overtimePayout || 0);
				const flexMag = Utils.formatHoursToHM(Math.abs(netFlextime), this.settings.hourUnit);
				if (netFlextime > 1 / 60) {
					flextimeCell.textContent = `+${flexMag}`;
					flextimeCell.addClass('tf-history-flex-pos');
				} else if (netFlextime < -1 / 60) {
					flextimeCell.textContent = `−${flexMag}`;
					flextimeCell.addClass('tf-history-flex-neg');
				} else {
					flextimeCell.textContent = flexMag;
					flextimeCell.addClass('tf-history-flex-zero');
				}
				row.appendChild(flextimeCell);
			}

			// Action cell - edit button in narrow, delete in wide edit mode
			if (isWide && this.inlineEditMode) {
				const actionCell = createEl('td');
				if (matchingItem) {
					const deleteBtn = createEl('button');
					deleteBtn.className = 'tf-history-delete-btn';
					setIcon(deleteBtn, 'trash-2');
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
				const actionCell = createEl('td');
				const editBtn = createEl('button');
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
			const yearSection = createEl('details');
			yearSection.className = 'tf-history-year-section';
			// Expand current year by default, or first year if current year has no entries
			yearSection.open = (year === currentYear) || (index === 0 && !years[currentYear]);

			const summary = createEl('summary');
			summary.className = 'tf-year-summary';
			const arrow = createSpan();
			arrow.className = 'tf-mr-8';
			arrow.textContent = yearSection.open ? '▼' : '▶';
			summary.appendChild(arrow);
			summary.appendChild(activeDocument.createTextNode(year.toString()));
			yearSection.appendChild(summary);

			// Toggle arrow on open/close
			yearSection.addEventListener('toggle', () => {
				arrow.textContent = yearSection.open ? '▼' : '▶';
			});

			const yearDiv = createDiv();
			yearDiv.className = 'tf-year-content';

			// Sort months descending (newest first)
			Object.keys(years[year]).sort().reverse().forEach(month => {
				const monthEntries = years[year][month];

				// Add month name header
				const monthHeader = createEl('h5');
				monthHeader.textContent = getMonthName(new Date(parseInt(year), parseInt(month) - 1, 1));
				monthHeader.className = 'tf-month-header';
				yearDiv.appendChild(monthHeader);

				const table = createEl('table');
				table.className = 'tf-history-table-narrow';

				// Create thead
				const thead = createEl('thead');
				const headerRow = createEl('tr');
				[t('ui.date'), t('ui.type'), t('ui.hours'), t('ui.flextime'), ''].forEach(h => {
					const th = createEl('th');
					th.textContent = h;
					headerRow.appendChild(th);
				});
				thead.appendChild(headerRow);
				table.appendChild(thead);

				// Create tbody
				const tbody = createEl('tbody');

				// Get raw timer entries to access comments
				const rawEntries = this.timerManager.data.entries;
				const flatRawEntries: Timer[] = [];
				rawEntries.forEach(entry => {
					if (entry.collapsed && Array.isArray(entry.subEntries)) {
						entry.subEntries.forEach(sub => {
							if (sub.startTime) flatRawEntries.push(sub);
						});
					} else if (entry.startTime) {
						flatRawEntries.push(entry);
					}
				});

				monthEntries.forEach((e: TimeEntry) => {
					const row = createEl('tr');

					// Style active entries differently
					if (e.isActive) {
						row.className = 'tf-history-row-active';
					}

					// Find matching raw entry for comment
					const matchingRaw = flatRawEntries.find(item =>
						item.name.toLowerCase() === e.name.toLowerCase() &&
						item.startTime === e.startTime
					);

					// Date cell
					const dateCell = createEl('td');
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
						const activeIcon = createSpan();
						activeIcon.textContent = '⏱️ ';
						activeIcon.title = t('ui.activeTimer');
						activeIcon.className = 'tf-cursor-help';
						dateCell.appendChild(activeIcon);
					} else if (hasConflict && holidayInfo) {
						const flagIcon = createSpan();
						flagIcon.textContent = '⚠️ ';
						flagIcon.title = t('info.workRegisteredOnSpecialDay').replace('{dayType}', translateSpecialDayName(holidayInfo.type));
						flagIcon.className = 'tf-cursor-help';
						dateCell.appendChild(flagIcon);
					}
					dateCell.appendChild(activeDocument.createTextNode(formatDate(new Date(dateStr + 'T00:00:00'), 'long')));
					row.appendChild(dateCell);

					// Type cell
					const typeCell = createEl('td');
					const entryNameLower = e.name.toLowerCase();
					const typeBehavior = this.settings.specialDayBehaviors.find(b => b.id === entryNameLower);
						const typeChip = typeCell.createSpan({ cls: 'tf-history-type-chip', text: translateSpecialDayName(entryNameLower, e.name) });
						if (typeBehavior?.color && /^#[0-9a-f]{6}$/i.test(typeBehavior.color)) {
							typeChip.setCssStyles({ color: typeBehavior.textColor || '#fff', background: typeBehavior.color });
						} else {
							typeChip.setCssStyles({ color: 'var(--color-muted)', background: 'var(--color-raised)' });
						}
					row.appendChild(typeCell);

					// Hours cell
					const hoursCell = createEl('td');
					const hoursText = Utils.formatHoursToHM(e.duration || 0, this.settings.hourUnit);
					hoursCell.textContent = e.isActive ? `${hoursText}...` : hoursText;
					row.appendChild(hoursCell);

					// Flextime cell (subtract overtime payout if present)
					const flextimeCell = createEl('td');
					const netFlextime = (e.flextime || 0) - (matchingRaw?.overtimePayout || 0);
					const flexMag = Utils.formatHoursToHM(Math.abs(netFlextime), this.settings.hourUnit);
						if (netFlextime > 1 / 60) {
							flextimeCell.textContent = `+${flexMag}`;
							flextimeCell.addClass('tf-history-flex-pos');
						} else if (netFlextime < -1 / 60) {
							flextimeCell.textContent = `−${flexMag}`;
							flextimeCell.addClass('tf-history-flex-neg');
						} else {
							flextimeCell.textContent = flexMag;
							flextimeCell.addClass('tf-history-flex-zero');
						}
					row.appendChild(flextimeCell);

					// Action cell
					const actionCell = createEl('td');
					const editBtn = createEl('button');
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

					// Comment/info subtitle row (if entry has comment or overtime payout)
					const hasComment = matchingRaw?.comment;
					const hasOvertimePayout = matchingRaw?.overtimePayout && matchingRaw.overtimePayout > 0;
					if (hasComment || hasOvertimePayout) {
						const infoRow = createEl('tr');
						const infoCell = createEl('td');
						infoCell.colSpan = 5;
						infoCell.className = 'tf-comment-subtitle';

						const parts: string[] = [];
						if (hasComment) {
							parts.push(`💬 ${hasComment}`);
						}
						if (hasOvertimePayout) {
							const payoutFormatted = Utils.formatHoursToHM(matchingRaw.overtimePayout!, this.settings.hourUnit);
							parts.push(`${payoutFormatted} ${t('modals.hoursPayedOut')}`);
						}
						infoCell.textContent = parts.join(' | ');

						infoRow.appendChild(infoCell);
						tbody.appendChild(infoRow);
					}
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
			const yearSection = createEl('details');
			yearSection.className = 'tf-history-year-section';
			// Expand current year by default, or first year if current year has no entries
			yearSection.open = (year === currentYear) || (index === 0 && !years[currentYear]);

			const summary = createEl('summary');
			summary.className = 'tf-year-summary';
			const arrow = createSpan();
			arrow.className = 'tf-mr-8';
			arrow.textContent = yearSection.open ? '▼' : '▶';
			summary.appendChild(arrow);
			summary.appendChild(activeDocument.createTextNode(year.toString()));
			yearSection.appendChild(summary);

			// Toggle arrow on open/close
			yearSection.addEventListener('toggle', () => {
				arrow.textContent = yearSection.open ? '▼' : '▶';
			});

			const yearDiv = createDiv();
			yearDiv.className = 'tf-year-content';

			// Sort months descending (newest first)
			Object.keys(years[year]).sort().reverse().forEach(month => {
				const monthEntries = years[year][month];

				// Add month name header
				const monthHeader = createEl('h5');
				monthHeader.textContent = getMonthName(new Date(parseInt(year), parseInt(month) - 1, 1));
				monthHeader.className = 'tf-month-header';
				yearDiv.appendChild(monthHeader);

				const table = createEl('table');
				table.className = 'tf-history-table-wide';

				// Create thead with additional columns for wide view
				const thead = createEl('thead');
				const headerRow = createEl('tr');

				const headers = this.inlineEditMode
					? [t('ui.date'), t('ui.type'), t('ui.comment'), t('ui.start'), t('ui.end'), t('ui.hours'), t('ui.flextime'), '']
					: [t('ui.date'), t('ui.type'), t('ui.comment'), t('ui.start'), t('ui.end'), t('ui.hours'), t('ui.flextime')];

				headers.forEach(h => {
					const th = createEl('th');
					th.textContent = h;
					headerRow.appendChild(th);
				});
				thead.appendChild(headerRow);
				table.appendChild(thead);

				// Create tbody
				const tbody = createEl('tbody');

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

					dayEntries.forEach((e: TimeEntry, _idx: number) => {
						const row = createEl('tr');

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
						const dateCell = createEl('td');
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
							const activeIcon = createSpan();
							activeIcon.textContent = '⏱️ ';
							activeIcon.title = t('ui.activeTimer');
							activeIcon.className = 'tf-cursor-help';
							dateCell.appendChild(activeIcon);
						} else if (hasTimeOverlap) {
							const overlapIcon = createSpan();
							overlapIcon.textContent = '🔴 ';
							overlapIcon.title = `Overlapper med: ${overlapDetails}`;
							overlapIcon.className = 'tf-cursor-help';
							dateCell.appendChild(overlapIcon);
						} else if (hasSpecialDayConflict && holidayInfo) {
							const flagIcon = createSpan();
							flagIcon.textContent = '⚠️ ';
							flagIcon.title = t('info.workRegisteredOnSpecialDay').replace('{dayType}', translateSpecialDayName(holidayInfo.type));
							flagIcon.className = 'tf-cursor-help';
							dateCell.appendChild(flagIcon);
						}
						dateCell.appendChild(activeDocument.createTextNode(formatDate(new Date(dateStr + 'T00:00:00'), 'long')));
						row.appendChild(dateCell);

						// Type cell
						const typeCell = createEl('td');
						if (this.inlineEditMode && matchingRaw) {
							const select = createEl('select');
							this.settings.specialDayBehaviors.forEach(behavior => {
								const option = createEl('option');
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
							const typeBehavior = this.settings.specialDayBehaviors.find(b => b.id === entryNameLower);
						const typeChip = typeCell.createSpan({ cls: 'tf-history-type-chip', text: translateSpecialDayName(entryNameLower, e.name) });
						if (typeBehavior?.color && /^#[0-9a-f]{6}$/i.test(typeBehavior.color)) {
							typeChip.setCssStyles({ color: typeBehavior.textColor || '#fff', background: typeBehavior.color });
						} else {
							typeChip.setCssStyles({ color: 'var(--color-muted)', background: 'var(--color-raised)' });
						}
						}
						row.appendChild(typeCell);

						// Comment cell (after type)
						const commentCell = createEl('td');
						if (this.inlineEditMode && matchingRaw) {
							// Editable textarea in inline edit mode
							const textarea = createEl('textarea');
							textarea.value = matchingRaw.comment || '';
							textarea.placeholder = t('ui.optional');
							textarea.rows = 1;
							textarea.className = 'tf-comment-input';
							textarea.maxLength = 500;

							textarea.onfocus = () => { textarea.rows = 2; };
							textarea.onblur = async () => {
								textarea.rows = 1;
								const newComment = textarea.value.trim();
								if (newComment !== (matchingRaw.comment || '')) {
									matchingRaw.comment = newComment || undefined;
									await this.saveWithErrorHandling();
								}
							};

							commentCell.appendChild(textarea);
						} else {
							// Display mode - show comment and overtime payout with truncation
							const comment = matchingRaw?.comment || '';
							const hasOvertimePayout = matchingRaw?.overtimePayout && matchingRaw.overtimePayout > 0;

							if (comment || hasOvertimePayout) {
								const container = createDiv();
								container.className = 'tf-comment-payout-container';

								if (comment) {
									const span = createSpan();
									span.textContent = comment.length > 30 ? comment.substring(0, 27) + '...' : comment;
									span.title = comment; // Full text on hover
									span.className = 'tf-comment-display';
									container.appendChild(span);
								}

								if (hasOvertimePayout) {
									if (comment) {
										container.appendChild(activeDocument.createTextNode(' '));
									}
									const payoutSpan = createSpan();
									const payoutFormatted = Utils.formatHoursToHM(matchingRaw.overtimePayout!, this.settings.hourUnit);
									payoutSpan.textContent = `${payoutFormatted} ${t('modals.hoursPayedOut')}`;
									payoutSpan.className = 'tf-overtime-payout-display tf-text-muted tf-text-small';
									container.appendChild(payoutSpan);
								}

								commentCell.appendChild(container);
							} else {
								commentCell.textContent = '-';
							}
						}
						row.appendChild(commentCell);

						// Start time cell
						const startCell = createEl('td');
						if (matchingRaw?.startTime) {
							const startDate = new Date(matchingRaw.startTime);
							const startDateStr = Utils.toLocalDateStr(startDate);
							const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;

							// Check if entry spans multiple days
							const endDateForCheck = matchingRaw.endTime ? new Date(matchingRaw.endTime) : null;
							const isMultiDay = endDateForCheck && Utils.toLocalDateStr(startDate) !== Utils.toLocalDateStr(endDateForCheck);

							if (this.inlineEditMode) {
								const container = createDiv();
								container.className = 'tf-inline-edit-container';

								// Show date input for multi-day entries
								if (isMultiDay) {
									const dateInput = createEl('input');
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
						const endCell = createEl('td');
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
								const container = createDiv();
								container.className = "tf-time-input-container";

								// Show date input for multi-day entries
								if (isMultiDay) {
									const dateInput = createEl('input');
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

							const container = createDiv();
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
						const hoursCell = createEl('td');
						const hoursText = Utils.formatHoursToHM(e.duration || 0, this.settings.hourUnit);
						hoursCell.textContent = e.isActive ? `${hoursText}...` : hoursText;
						row.appendChild(hoursCell);

						// Flextime cell (always read-only, subtract overtime payout if present)
						const flextimeCell = createEl('td');
						const netFlextime = (e.flextime || 0) - (matchingRaw?.overtimePayout || 0);
						const flexMag = Utils.formatHoursToHM(Math.abs(netFlextime), this.settings.hourUnit);
						if (netFlextime > 1 / 60) {
							flextimeCell.textContent = `+${flexMag}`;
							flextimeCell.addClass('tf-history-flex-pos');
						} else if (netFlextime < -1 / 60) {
							flextimeCell.textContent = `−${flexMag}`;
							flextimeCell.addClass('tf-history-flex-neg');
						} else {
							flextimeCell.textContent = flexMag;
							flextimeCell.addClass('tf-history-flex-zero');
						}
						row.appendChild(flextimeCell);

						// Delete button (only in edit mode)
						if (this.inlineEditMode) {
							const actionCell = createEl('td');
							if (matchingItem) {
								const deleteBtn = createEl('button');
								deleteBtn.className = 'tf-history-delete-btn';
								setIcon(deleteBtn, 'trash-2');
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
					const addRow = createEl('tr');
					addRow.className = 'tf-history-add-row';
					const addCell = createEl('td');
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
		const modal = createDiv();
		modal.className = 'modal-container mod-dim tf-modal-z1000';

		const modalBg = createDiv();
		modalBg.className = 'modal-bg';
		modalBg.onclick = () => { this.isModalOpen = false; modal.remove(); };
		modal.appendChild(modalBg);

		const modalContent = createDiv();
		modalContent.className = 'modal tf-modal-content-400';

		// Prevent Obsidian from capturing keyboard events in modal inputs
		modalContent.addEventListener('keydown', (e) => e.stopPropagation());
		modalContent.addEventListener('keyup', (e) => e.stopPropagation());
		modalContent.addEventListener('keypress', (e) => e.stopPropagation());
		modalContent.addEventListener('beforeinput', (e) => e.stopPropagation());
		modalContent.addEventListener('input', (e) => e.stopPropagation());

		// Title
		const title = createDiv();
		title.className = 'modal-title';
		title.textContent = `${t('modals.addEntryTitle')} ${dateStr}`;
		modalContent.appendChild(title);

		// Content
		const content = createDiv();
		content.className = 'modal-content tf-p-20';

		// Type selector
		const typeLabel = createDiv();
		typeLabel.textContent = t('ui.type') + ':';
		typeLabel.className = 'tf-form-label';
		content.appendChild(typeLabel);

		const typeSelect = createEl('select');
		typeSelect.className = 'tf-form-input-mb';
		this.settings.specialDayBehaviors.forEach(behavior => {
			const option = createEl('option');
			option.value = behavior.id;
			option.textContent = `${behavior.icon} ${translateSpecialDayName(behavior.id, behavior.label)}`;
			typeSelect.appendChild(option);
		});
		content.appendChild(typeSelect);

		// Start time (for regular entries)
		const startLabel = createDiv();
		startLabel.textContent = `${t('modals.startTime')}:`;
		startLabel.className = 'tf-form-label';
		content.appendChild(startLabel);

		const startInput = this.createTimeInput('08:00', () => {});
		startInput.className = 'tf-form-input-mb';
		content.appendChild(startInput);

		// End time (for regular entries)
		const endLabel = createDiv();
		endLabel.textContent = `${t('modals.endTime')}:`;
		endLabel.className = 'tf-form-label';
		content.appendChild(endLabel);

		const endInput = this.createTimeInput('16:00', () => {});
		endInput.className = 'tf-form-input-mb-lg';
		content.appendChild(endInput);

		// Duration input (for reduce_goal types like sick days)
		const durationContainer = createDiv();
		durationContainer.className = 'tf-duration-container tf-hidden';

		const durationLabel = createDiv();
		durationLabel.textContent = t('ui.duration') + ':';
		durationLabel.className = 'tf-form-label';
		durationContainer.appendChild(durationLabel);

		const durationInput = createEl('input');
		durationInput.type = 'number';
		durationInput.step = '0.5';
		durationInput.min = '0.5';
		durationInput.max = '24';
		durationInput.value = '3.5';
		durationInput.className = 'tf-form-input';
		durationContainer.appendChild(durationInput);

		const durationHint = createDiv();
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
		const buttonContainer = createDiv();
		buttonContainer.className = 'tf-btn-container';

		const cancelBtn = createEl('button');
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => { this.isModalOpen = false; modal.remove(); };
		buttonContainer.appendChild(cancelBtn);

		const saveBtn = createEl('button');
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
		activeDocument.body.appendChild(modal);
	}

	renderWeeklyView(container: HTMLElement, _years: Record<string, Record<string, TimeEntry[]>>): void {
		container.empty();
		const div = container.createDiv();
		div.className = 'tf-heatmap-no-data';
		div.textContent = t('ui.weeklyViewComingSoon');
	}

	renderHeatmapView(container: HTMLElement, _years: Record<string, Record<string, TimeEntry[]>>): void {
		const heatmap = createDiv();
		heatmap.className = 'tf-heatmap';
		heatmap.setCssProps({ '--tf-heatmap-cols': String(this.settings.heatmapColumns) });

		const today = new Date();
		const daysToShow = this.settings.heatmapColumns * 8; // ~1 year

		for (let i = daysToShow; i >= 0; i--) {
			const date = new Date(today);
			date.setDate(today.getDate() - i);
			const dateKey = Utils.toLocalDateStr(date);

			const cell = createDiv();
			cell.className = 'tf-heatmap-cell';
			cell.title = dateKey;

			const dayEntries = this.data.daily[dateKey];
			const holidayInfo = this.data.getHolidayInfo(dateKey);
			const isFuture = date > today;
			const dailyGoal = this.settings.baseWorkday * this.settings.workPercent;

			// Opacity encoding: intensity = hours logged vs daily goal
			let cellOpacity = 0.1;

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
					cellOpacity = 0.8;
				} else if (dayEntries) {
					// Has entries but no special day - show flextime or simple color
					const totalHours = dayEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
					cellOpacity = dailyGoal > 0 ? Math.min(Math.max(totalHours / dailyGoal, 0.3), 1.0) : 0.7;
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
				const totalHours = dayEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
				cellOpacity = dailyGoal > 0 ? Math.min(Math.max(totalHours / dailyGoal, 0.3), 1.0) : 0.7;
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

			if (isFuture) cellOpacity = 0.1;
			cell.style.opacity = String(cellOpacity);

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
		const a = createEl('a');
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
	}

	showDeleteConfirmation(entry: TimeEntry | Timer, dateObj: Date, onConfirm: () => void | Promise<void>): void {
		// Create overlay
		const overlay = createDiv();
		overlay.className = 'tf-confirm-overlay';

		// Create dialog
		const dialog = createDiv();
		dialog.className = 'tf-confirm-dialog';

		// Title
		const title = createDiv();
		title.className = 'tf-confirm-title';
		title.textContent = '🗑️ ' + t('modals.deleteEntryTitle');
		dialog.appendChild(title);

		// Message
		const message = createDiv();
		message.className = 'tf-confirm-message';
		message.textContent = t('confirm.deleteEntry');
		dialog.appendChild(message);

		// Entry details
		const details = createDiv();
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
		const buttons = createDiv();
		buttons.className = 'tf-confirm-buttons';

		const cancelBtn = createEl('button');
		cancelBtn.className = 'tf-confirm-cancel';
		cancelBtn.textContent = t('buttons.cancel');
		cancelBtn.onclick = () => overlay.remove();
		buttons.appendChild(cancelBtn);

		const deleteBtn = createEl('button');
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

		activeDocument.body.appendChild(overlay);
	}

	/**
	 * Show export modal to select month
	 */
	exportHistoryToCSV(): void {
		// Get available months from data
		const availableMonths: string[] = [];
		Object.keys(this.data.daily).forEach(dateKey => {
			const yearMonth = dateKey.substring(0, 7);
			if (!availableMonths.includes(yearMonth)) {
				availableMonths.push(yearMonth);
			}
		});

		if (availableMonths.length === 0) {
			new Notice(t('export.noData'));
			return;
		}

		// Sort descending (newest first)
		availableMonths.sort().reverse();

		// Default to current month
		const now = new Date();
		const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
		const defaultMonth = availableMonths.includes(currentYearMonth) ? currentYearMonth : availableMonths[0];

		// Create modal
		const overlay = createDiv();
		overlay.className = 'modal-container mod-dim';

		const modal = createDiv();
		modal.className = 'modal tf-export-modal';

		// Title
		modal.createEl('h3', { text: t('export.selectMonth'), cls: 'tf-export-modal-title' });

		// Month selector
		const selectContainer = modal.createDiv({ cls: 'tf-export-select-container' });
		selectContainer.createEl('label', { text: t('export.month') + ':' });

		const select = selectContainer.createEl('select', { cls: 'tf-export-select' });

		// Add "All months" option first
		select.createEl('option', { text: t('export.allMonths'), value: 'all' });

		availableMonths.forEach(yearMonth => {
			const [year, month] = yearMonth.split('-').map(Number);
			const monthName = getMonthName(new Date(year, month - 1, 1));
			const option = select.createEl('option', { text: monthName, value: yearMonth });
			if (yearMonth === defaultMonth) option.selected = true;
		});

		// Buttons
		const buttonDiv = modal.createDiv({ cls: 'tf-export-buttons' });

		const cancelBtn = buttonDiv.createEl('button', { text: t('buttons.cancel') });
		cancelBtn.onclick = () => overlay.remove();

		const exportBtn = buttonDiv.createEl('button', { text: `📥 ${t('buttons.export')}`, cls: 'mod-cta' });
		exportBtn.onclick = () => {
			const selectedMonth = select.value;
			overlay.remove();
			this.downloadMonthCSV(selectedMonth);
		};

		overlay.appendChild(modal);

		// Close on overlay click
		overlay.onclick = (e) => {
			if (e.target === overlay) overlay.remove();
		};

		activeDocument.body.appendChild(overlay);
	}

	/**
	 * Download CSV for a specific month or all months
	 */
	private downloadMonthCSV(yearMonth: string): void {
		const BOM = '\uFEFF';
		let csvContent = '';
		let filename: string;
		let noticeText: string;

		if (yearMonth === 'all') {
			// Export all months
			const availableMonths: string[] = [];
			Object.keys(this.data.daily).forEach(dateKey => {
				const ym = dateKey.substring(0, 7);
				if (!availableMonths.includes(ym)) availableMonths.push(ym);
			});
			availableMonths.sort().reverse();

			if (availableMonths.length === 0) {
				new Notice(t('export.noData'));
				return;
			}

			availableMonths.forEach((ym, index) => {
				if (index > 0) csvContent += '\n\n';
				csvContent += this.generateMonthCSV(ym);
			});

			filename = `timeflow-${t('export.allMonths').toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
			noticeText = t('export.allMonths');
		} else {
			// Export single month
			csvContent = this.generateMonthCSV(yearMonth);
			if (!csvContent) {
				new Notice(t('export.noData'));
				return;
			}
			const [year, month] = yearMonth.split('-').map(Number);
			filename = `timeflow-${yearMonth}.csv`;
			noticeText = getMonthName(new Date(year, month - 1, 1));
		}

		// Create and download the file
		const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = createEl('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);

		new Notice(`✅ ${t('export.success')}: ${noticeText}`);
	}

	/**
	 * Generate CSV content for a single month
	 */
	private generateMonthCSV(yearMonth: string): string {
		const [year, month] = yearMonth.split('-').map(Number);

		// Get entries for this month
		const monthEntries: TimeEntry[] = [];
		Object.keys(this.data.daily).forEach(dateKey => {
			if (dateKey.startsWith(yearMonth)) {
				monthEntries.push(...this.data.daily[dateKey]);
			}
		});

		if (monthEntries.length === 0) return '';

		// Get raw entries for comments
		const rawEntries = this.timerManager.data.entries.filter(entry => {
			if (!entry.startTime) return false;
			const date = new Date(entry.startTime);
			return date.getFullYear() === year && date.getMonth() === month - 1;
		});

		const monthName = getMonthName(new Date(year, month - 1, 1));
		const stats = this.data.getStatistics('month', year, month - 1);

		let csvContent = '';

		// Month header
		csvContent += `"${monthName}"\n\n`;

		// Column headers
		csvContent += `"${t('export.date')}","${t('export.type')}","${t('export.start')}","${t('export.end')}","${t('export.hours')}","${t('export.flextime')}","${t('modals.overtimePayout')}","${t('export.comment')}"\n`;

		// Sort entries by date and time
		const sortedEntries = [...monthEntries].sort((a, b) => {
			const dateA = a.startTime || '';
			const dateB = b.startTime || '';
			return dateA.localeCompare(dateB);
		});

		// Track used raw entries
		const usedRawEntries = new Set<Timer>();

		// Entry rows
		sortedEntries.forEach(entry => {
			const startDate = entry.startTime ? new Date(entry.startTime) : null;
			const endDate = entry.endTime ? new Date(entry.endTime) : null;

			const dateStr = startDate ? Utils.toLocalDateStr(startDate) : '';
			const startTime = startDate ? `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}` : '';
			const endTime = endDate ? `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}` : '';
			const hours = entry.duration ? entry.duration.toFixed(2) : '0.00';
			const flextime = entry.flextime ? entry.flextime.toFixed(2) : '0.00';

			// Find matching raw entry for comment
			const matchingRaw = rawEntries.find(raw =>
				!usedRawEntries.has(raw) &&
				raw.name.toLowerCase() === entry.name.toLowerCase() &&
				raw.startTime === entry.startTime
			) || rawEntries.find(raw =>
				!usedRawEntries.has(raw) &&
				raw.name.toLowerCase() === entry.name.toLowerCase()
			);
			if (matchingRaw) usedRawEntries.add(matchingRaw);

			const comment = matchingRaw?.comment || '';
			const escapedComment = comment.replace(/"/g, '""');
			const overtimePayout = matchingRaw?.overtimePayout ? matchingRaw.overtimePayout.toFixed(2) : '';

			const typeName = translateSpecialDayName(entry.name.toLowerCase(), entry.name);

			csvContent += `"${dateStr}","${typeName}","${startTime}","${endTime}","${hours}","${flextime}","${overtimePayout}","${escapedComment}"\n`;
		});

		// Monthly summary section
		csvContent += '\n';
		csvContent += `"${t('export.monthlySummary')}"\n`;
		csvContent += `"${t('export.totalHours')}","${stats.totalHours.toFixed(2)}"\n`;
		csvContent += `"${t('export.totalFlextime')}","${stats.totalFlextime.toFixed(2)}"\n`;
		csvContent += `"${t('export.workDays')}","${stats.workDays}"\n`;
		csvContent += `"${t('export.avgDaily')}","${stats.avgDailyHours.toFixed(2)}"\n`;

		// Type breakdown
		csvContent += '\n';
		csvContent += `"${t('export.typeBreakdown')}"\n`;
		csvContent += `"${t('export.typeHeader')}","${t('export.daysHeader')}","${t('export.hoursHeader')}"\n`;

		const types = ['jobb', 'kurs', 'studie', 'ferie', 'avspasering', 'egenmelding', 'sykemelding', 'velferdspermisjon'];
		types.forEach(type => {
			const typeStat = stats[type as keyof typeof stats];
			if (typeStat && typeof typeStat === 'object' && 'count' in typeStat) {
				if (typeStat.count > 0 || typeStat.hours > 0) {
					csvContent += `"${translateSpecialDayName(type)}","${typeStat.count}","${typeStat.hours.toFixed(2)}"\n`;
				}
			}
		});

		return csvContent;
	}

	cleanup(): void {
		this.intervals.forEach(interval => window.clearInterval(interval));
		this.intervals = [];
		this._resizeObserver?.disconnect();
		this._resizeObserver = null;
	}

	// =====================================================================
	// Timeflow 2.0 — Balance Hero
	// =====================================================================

	buildBalanceHero(): HTMLElement {
		const hero = createDiv({ cls: 'tf-balance-hero' });
		this.balanceHeroEl = hero;

		// Row 1: left (label + number + badge) | right (clock)
		const row1 = hero.createDiv({ cls: 'tf-balance-hero-row1' });
		const left = row1.createDiv({ cls: 'tf-balance-left' });
		left.createDiv({ cls: 'tf-balance-label', text: t('v3.flexBalance') });
		const numEl = left.createDiv({ cls: 'tf-balance-number' });
		const badgeEl = left.createDiv({ cls: 'tf-balance-badge' });

		const right = row1.createDiv({ cls: 'tf-balance-right' });
		const clockEl = right.createDiv({ cls: 'tf-balance-clock' });
		this.heroClockEl = clockEl;

		// Row 2: full-width timer buttons
		const timerWrap = hero.createDiv({ cls: 'tf-hero-timer-wrap' });

		this._updateBalanceHeroContent(numEl, badgeEl, timerWrap);
		this._updateHeroClock(clockEl);

		const clockInterval = window.setInterval(() => this._updateHeroClock(clockEl), 1000);
		this.intervals.push(clockInterval);

		return hero;
	}

	private _updateHeroClock(el: HTMLElement): void {
		const now = new Date();
		el.textContent = now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	/** Map a flextime balance (hours) to a state class using the user's configured thresholds. */
	private _balanceStateClass(balance: number): string {
		const th = this.settings.balanceThresholds;
		if (balance > th.criticalHigh) return 'tf-alert';
		if (balance > th.warningHigh)  return 'tf-warn';
		if (balance >= th.warningLow)  return 'tf-ok';
		if (balance > th.criticalLow)  return 'tf-warn';
		return 'tf-alert';
	}

	/** Compact decimal hours, e.g. 101.3 -> "101.3t", used for stats where H:M is too wide. */
	private _fmtHours(hours: number, decimals = 1): string {
		return `${hours.toFixed(decimals)}${this.settings.hourUnit}`;
	}

	/** Goal/limit value, trimming a trailing ".0": 7.5 -> "7.5t", 40 -> "40t". */
	private _fmtGoal(hours: number): string {
		const r = Math.round(hours * 10) / 10;
		return `${r}${this.settings.hourUnit}`;
	}

	/** Format a signed hour delta as a friendly badge string ("+29 min" / "+1t 05m"). */
	private _formatDelta(hours: number): string {
		const sign = hours >= 0 ? '+' : '−';
		const totalMin = Math.round(Math.abs(hours) * 60);
		if (totalMin < 60) return `${sign}${totalMin} min`;
		return `${sign}${Utils.formatHoursToHM(Math.abs(hours), this.settings.hourUnit)}`;
	}

	private _updateBalanceHeroContent(numEl: HTMLElement, badgeEl: HTMLElement, timerWrap: HTMLElement): void {
		const balance = this.data.getCurrentBalance();
		const absBalance = Math.abs(balance);
		const hrs = Math.floor(absBalance);
		const mins = Math.round((absBalance - hrs) * 60);
		const sign = balance >= 0 ? '+' : '−';
		const unit = this.settings.hourUnit;
		// Hero number only: wrap the unit letters (t/m) so they read as units, not digits.
		// Other call sites keep Utils.formatHoursToHM's flat-string contract.
		numEl.empty();
		numEl.appendText(`${sign}${hrs}`);
		numEl.createSpan({ cls: 'tf-unit', text: unit });
		numEl.appendText(` ${String(mins).padStart(2, '0')}`);
		numEl.createSpan({ cls: 'tf-unit', text: 'm' });

		const colorClass = this._balanceStateClass(balance);
		numEl.className = `tf-balance-number ${colorClass}`;

		const activeTimers = this.timerManager.getActiveTimers();

		// Badge: today's contribution to the flextime balance ("+29 min added today").
		// Hidden while a timer is running — the day isn't finished, so the delta is misleading.
		if (activeTimers.length > 0) {
			badgeEl.textContent = '';
			badgeEl.className = 'tf-balance-badge tf-hidden';
		} else {
			const today = new Date();
			const todayStr = Utils.toLocalDateStr(today);
			const todayHours = this.data.getTodayHours(today);
			const dailyGoal = this.data.getDailyGoal(todayStr);
			const todayDelta = todayHours - dailyGoal;
			badgeEl.textContent = `${this._formatDelta(todayDelta)} ${t('v3.addedToday')}`;
			badgeEl.className = `tf-balance-badge ${todayDelta >= 0 ? 'tf-ok' : 'tf-warn'}`;
		}

		// Timer buttons
		timerWrap.empty();
		if (activeTimers.length === 0) {
			const startMain = timerWrap.createEl('button', { cls: 'tf-hero-start-main', text: `▶  ${t('v3.startTimer')}` });
			startMain.onclick = async (e) => {
				e.stopPropagation();
				const workType = this.settings.specialDayBehaviors.find(b => b.isWorkType);
				await this.timerManager.startTimer(workType?.id || 'jobb');
				this._refreshHeroTimer(timerWrap, numEl, badgeEl);
			};
			const arrowBtn = timerWrap.createEl('button', { cls: 'tf-hero-start-arrow', text: '▾' });
			arrowBtn.onclick = (e) => {
				e.stopPropagation();
				this.showTimerTypeMenu(arrowBtn);
			};
		} else {
			const stopBtn = timerWrap.createEl('button', { cls: 'tf-hero-stop-btn' });
			stopBtn.createDiv({ cls: 'tf-hero-pulse' });
			stopBtn.appendText(t('buttons.stop'));
			stopBtn.onclick = async () => {
				for (const timer of activeTimers) {
					await this.stopTimerWithCommentCheck(timer);
				}
				this._refreshHeroTimer(timerWrap, numEl, badgeEl);
			};
		}
	}

	private _refreshHeroTimer(timerWrap: HTMLElement, numEl: HTMLElement, badgeEl: HTMLElement): void {
		this.data.rawEntries = this.timerManager.convertToTimeEntries();
		this.data.processEntries();
		this._updateBalanceHeroContent(numEl, badgeEl, timerWrap);
		this.updateComplianceBadge();
		if (this.progressStripEl) this.updateProgressStrip();
		if (this.barCalendarBodyEl) this.updateBarCalendar();
		if (this.statsFooterEl) this.updateStatsFooter();
	}

	updateBalanceHero(): void {
		if (!this.balanceHeroEl) return;
		const numEl = this.balanceHeroEl.querySelector('.tf-balance-number') as HTMLElement;
		const badgeEl = this.balanceHeroEl.querySelector('.tf-balance-badge') as HTMLElement;
		const timerWrap = this.balanceHeroEl.querySelector('.tf-hero-timer-wrap') as HTMLElement;
		if (numEl && badgeEl && timerWrap) {
			this._updateBalanceHeroContent(numEl, badgeEl, timerWrap);
		}
	}

	// =====================================================================
	// Timeflow 2.0 — Progress Strip
	// =====================================================================

	buildProgressStrip(): HTMLElement {
		const strip = createDiv({ cls: 'tf-progress-strip' });
		this.progressStripEl = strip;
		this._fillProgressStrip(strip);
		return strip;
	}

	private _fillProgressStrip(strip: HTMLElement): void {
		strip.empty();
		const today = new Date();
		const todayStr = Utils.toLocalDateStr(today);
		const todayHours = this.data.getTodayHours(today);
		const dailyGoal = this.data.getDailyGoal(todayStr);
		const weekHours = this.data.getCurrentWeekHours(today);
		const weekGoal = this.settings.baseWorkweek * this.settings.workPercent;

		// Today row — flat siblings: label | value | track | goal
		const todayRow = strip.createDiv({ cls: 'tf-strip-row' });
		todayRow.createDiv({ cls: 'tf-strip-label', text: t('ui.today') });
		todayRow.createDiv({ cls: 'tf-strip-hours', text: Utils.formatHoursToHM(todayHours, this.settings.hourUnit) });
		const todayTrack = todayRow.createDiv({ cls: 'tf-strip-bar-track' });
		const todayFill = todayTrack.createDiv({ cls: 'tf-strip-bar-fill' });
		todayFill.style.width = `${dailyGoal > 0 ? Math.min((todayHours / dailyGoal) * 100, 100) : 0}%`;
		todayRow.createDiv({ cls: 'tf-strip-limit', text: this._fmtGoal(dailyGoal) });

		if (!this.settings.enableWeeklyGoals) return;

		// Week row — thresholds come from settings, not hardcoded
		const weekNum = Utils.getWeekNumber(today);
		const weekLimit = this.settings.complianceSettings?.weeklyHoursLimit ?? weekGoal;
		let weekFillCls = '';
		if (weekHours > weekLimit)    weekFillCls = 'compliance-over';
		else if (weekHours >= weekGoal) weekFillCls = 'compliance-warn';

		const weekRow = strip.createDiv({ cls: 'tf-strip-row' });
		weekRow.createDiv({ cls: 'tf-strip-label current-week', text: `${t('v3.weekLabelPrefix')} ${weekNum}` });
		weekRow.createDiv({ cls: 'tf-strip-hours', text: Utils.formatHoursToHM(weekHours, this.settings.hourUnit) });
		const weekTrack = weekRow.createDiv({ cls: 'tf-strip-bar-track' });
		const weekFill = weekTrack.createDiv({ cls: `tf-strip-bar-fill${weekFillCls ? ' ' + weekFillCls : ''}` });
		weekFill.style.width = `${weekGoal > 0 ? Math.min((weekHours / weekGoal) * 100, 100) : 0}%`;
		weekRow.createDiv({ cls: 'tf-strip-limit', text: this._fmtGoal(weekLimit) });
	}

	updateProgressStrip(): void {
		if (!this.progressStripEl) return;
		this._fillProgressStrip(this.progressStripEl);
	}

	private _getMondayOfWeek(date: Date): Date {
		const d = new Date(date);
		const day = d.getDay();
		const diff = day === 0 ? -6 : 1 - day;
		d.setDate(d.getDate() + diff);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	// =====================================================================
	// Timeflow 2.0 — Bar Calendar Section
	// =====================================================================

	buildBarCalendarSection(): HTMLElement {
		const section = createDiv({ cls: 'tf-v3-left-col' });

		const calWrap = section.createDiv();
		this.barCalendarBodyEl = calWrap;
		this._fillBarCalendar(calWrap);

		const upcomingWrap = section.createDiv();
		this._fillUpcomingFlat(upcomingWrap);

		return section;
	}

	private _fillBarCalendar(container: HTMLElement): void {
		container.empty();
		const displayDate = new Date(this.today);
		displayDate.setMonth(this.today.getMonth() + this.currentMonthOffset);

		const cal = container.createDiv({ cls: 'tf-bar-calendar' });

		// Header: month name + nav
		const header = cal.createDiv({ cls: 'tf-bar-cal-header' });
		header.createDiv({ cls: 'tf-bar-cal-month', text: getMonthName(displayDate) });
		const nav = header.createDiv({ cls: 'tf-bar-cal-nav' });
		const prevBtn = nav.createEl('button', { cls: 'tf-bar-cal-nav-btn', text: '◀' });
		prevBtn.onclick = () => { this.currentMonthOffset--; this._fillBarCalendar(container); };
		const todayBtn = nav.createEl('button', { cls: 'tf-bar-cal-nav-btn today-btn', text: t('ui.today') });
		todayBtn.onclick = () => { this.currentMonthOffset = 0; this._fillBarCalendar(container); };
		const nextBtn = nav.createEl('button', { cls: 'tf-bar-cal-nav-btn', text: '▶' });
		nextBtn.onclick = () => { this.currentMonthOffset++; this._fillBarCalendar(container); };

		const showWeekNums = this.settings.showWeekNumbers ?? true;
		const cols = showWeekNums ? '26px repeat(7, 1fr)' : 'repeat(7, 1fr)';

		// Day header row
		const dayHeaders = cal.createDiv({ cls: 'tf-bar-cal-day-headers' });
		dayHeaders.style.gridTemplateColumns = cols;
		if (showWeekNums) dayHeaders.createDiv({ cls: 'tf-bar-cal-day-header' }); // empty corner
		getDayNamesShort().forEach(name => {
			dayHeaders.createDiv({ cls: 'tf-bar-cal-day-header', text: name });
		});

		const year = displayDate.getFullYear();
		const month = displayDate.getMonth();
		const todayKey = Utils.toLocalDateStr(new Date());
		const dailyGoal = this.settings.baseWorkday * this.settings.workPercent;

		// Build week rows
		const firstDay = new Date(year, month, 1);
		let dow = firstDay.getDay() - 1;
		if (dow < 0) dow = 6;
		const daysInMonth = new Date(year, month + 1, 0).getDate();

		// Collect all day numbers into week arrays starting from Monday before month start
		let currentDate = new Date(firstDay);
		currentDate.setDate(firstDay.getDate() - dow);

		// Draw rows until we've covered all days in the month
		const lastDay = new Date(year, month, daysInMonth);
		let drawerInserted = false;

		while (currentDate <= lastDay || (currentDate.getMonth() <= month && currentDate.getFullYear() <= year)) {
			const weekRow = cal.createDiv({ cls: 'tf-bar-cal-week-row' });
			weekRow.style.gridTemplateColumns = cols;

			// Week number cell
			if (showWeekNums) {
				const isCurrentWeek = Utils.getWeekNumber(currentDate) === Utils.getWeekNumber(new Date())
				                   && currentDate.getFullYear() === new Date().getFullYear();
				const weekNumCell = weekRow.createDiv({ cls: isCurrentWeek ? 'tf-bar-cal-week-num current-week' : 'tf-bar-cal-week-num' });
				weekNumCell.createDiv({ text: Utils.getWeekNumber(currentDate).toString() });

				// Compliance dot
				const monday = this._getMondayOfWeek(new Date(currentDate));
				const compClass = this.getWeekComplianceClass(monday);
				if (compClass && compClass !== 'week-future' && compClass !== 'week-partial') {
					const dot = weekNumCell.createDiv({ cls: 'tf-bar-cal-compliance-dot' });
					if (compClass === 'week-ok') dot.addClass('tf-compliance-dot-ok');
					else if (compClass === 'week-over') dot.addClass('tf-compliance-dot-over');
					else dot.addClass('tf-compliance-dot-warn');
					// Explain the otherwise-unlabelled dot with a native tooltip (logged / target).
					const wc = this.getWeekComplianceData(monday);
					dot.setAttribute('title', t('v3.weekComplianceTooltip')
						.replace('{week}', `${t('v3.weekLabelPrefix')} ${wc.weekNumber}`)
						.replace('{hours}', this._fmtHours(wc.totalHours, 1))
						.replace('{target}', this._fmtGoal(wc.expectedHours)));
				}
			}

			// 7 day cells
			let selectedInThisRow = false;
			const cellDateKeys: string[] = [];

			for (let d = 0; d < 7; d++) {
				const cellDate = new Date(currentDate);
				cellDate.setDate(currentDate.getDate() + d);
				const dateKey = Utils.toLocalDateStr(cellDate);
				cellDateKeys.push(dateKey);

				const isCurrentMonth = cellDate.getMonth() === month;
				const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
				const isFuture = cellDate > new Date();
				const isToday = dateKey === todayKey;
				const isSelected = dateKey === this.selectedDayDate;

				const cell = weekRow.createDiv({ cls: 'tf-bar-cal-cell' });
				if (isToday) cell.addClass('today');
				if (isSelected) { cell.addClass('selected'); selectedInThisRow = true; }
				const plannedHoliday = this.data.holidays[dateKey];
				if (!isCurrentMonth || isWeekend) cell.addClass('faded');
				// Future days are dimmed, except planned absences so they stay visible across months.
				if (isFuture && !plannedHoliday) cell.addClass('future');

				cell.createDiv({ cls: 'tf-bar-cal-day-num', text: cellDate.getDate().toString() });

				// 3px bar
				const barTrack = cell.createDiv({ cls: 'tf-bar-cal-bar-track' });
				const barFill = barTrack.createDiv({ cls: 'tf-bar-cal-bar-fill' });

				if (isCurrentMonth) {
					let barColor = 'var(--color-accent)';
					let barPct = 0;

					// Logged work / special-day hours (past & today)
					if (!isFuture) {
						const dayEntries = this.data.daily[dateKey] || [];
						const totalHours = dayEntries.reduce((s, e) => s + (e.duration || 0), 0);
						if (totalHours > 0) {
							const specialEntry = dayEntries.find(e => {
								const b = this.settings.specialDayBehaviors.find(beh => beh.id === e.name);
								return b && !b.isWorkType;
							});
							if (specialEntry) {
								const behavior = this.settings.specialDayBehaviors.find(b => b.id === specialEntry.name);
								barColor = behavior?.color || 'var(--color-accent)';
							}
							barPct = dailyGoal > 0 ? Math.min((totalHours / dailyGoal) * 100, 100) : 100;
						}
					}

					// Planned / taken absence from the holidays file (also makes future plans visible)
					if (plannedHoliday) {
						const hb = this.settings.specialDayBehaviors.find(b => b.id === plannedHoliday.type);
						if (hb) {
							barColor = hb.color;
							barPct = plannedHoliday.halfDay ? 50 : 100;
						}
					}

					barFill.setCssStyles({ background: barColor, width: `${barPct}%` });
				} else {
					barFill.setCssStyles({ width: '0%' });
				}

				// Click handler
				cell.onclick = (e) => {
					e.stopPropagation();
					if (this.selectedDayDate === dateKey) {
						this.selectedDayDate = null;
					} else {
						this.selectedDayDate = dateKey;
					}
					this._fillBarCalendar(container);
				};
			}

			// If selected day is in this row, insert drawer after it
			if (selectedInThisRow && this.selectedDayDate) {
				drawerInserted = true;
				const drawerDateObj = new Date(this.selectedDayDate + 'T00:00:00');
				const drawer = this.buildInlineDayDrawer(drawerDateObj, container);
				cal.appendChild(drawer);
			}

			// Advance by 7 days
			currentDate.setDate(currentDate.getDate() + 7);

			// Stop once we've passed the last day of the month
			if (currentDate.getMonth() > month || currentDate.getFullYear() > year) break;
		}

		// If selected day wasn't found in the current month view, clear selection
		if (this.selectedDayDate && !drawerInserted) {
			// Don't clear - user may have changed month
		}
	}

	updateBarCalendar(): void {
		if (!this.barCalendarBodyEl) return;
		this._fillBarCalendar(this.barCalendarBodyEl);
	}

	// =====================================================================
	// Timeflow 2.0 — Inline Day Drawer
	// =====================================================================

	buildInlineDayDrawer(dateObj: Date, calContainer: HTMLElement): HTMLElement {
		const dateKey = Utils.toLocalDateStr(dateObj);
		const drawer = createDiv({ cls: 'tf-inline-drawer' });

		const dayEntries = this.data.daily[dateKey] || [];
		const totalHours = dayEntries.reduce((s, e) => s + (e.duration || 0), 0);

		// Determine type
		const specialEntry = dayEntries.find(e => {
			const b = this.settings.specialDayBehaviors.find(beh => beh.id === e.name);
			return b && !b.isWorkType;
		});
		const typeBehavior = specialEntry
			? this.settings.specialDayBehaviors.find(b => b.id === specialEntry.name)
			: this.settings.specialDayBehaviors.find(b => b.isWorkType);

		// Header
		const header = drawer.createDiv({ cls: 'tf-drawer-header' });
		const dateLabel = header.createDiv({ cls: 'tf-drawer-date' });
		dateLabel.textContent = formatDate(dateObj, 'long');
		const closeBtn = header.createEl('button', { cls: 'tf-drawer-close', text: '×' });
		closeBtn.onclick = () => {
			this.selectedDayDate = null;
			this._fillBarCalendar(calContainer);
		};

		// Work row: dot + "TypeName · Xh Ym" | time range
		const workRow = drawer.createDiv({ cls: 'tf-drawer-work-row' });
		const workLeft = workRow.createDiv({ cls: 'tf-drawer-work-left' });
		const dot = workLeft.createDiv({ cls: 'tf-drawer-type-dot' });
		if (typeBehavior?.color) dot.style.background = typeBehavior.color;
		const typeLabel = typeBehavior ? translateSpecialDayName(typeBehavior.id, typeBehavior.label) : t('specialDays.work');
		workLeft.createEl('span', { cls: 'tf-drawer-work-label', text: `${typeLabel} · ${Utils.formatHoursToHM(totalHours, this.settings.hourUnit)}` });

		const starts = dayEntries.filter(e => e.startTime).map(e => e.startTime).sort();
		const ends = dayEntries.filter(e => e.endTime).map(e => e.endTime!).sort();
		if (starts.length > 0) {
			const firstStart = starts[0].substring(11, 16);
			const lastEnd = ends.length > 0 ? ends[ends.length - 1].substring(11, 16) : '–';
			workRow.createEl('span', { cls: 'tf-drawer-time-range', text: `${firstStart} – ${lastEnd}` });
		}

		// Balance row
		if (this.settings.enableGoalTracking) {
			const dailyGoal = this.data.getDailyGoal(dateKey);
			const dayFlex = totalHours - dailyGoal;
			const sign = dayFlex >= 0 ? '+' : '−';
			const flexColorClass = dayFlex >= 0 ? 'tf-ok' : 'tf-warn';
			const balRow = drawer.createDiv({ cls: 'tf-drawer-balance-row' });
			balRow.createEl('span', { cls: 'tf-drawer-balance-label', text: t('v3.dailyBalance') });
			balRow.createEl('span', { cls: `tf-drawer-balance-value ${flexColorClass}`, text: `${sign}${Utils.formatHoursToHM(Math.abs(dayFlex), this.settings.hourUnit)}` });
		}

		// Actions
		const actions = drawer.createDiv({ cls: 'tf-drawer-actions' });

		// Inline edit section, toggled by the edit button (replaces the old modal popup)
		const editSection = drawer.createDiv({ cls: 'tf-drawer-edit-section tf-hidden' });

		const editBtn = actions.createEl('button', { cls: 'tf-drawer-action-btn', text: t('v3.editTime') });
		editBtn.onclick = () => {
			if (editSection.hasClass('tf-hidden')) {
				this._renderDayEditFields(editSection, dateObj, calContainer);
				editSection.removeClass('tf-hidden');
				editBtn.addClass('active');
			} else {
				editSection.empty();
				editSection.addClass('tf-hidden');
				editBtn.removeClass('active');
			}
		};

		// Inline absence section, toggled by the button (renders the absence form in place
		// instead of opening a modal). A successful save triggers a full dashboard refresh.
		const absenceSection = drawer.createDiv({ cls: 'tf-drawer-edit-section tf-hidden' });
		const absenceBtn = actions.createEl('button', { cls: 'tf-drawer-action-btn', text: t('v3.addAbsence') });
		absenceBtn.onclick = () => {
			if (absenceSection.hasClass('tf-hidden')) {
				// Collapse the edit section if it's open, so only one inline form shows at a time.
				editSection.empty();
				editSection.addClass('tf-hidden');
				editBtn.removeClass('active');
				// Render the form into an inner wrapper (like the edit cards) so the section
				// container stays bare — emptying it leaves nothing behind (no leftover card).
				const formWrap = absenceSection.createDiv();
				this.showSpecialDayModal(dateObj, {
					container: formWrap,
					onComplete: () => { this.selectedDayDate = null; },
					onCancel: () => {
						absenceSection.empty();
						absenceSection.addClass('tf-hidden');
						absenceBtn.removeClass('active');
					},
				});
				absenceSection.removeClass('tf-hidden');
				absenceBtn.addClass('active');
			} else {
				absenceSection.empty();
				absenceSection.addClass('tf-hidden');
				absenceBtn.removeClass('active');
			}
		};

		if (this.settings.noteTypes.length > 0) {
			const noteBtn = actions.createEl('button', { cls: 'tf-drawer-action-btn', text: t('v3.note') });
			noteBtn.onclick = async () => {
				await this.createNoteFromType(dateObj, this.settings.noteTypes[0]);
				this.selectedDayDate = null;
				this._fillBarCalendar(calContainer);
			};
		}

		return drawer;
	}

	// Render inline editable fields for a day's work entries inside the drawer (replaces the modal).
	private _renderDayEditFields(container: HTMLElement, dateObj: Date, calContainer: HTMLElement): void {
		container.empty();
		const dateStr = Utils.toLocalDateStr(dateObj);
		const workEntries = this.getWorkEntriesForDate(dateStr);

		if (workEntries.length === 0) {
			container.createDiv({ cls: 'tf-drawer-edit-empty', text: t('notifications.noWorkEntriesFound') });
			return;
		}

		// The last entry by end time gets the overtime-payout control.
		const sorted = [...workEntries].sort((a, b) => {
			const ea = a.entry.endTime ? new Date(a.entry.endTime).getTime() : Date.now();
			const eb = b.entry.endTime ? new Date(b.entry.endTime).getTime() : Date.now();
			return ea - eb;
		});
		const lastEntry = sorted[sorted.length - 1].entry;

		const dayGoal = this.data.getDailyGoal(dateStr);
		let totalWorked = 0;
		workEntries.forEach(item => {
			if (item.entry.endTime) {
				totalWorked += (new Date(item.entry.endTime).getTime() - new Date(item.entry.startTime!).getTime()) / 3600000;
			}
		});
		const dayOvertime = Math.max(0, totalWorked - dayGoal);

		const pad = (n: number) => n.toString().padStart(2, '0');

		// Each entry contributes an "apply" function that validates its inputs and, on success,
		// stages the new values onto the entry object. It returns an error message or null.
		const appliers: Array<() => string | null> = [];

		workEntries.forEach((item, index) => {
			const entry = item.entry;
			const startDate = new Date(entry.startTime!);
			const endDate = entry.endTime ? new Date(entry.endTime) : null;
			const startDateStr = Utils.toLocalDateStr(startDate);
			const endDateStr = endDate ? Utils.toLocalDateStr(endDate) : startDateStr;

			const card = container.createDiv({ cls: 'tf-drawer-edit-card' });

			// Header: label + delete
			const head = card.createDiv({ cls: 'tf-drawer-edit-head' });
			const label = item.parent
				? `${item.parent.name} – ${entry.name}`
				: translateSpecialDayName(entry.name.toLowerCase(), entry.name) + (workEntries.length > 1 ? ` #${index + 1}` : '');
			head.createSpan({ cls: 'tf-drawer-edit-label', text: label });
			const delBtn = head.createEl('button', { cls: 'tf-drawer-edit-del' });
			setIcon(delBtn, 'trash-2');
			delBtn.title = t('buttons.delete');
			delBtn.onclick = () => {
				this.showDeleteConfirmation(entry, dateObj, async () => {
					let deleted = false;
					if (item.parent && item.subIndex !== undefined && item.parent.subEntries) {
						item.parent.subEntries.splice(item.subIndex, 1);
						if (item.parent.subEntries.length === 0) {
							const pIdx = this.timerManager.data.entries.indexOf(item.parent);
							if (pIdx > -1) this.timerManager.data.entries.splice(pIdx, 1);
						}
						deleted = true;
					} else {
						const eIdx = this.timerManager.data.entries.indexOf(entry);
						if (eIdx > -1) { this.timerManager.data.entries.splice(eIdx, 1); deleted = true; }
					}
					if (deleted) {
						await this.saveWithErrorHandling();
						new Notice(`✅ ${t('notifications.deleted')}`);
						this.timerManager.onTimerChange?.();
					}
				});
			};

			// Date inputs are only shown for multi-day entries; normal days edit times only.
			const isMultiDay = !!endDate && startDateStr !== endDateStr;

			// Start row: time (+ date when the entry spans multiple days)
			const startRow = card.createDiv({ cls: 'tf-drawer-edit-row' });
			startRow.createSpan({ cls: 'tf-drawer-edit-row-label', text: t('modals.startTime') });
			let startDateInput: HTMLInputElement | null = null;
			if (isMultiDay) {
				startDateInput = startRow.createEl('input', { cls: 'tf-drawer-edit-date' });
				startDateInput.type = 'date';
				startDateInput.value = startDateStr;
			}
			const startTimeInput = this.createTimeInput(`${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`, () => {});
			startTimeInput.addClass('tf-drawer-edit-time');
			startRow.appendChild(startTimeInput);

			// End row: time (+ date when the entry spans multiple days)
			const endRow = card.createDiv({ cls: 'tf-drawer-edit-row' });
			endRow.createSpan({ cls: 'tf-drawer-edit-row-label', text: t('modals.endTime') });
			let endDateInput: HTMLInputElement | null = null;
			if (isMultiDay) {
				endDateInput = endRow.createEl('input', { cls: 'tf-drawer-edit-date' });
				endDateInput.type = 'date';
				endDateInput.value = endDateStr;
			}
			const endTimeInput = this.createTimeInput(endDate ? `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}` : '', () => {});
			endTimeInput.addClass('tf-drawer-edit-time');
			endRow.appendChild(endTimeInput);

			// Overtime payout (last entry only, when there is overtime)
			let payoutCheckbox: HTMLInputElement | null = null;
			let payoutHoursInput: HTMLInputElement | null = null;
			let payoutMinutesInput: HTMLInputElement | null = null;
			if (entry === lastEntry && dayOvertime > 0) {
				const payoutWrap = card.createDiv({ cls: 'tf-drawer-edit-payout' });
				const cbRow = payoutWrap.createDiv({ cls: 'tf-drawer-edit-payout-row' });
				payoutCheckbox = cbRow.createEl('input');
				payoutCheckbox.type = 'checkbox';
				payoutCheckbox.id = `tf-inline-payout-${index}`;
				payoutCheckbox.checked = (entry.overtimePayout ?? 0) > 0;
				const cbLabel = cbRow.createEl('label', { text: t('modals.overtimePayout') });
				cbLabel.htmlFor = payoutCheckbox.id;

				const inputsRow = payoutWrap.createDiv({ cls: 'tf-drawer-edit-payout-inputs' });
				if (!payoutCheckbox.checked) inputsRow.addClass('tf-hidden');
				const initial = entry.overtimePayout ?? dayOvertime;
				payoutHoursInput = inputsRow.createEl('input', { cls: 'tf-drawer-edit-num' });
				payoutHoursInput.type = 'number';
				payoutHoursInput.min = '0';
				payoutHoursInput.value = Math.floor(initial).toString();
				inputsRow.createSpan({ text: this.settings.hourUnit });
				payoutMinutesInput = inputsRow.createEl('input', { cls: 'tf-drawer-edit-num' });
				payoutMinutesInput.type = 'number';
				payoutMinutesInput.min = '0';
				payoutMinutesInput.max = '59';
				payoutMinutesInput.value = Math.round((initial - Math.floor(initial)) * 60).toString();
				inputsRow.createSpan({ text: 'min' });
				inputsRow.createSpan({ cls: 'tf-drawer-edit-payout-max', text: `(max ${Utils.formatHoursToHM(dayOvertime, this.settings.hourUnit)})` });
				const cb = payoutCheckbox;
				payoutCheckbox.onchange = () => inputsRow.toggleClass('tf-hidden', !cb.checked);
			}

			appliers.push(() => {
				const sDate = startDateInput ? startDateInput.value : startDateStr;
				const sTime = startTimeInput.value;
				const eDate = endDateInput ? endDateInput.value : endDateStr;
				const eTime = endTimeInput.value;
				if (!sDate || !sTime) return t('validation.startTimeRequired');
				const newStart = new Date(`${sDate}T${sTime}:00`);
				if (isNaN(newStart.getTime())) return t('validation.invalidStartDateTime');

				let newEnd: Date | null = null;
				if (eTime) {
					newEnd = new Date(`${eDate}T${eTime}:00`);
					if (isNaN(newEnd.getTime())) return t('validation.invalidEndDateTime');
					if (newEnd <= newStart) return t('validation.endAfterStart');
					if (this.checkProhibitedOverlap(Utils.toLocalDateStr(newStart), entry.name, newStart, newEnd, entry)) {
						return t('validation.overlappingEntry');
					}
				}

				if (payoutCheckbox) {
					if (payoutCheckbox.checked) {
						const h = parseInt(payoutHoursInput!.value) || 0;
						const m = parseInt(payoutMinutesInput!.value) || 0;
						const payout = h + m / 60;
						if (payout > dayOvertime + 0.01) {
							return t('modals.payoutExceedsOvertime').replace('{hours}', dayOvertime.toFixed(2));
						}
						entry.overtimePayout = payout;
					} else {
						delete entry.overtimePayout;
					}
				}

				entry.startTime = Utils.toLocalISOString(newStart);
				entry.endTime = newEnd ? Utils.toLocalISOString(newEnd) : null;
				return null;
			});
		});

		// Save button — applies every entry's changes atomically, then refreshes the dashboard.
		const saveRow = container.createDiv({ cls: 'tf-drawer-edit-save-row' });
		const saveBtn = saveRow.createEl('button', { cls: 'tf-drawer-action-btn tf-drawer-edit-save', text: t('buttons.save') });
		saveBtn.onclick = async () => {
			// Snapshot originals so a mid-list validation failure doesn't half-apply.
			const snapshot = workEntries.map(item => ({ entry: item.entry, startTime: item.entry.startTime, endTime: item.entry.endTime, overtimePayout: item.entry.overtimePayout }));
			for (const apply of appliers) {
				const err = apply();
				if (err) {
					snapshot.forEach(s => {
						s.entry.startTime = s.startTime;
						s.entry.endTime = s.endTime;
						if (s.overtimePayout === undefined) delete s.entry.overtimePayout;
						else s.entry.overtimePayout = s.overtimePayout;
					});
					new Notice(`❌ ${err}`);
					return;
				}
			}
			await this.saveWithErrorHandling();
			new Notice(`✅ ${t('notifications.entryUpdated')}`);
			this.timerManager.onTimerChange?.();
		};
	}

	// =====================================================================
	// Timeflow 2.0 — Upcoming flat list
	// =====================================================================

	private _fillUpcomingFlat(container: HTMLElement): void {
		container.empty();
		const today = new Date();
		const futureDays: Array<{date: string, label: string, color: string, textColor: string}> = [];

		Object.keys(this.data.holidays).forEach(dateStr => {
			const date = new Date(dateStr + 'T00:00:00');
			if (date >= today) {
				const holiday = this.data.holidays[dateStr];
				const behavior = this.settings.specialDayBehaviors.find(b => b.id === holiday.type);
				if (behavior) {
					let displayLabel = holiday.description || translateSpecialDayName(behavior.id, behavior.label);
					futureDays.push({ date: dateStr, label: displayLabel, color: behavior.color, textColor: behavior.textColor || '#fff' });
				}
			}
		});

		futureDays.sort((a, b) => a.date.localeCompare(b.date));

		// Collapse consecutive same-type planned days into one range row. Two entries merge
		// when they share the same label AND no *working* day falls between them (so a Fri→Mon
		// vacation bridges the weekend, but two blocks split by a real work day stay separate).
		const groups: typeof this._upcomingGroups = [];
		for (const day of futureDays) {
			const prev = groups[groups.length - 1];
			if (prev && prev.label === day.label && this._noWorkingDayBetween(prev.endDate, day.date)) {
				prev.endDate = day.date;
				prev.count += 1;
			} else {
				groups.push({ startDate: day.date, endDate: day.date, label: day.label, color: day.color, textColor: day.textColor, count: 1 });
			}
		}
		this._upcomingGroups = groups;
		this._upcomingItemsEl = null;
		if (groups.length === 0) return;

		const wrap = container.createDiv({ cls: 'tf-upcoming-flat' });
		wrap.createDiv({ cls: 'tf-upcoming-flat-title', text: t('v3.comingUp') });
		this._upcomingItemsEl = wrap.createDiv({ cls: 'tf-upcoming-flat-items' });
		// Default count; the wide layout adjusts this to fill the right column after layout.
		this._renderUpcomingItems(4);
	}

	// True when no working day (weekday that isn't a no-hours holiday) falls strictly between
	// the two ISO dates — reuses the same working-day/holiday resolution as the bar calendar.
	private _noWorkingDayBetween(aISO: string, bISO: string): boolean {
		const cur = new Date(aISO + 'T00:00:00');
		const end = new Date(bISO + 'T00:00:00');
		cur.setDate(cur.getDate() + 1);
		while (cur < end) {
			if (this._isWorkingDay(cur)) return false;
			cur.setDate(cur.getDate() + 1);
		}
		return true;
	}

	private _isWorkingDay(date: Date): boolean {
		if (!this.settings.workDays.includes(date.getDay())) return false; // weekend / non-work weekday
		const info = this.data.getHolidayInfo(Utils.toLocalDateStr(date));
		if (info) {
			const b = this.settings.specialDayBehaviors.find(sb => sb.id === info.type);
			if (b?.noHoursRequired) return false; // public holiday etc. — no work expected
		}
		return true;
	}

	private _renderUpcomingItems(count: number): void {
		const itemsEl = this._upcomingItemsEl;
		if (!itemsEl) return;
		itemsEl.empty();
		this._upcomingGroups.slice(0, Math.max(1, count)).forEach(g => {
			const item = itemsEl.createDiv({ cls: 'tf-upcoming-flat-item' });
			const start = new Date(g.startDate + 'T00:00:00');
			const dateText = g.count === 1
				? formatDate(start, 'long')
				: `${formatDate(start, 'range')}–${formatDate(new Date(g.endDate + 'T00:00:00'), 'long')}`;
			item.createDiv({ cls: 'tf-upcoming-date', text: dateText });
			const right = item.createDiv({ cls: 'tf-upcoming-right' });
			if (g.count > 1) {
				right.createSpan({ cls: 'tf-upcoming-count', text: `${g.count} ${t('ui.days')}` });
			}
			const chip = right.createDiv({ cls: 'tf-upcoming-chip', text: g.label });
			chip.setCssStyles({ backgroundColor: g.color, color: g.textColor });
		});
	}

	// Wide layout: the left column is stretched by the grid to match the (usually taller)
	// right column, leaving empty space below the upcoming list. Render as many upcoming
	// items as fit that space so the list grows with the stats section.
	private _adjustUpcomingToFit(): void {
		const itemsEl = this._upcomingItemsEl;
		if (!itemsEl || this._upcomingGroups.length === 0) return;

		// Sidebar layout keeps a small fixed preview.
		if (this.container.getAttribute('data-layout') !== 'wide') {
			if (itemsEl.childElementCount !== Math.min(4, this._upcomingGroups.length)) {
				this._renderUpcomingItems(4);
			}
			return;
		}

		const leftCol = itemsEl.closest<HTMLElement>('.tf-v3-left-col');
		if (!leftCol) return;
		// Need at least one rendered row to measure its height.
		if (itemsEl.childElementCount === 0) this._renderUpcomingItems(1);
		const sample = itemsEl.firstElementChild as HTMLElement | null;
		if (!sample) return;

		const itemH = sample.getBoundingClientRect().height;
		if (itemH <= 0) return;
		const available = leftCol.getBoundingClientRect().bottom - itemsEl.getBoundingClientRect().top;
		const fit = Math.max(1, Math.floor(available / itemH));
		const count = Math.min(fit, this._upcomingGroups.length);
		if (count !== itemsEl.childElementCount) this._renderUpcomingItems(count);
	}

	// =====================================================================
	// Timeflow 2.0 — Stats Footer (4 cells, narrow mode)
	// =====================================================================

	buildStatsFooter(): HTMLElement {
		const footer = createDiv({ cls: 'tf-stats-footer' });
		this.statsFooterEl = footer;
		this._fillStatsFooter(footer);
		return footer;
	}

	private _fillStatsFooter(footer: HTMLElement): void {
		footer.empty();
		const { avgDaily, avgWeekly } = this.data.getAverages();
		const stats = this.data.getStatistics('month', new Date().getFullYear(), new Date().getMonth());
		const weekGoal = this.settings.baseWorkweek * this.settings.workPercent;
		const workloadPct = weekGoal > 0 ? Math.round((avgWeekly / weekGoal) * 100) : 0;

		const addCell = (value: string, label: string) => {
			const cell = footer.createDiv({ cls: 'tf-stats-footer-cell' });
			cell.createDiv({ cls: 'tf-stats-footer-value', text: value });
			cell.createDiv({ cls: 'tf-stats-footer-label', text: label });
		};

		// 1 decimal to match the wide stats grid's "hours logged" precision (82.3t, not 82t).
		addCell(this._fmtHours(stats.totalHours ?? 0, 1), t('v3.thisMonth'));
		addCell(this._fmtHours(avgDaily, 1), t('v3.perDay'));
		addCell(this._fmtHours(avgWeekly, 1), t('v3.perWeek'));
		addCell(`${workloadPct}%`, t('v3.workload'));
	}

	updateStatsFooter(): void {
		if (!this.statsFooterEl) return;
		this._fillStatsFooter(this.statsFooterEl);
	}

	// =====================================================================
	// Timeflow 2.0 — Info Overlay
	// =====================================================================

	buildInfoOverlayContainer(): HTMLElement {
		const container = createDiv({ cls: 'tf-info-overlay-container' });
		let overlayVisible = false;
		let overlayEl: HTMLElement | null = null;

		const btn = container.createEl('button', { cls: 'tf-info-overlay-btn', text: '?' });
		btn.setAttribute('aria-label', t('ui.information'));

		btn.onclick = (e) => {
			e.stopPropagation();
			if (overlayVisible && overlayEl) {
				overlayEl.remove();
				overlayEl = null;
				overlayVisible = false;
			} else {
				overlayEl = this._buildInfoOverlayContent();
				container.appendChild(overlayEl);
				overlayVisible = true;

				// Close on outside click
				const closeOnOutside = (ev: MouseEvent) => {
					if (overlayEl && !container.contains(ev.target as Node)) {
						overlayEl.remove();
						overlayEl = null;
						overlayVisible = false;
						activeDocument.removeEventListener('mousedown', closeOnOutside);
					}
				};
				window.setTimeout(() => activeDocument.addEventListener('mousedown', closeOnOutside), 0);
			}
		};

		return container;
	}

	private _buildInfoOverlayContent(): HTMLElement {
		const overlay = createDiv({ cls: 'tf-info-overlay' });

		// Day-type colour legend
		const typeSection = overlay.createDiv({ cls: 'tf-info-overlay-section' });
		typeSection.createDiv({ cls: 'tf-info-overlay-title', text: t('info.specialDayTypes') });

		this.settings.specialDayBehaviors.forEach(b => {
			const row = typeSection.createDiv({ cls: 'tf-info-overlay-row' });
			const swatch = row.createDiv({ cls: 'tf-info-overlay-swatch' });
			swatch.style.background = b.color;
			row.appendText(`${b.icon} ${translateSpecialDayName(b.id, b.label)}`);
		});

		// Balance zones (only when goal tracking enabled)
		if (this.settings.enableGoalTracking) {
			const balSection = overlay.createDiv({ cls: 'tf-info-overlay-section' });
			balSection.createDiv({ cls: 'tf-info-overlay-title', text: t('info.flextimeBalanceZones') });

			const t_ = this.settings.balanceThresholds;
			const c = this.settings.customColors;
			[
				{ color: c?.balanceOk || '#4caf50', label: `${t_.warningLow}h – +${t_.warningHigh}h` },
				{ color: c?.balanceWarning || '#ff9800', label: `${t_.criticalLow}h – ${t_.warningLow - 1}h / +${t_.warningHigh}h – +${t_.criticalHigh}h` },
				{ color: c?.balanceCritical || '#f44336', label: `< ${t_.criticalLow}h / > +${t_.criticalHigh}h` },
			].forEach(zone => {
				const row = balSection.createDiv({ cls: 'tf-info-overlay-row' });
				const swatch = row.createDiv({ cls: 'tf-info-overlay-swatch' });
				swatch.style.background = zone.color;
				row.appendText(zone.label);
			});
		}

		return overlay;
	}

	// =====================================================================
	// Timeflow v3 — Dashboard Status Bar (bottom card)
	// =====================================================================

	buildDashboardStatusBar(): HTMLElement {
		const bar = createDiv({ cls: 'tf-status-bar' });

		const left = bar.createDiv({ cls: 'tf-status-bar-left' });
		const activeTimers = this.timerManager.getActiveTimers();
		const dot = left.createDiv({ cls: 'tf-status-dot' });
		if (activeTimers.length > 0) dot.addClass('warn');
		const statusText = activeTimers.length === 0
			? `${t('v3.allGood')} · ${t('v3.noActiveTimers')}`
			: t('v3.activeTimers').replace('{count}', String(activeTimers.length));
		left.createDiv({ cls: 'tf-status-text', text: statusText });

		const right = bar.createDiv({ cls: 'tf-status-bar-right' });
		// Brand lockup: glyph + "time" + accented "flow" (no font dependency).
		const brand = right.createDiv({ cls: 'tf-status-brand' });
		const glyph = brand.createSpan({ cls: 'tf-status-brand-icon' });
		setIcon(glyph, 'timeflow');
		const wordmark = brand.createSpan({ cls: 'tf-status-wordmark' });
		wordmark.createSpan({ text: 'time' });
		wordmark.createSpan({ cls: 'tf-status-wordmark-accent', text: 'flow' });
		right.createDiv({ cls: 'tf-status-version', text: `v${this.plugin.manifest.version}` });

		const helpBtn = right.createEl('button', { cls: 'tf-status-help-btn', text: '?' });
		helpBtn.setAttribute('aria-label', t('ui.information'));
		let overlayEl: HTMLElement | null = null;
		helpBtn.onclick = (e) => {
			e.stopPropagation();
			if (overlayEl) {
				overlayEl.remove();
				overlayEl = null;
			} else {
				overlayEl = this._buildInfoOverlayContent();
				overlayEl.setCssStyles({ position: 'absolute', bottom: 'calc(100% + 6px)', right: '0' });
				bar.setCssStyles({ position: 'relative' });
				bar.appendChild(overlayEl);
				const closeOnOutside = (ev: MouseEvent) => {
					if (overlayEl && !bar.contains(ev.target as Node)) {
						overlayEl.remove();
						overlayEl = null;
						activeDocument.removeEventListener('mousedown', closeOnOutside);
					}
				};
				window.setTimeout(() => activeDocument.addEventListener('mousedown', closeOnOutside), 0);
			}
		};

		return bar;
	}

	// =====================================================================
	// Timeflow v3 — Wide Mode Right Column
	// =====================================================================

	buildWideRightColumn(): HTMLElement {
		const col = createDiv({ cls: 'tf-v3-right-col' });
		this._fillWideRightColumn(col);
		return col;
	}

	private _fillWideRightColumn(col: HTMLElement): void {
		// Stats section with heading + timeframe tabs
		const statsSection = col.createDiv();
		const statsHeadRow = statsSection.createDiv({ cls: 'tf-v2-card-header' });
		statsHeadRow.createDiv({ cls: 'tf-wide-section-heading', text: t('ui.statistics') });

		// Re-render the whole column so the period selector, stats grid and leave
		// tracking all reflect the new timeframe/year/month together.
		const rerender = () => { col.empty(); this._fillWideRightColumn(col); };

		// Right-aligned controls group: year/month picker + timeframe tabs on one row.
		const headControls = statsHeadRow.createDiv({ cls: 'tf-stats-head-controls' });

		// Year / month selector (hidden for the all-time "total" view)
		this._fillStatsPeriodSelector(headControls, rerender);

		const tabs = headControls.createDiv({ cls: 'tf-stats-tabs' });
		const timeframeLabels: Record<string, string> = { month: t('timeframes.month'), year: t('timeframes.year'), total: t('timeframes.total') };
		['month', 'year', 'total'].forEach(tf => {
			const tab = tabs.createEl('button', {
				cls: `tf-stats-tab${this.statsTimeframe === tf ? ' active' : ''}`,
				text: timeframeLabels[tf] ?? tf,
			});
			tab.onclick = () => {
				this.statsTimeframe = tf;
				rerender();
			};
		});

		// Stats grid + trend deltas live in one bordered card; the trend row is a footer
		// inside it (symmetric padding, real divider) rather than a row floating below the
		// card with lopsided margins.
		const statsCard = statsSection.createDiv({ cls: 'tf-wide-stats-card' });
		const gridEl = statsCard.createDiv({ cls: 'tf-wide-stats-grid' });
		this._fillWideStatsGrid(gridEl);

		// Trend deltas (vs previous week / month) as the card's footer row.
		this._fillTrendDelta(statsCard);

		// Leave tracking — all absence types; only those with booked days/hours render.
		const leaveItems = this._leaveBehaviors();
		const leaveSection = col.createDiv({ cls: 'tf-right-section' });
		this._fillLeaveTracking(leaveSection, leaveItems);

		// Weekly hours chart
		const chartSection = col.createDiv({ cls: 'tf-right-section' });
		chartSection.createDiv({ cls: 'tf-weekly-chart-label', text: t('v3.weeklyHoursLabel') });
		this._fillWideWeeklyChart(chartSection);
	}

	// Period picker so stats can look back: a single combined "month year" dropdown in
	// month view, or a year dropdown in year view. (All-time has no period to pick.)
	private _fillStatsPeriodSelector(container: HTMLElement, onChange: () => void): void {
		if (this.statsTimeframe === 'total') return;
		const availableYears = this.data.getAvailableYears();
		if (availableYears.length === 0) return;

		const row = container.createDiv({ cls: 'tf-stats-period' });
		const select = row.createEl('select', { cls: 'tf-stats-period-select' });

		if (this.statsTimeframe === 'month') {
			// Combined month+year options, most recent first.
			[...availableYears].sort((a, b) => b - a).forEach(y => {
				this.data.getAvailableMonthsForYear(y).slice().sort((a, b) => b - a).forEach(m => {
					const opt = select.createEl('option', { text: getMonthName(new Date(y, m, 1)) });
					opt.value = `${y}-${m}`;
					if (y === this.selectedYear && m === this.selectedMonth) opt.selected = true;
				});
			});
			select.onchange = () => {
				const [y, m] = select.value.split('-').map(Number);
				this.selectedYear = y;
				this.selectedMonth = m;
				onChange();
			};
		} else {
			availableYears.forEach(y => {
				const opt = select.createEl('option', { text: String(y) });
				opt.value = String(y);
				if (y === this.selectedYear) opt.selected = true;
			});
			select.onchange = () => {
				this.selectedYear = parseInt(select.value);
				onChange();
			};
		}
	}

	private _fillWideStatsGrid(grid: HTMLElement): void {
		const stats = this.data.getStatistics(this.statsTimeframe, this.selectedYear, this.selectedMonth);
		const { avgDaily, avgWeekly } = this.data.getAverages();
		const unit = this.settings.hourUnit;
		const weekGoal = this.settings.baseWorkweek * this.settings.workPercent;
		const dailyGoal = this.settings.baseWorkday * this.settings.workPercent;
		const weekLimit = this.settings.complianceSettings?.weeklyHoursLimit ?? weekGoal;
		const workloadPct = weekGoal > 0 ? Math.round((avgWeekly / weekGoal) * 100) : 0;
		// Sublabel that reflects the active timeframe (month / year / total)
		const periodSub = this.statsTimeframe === 'year' ? t('v3.thisYearSub')
			: this.statsTimeframe === 'total' ? t('v3.totalSub')
			: t('v3.thisMonthSub');

		const addCell = (value: string, label: string, sublabel?: string) => {
			const cell = grid.createDiv({ cls: 'tf-wide-stats-cell' });
			cell.createDiv({ cls: 'tf-wide-stats-value', text: value });
			cell.createDiv({ cls: 'tf-wide-stats-label', text: label });
			if (sublabel) cell.createDiv({ cls: 'tf-wide-stats-sublabel', text: sublabel });
		};

		addCell(this._fmtHours(stats.totalHours ?? 0, 1), t('v3.hoursLogged'), periodSub);
		addCell(this._fmtHours(avgDaily, 1), t('v3.dailyAverage'), t('v3.goalSub').replace('{value}', this._fmtGoal(dailyGoal)));
		addCell(this._fmtHours(avgWeekly, 1), t('v3.weeklyAverage'), t('v3.limitSub').replace('{value}', this._fmtGoal(weekLimit)));
		addCell(`${workloadPct}%`, t('v3.workload'), t('v3.ofNormalWeek'));
		addCell(String(stats.workDays ?? 0), t('v3.workDays'), t('v3.weekendsSub').replace('{count}', String(stats.weekendDays ?? 0)));

		// Comp-time cell: resolve the comp-time type by its flextime effect, not a hardcoded id.
		const compBehavior = this.settings.specialDayBehaviors.find(b => !b.isWorkType && b.flextimeEffect === 'withdraw');
		if (compBehavior) {
			const usedComp = this._getLeaveUsedHours(compBehavior.id, { timeframe: this.statsTimeframe, year: this.selectedYear, month: this.selectedMonth })
				+ this._getUnderGoalWithdrawn({ timeframe: this.statsTimeframe, year: this.selectedYear, month: this.selectedMonth });
			const cell = grid.createDiv({ cls: 'tf-wide-stats-cell' });
			const valEl = cell.createDiv({ cls: 'tf-wide-stats-value', text: Utils.formatHoursToHM(usedComp, unit) });
			// Zero is an empty state, not an accent.
			valEl.style.color = usedComp > 0 ? compBehavior.color : 'var(--color-faint)';
			cell.createDiv({ cls: 'tf-wide-stats-label', text: t('v3.compTimeUsed') });
			cell.createDiv({ cls: 'tf-wide-stats-sublabel', text: periodSub });
		}
	}

	// Absence types shown in leave tracking: not work, and not pure public holidays
	// (helligdag-style: no flextime effect and no yearly quota — imposed, not "leave used").
	private _leaveBehaviors(): SpecialDayBehavior[] {
		return this.settings.specialDayBehaviors.filter(b =>
			!b.isWorkType
			&& b.id !== 'jobb'
			&& !(b.flextimeEffect === 'none' && b.maxDaysPerYear == null)
		);
	}

	private _fillLeaveTracking(
		section: HTMLElement,
		behaviors: SpecialDayBehavior[],
		opts: { compact?: boolean; showAll?: boolean } = {}
	): void {
		const { compact = false, showAll = false } = opts;
		const unit = this.settings.hourUnit;
		const year = this.selectedYear;
		const dailyGoal = this.settings.baseWorkday * this.settings.workPercent;

		// Build render rows. Wide: skip any type with no booked days/hours. Compact (collapsed):
		// keep quota'd types even at 0 so "0 / 25 days" shows; drop quota-less unused noise.
		// showAll (expanded): keep every configured type.
		const rows: { b: SpecialDayBehavior; pct: number; countsText: string; hasQuota: boolean; isEmpty: boolean }[] = [];
		behaviors.forEach(b => {
			const hasQuota = b.maxDaysPerYear != null;
			// Comp-time / withdraw types are inherently hours-based; everything else counts in days.
			if (b.flextimeEffect === 'withdraw') {
				// Include flextime withdrawn implicitly by completed under-goal days.
				const used = this._getLeaveUsedHours(b.id, { timeframe: 'year', year }) + this._getUnderGoalWithdrawn({ timeframe: 'year', year });
				if (!showAll && used <= 0 && !(compact && hasQuota)) return;
				const quota = hasQuota ? (b.maxDaysPerYear as number) * dailyGoal : 0;
				const pct = hasQuota && quota > 0 ? Math.min((used / quota) * 100, 100) : 0;
				const countsText = hasQuota
					? `${Utils.formatHoursToHM(used, unit)} / ${Utils.formatHoursToHM(quota, unit)}`
					: Utils.formatHoursToHM(used, unit);
				rows.push({ b, pct, countsText, hasQuota, isEmpty: used <= 0 });
			} else {
				const usedDays = this._getLeaveUsedDays(b.id, year);
				if (!showAll && usedDays <= 0 && !(compact && hasQuota)) return;
				const quotaDays = hasQuota ? (b.maxDaysPerYear as number) : 0;
				const pct = hasQuota && quotaDays > 0 ? Math.min((usedDays / quotaDays) * 100, 100) : 0;
				const fmtDays = (d: number) => `${Number.isInteger(d) ? d : d.toFixed(1)} ${t('ui.days')}`;
				const countsText = hasQuota ? `${fmtDays(usedDays)} / ${fmtDays(quotaDays)}` : fmtDays(usedDays);
				rows.push({ b, pct, countsText, hasQuota, isEmpty: usedDays <= 0 });
			}
		});

		if (rows.length === 0) return;

		if (compact) {
			const head = section.createDiv({ cls: 'tf-compact-section-head' });
			head.createSpan({ cls: 'tf-compact-section-label', text: t('v3.leaveUsedThisYear') });
			const toggle = head.createEl('button', {
				cls: 'tf-compact-see-all',
				text: showAll ? `${t('ui.showLess')} ←` : `${t('ui.seeAll')} →`,
			});
			toggle.addEventListener('click', () => {
				this._showAllLeaveNarrow = !this._showAllLeaveNarrow;
				this._rebuildLeaveSection();
			});
		} else {
			section.createDiv({ cls: 'tf-leave-section-label', text: t('v3.leaveUsedThisYear') });
		}

		const rowsWrap = section.createDiv({ cls: `tf-leave-section${compact ? ' tf-leave-section-compact' : ''}` });
		rows.forEach(({ b, pct, countsText, hasQuota, isEmpty }) => {
			const row = rowsWrap.createDiv({ cls: 'tf-leave-row' });
			const top = row.createDiv({ cls: 'tf-leave-row-top' });
			const labelGroup = top.createDiv({ cls: 'tf-leave-label-group' });
			const dot = labelGroup.createDiv({ cls: 'tf-leave-dot' });
			dot.setCssStyles({ backgroundColor: b.color });
			labelGroup.createDiv({ cls: 'tf-leave-label', text: translateSpecialDayName(b.id, b.label) });
			const counts = top.createDiv({ cls: 'tf-leave-counts', text: countsText });
			// A zero value is an empty state, not an accent — mute it.
			counts.setCssStyles({ color: isEmpty ? 'var(--color-faint)' : b.color });
			// No quota → no denominator → no progress fill. Render no track at all
			// (an empty track reads as a bar that failed to load).
			if (hasQuota) {
				const track = row.createDiv({ cls: 'tf-leave-bar-track' });
				const fill = track.createDiv({ cls: 'tf-leave-bar-fill' });
				fill.setCssStyles({ width: `${pct}%`, backgroundColor: b.color });
			} else {
				row.addClass('tf-leave-row--no-bar');
			}
		});
	}

	private _rebuildLeaveSection(): void {
		if (!this._narrowLeaveEl) return;
		this._narrowLeaveEl.empty();
		const items = this._leaveBehaviors();
		this._fillLeaveTracking(this._narrowLeaveEl, items, { compact: true, showAll: this._showAllLeaveNarrow });
	}

	// Compact "Recent days" list for the sidebar: one row per day (newest first) with a type
	// chip and the day's net flextime. Reuses the same daily-entry data as the wide history.
	private _fillRecentHistory(section: HTMLElement, opts: { showAll: boolean }): void {
		const unit = this.settings.hourUnit;
		const allKeys = Object.keys(this.data.daily)
			.filter(k => (this.data.daily[k] || []).length > 0)
			.sort()
			.reverse();
		if (allKeys.length === 0) return;
		// Collapsed: the 5 most recent days, flat. Expanded: every day, grouped by month.
		const dayKeys = opts.showAll ? allKeys : allKeys.slice(0, 5);

		const head = section.createDiv({ cls: 'tf-compact-section-head' });
		head.createSpan({ cls: 'tf-compact-section-label', text: t('ui.history') });
		const toggle = head.createEl('button', {
			cls: 'tf-compact-see-all',
			text: opts.showAll ? `${t('ui.showLess')} ←` : `${t('ui.seeAll')} →`,
		});
		toggle.addEventListener('click', () => {
			this._showAllHistoryNarrow = !this._showAllHistoryNarrow;
			this._rebuildHistorySection();
		});

		const dayNames = getDayNamesShort();
		const renderRow = (list: HTMLElement, key: string) => {
			const entries = this.data.daily[key];
			const flex = entries.reduce((s, e) => s + (e.flextime || 0), 0);
			// Dominant type = the entry with the most logged hours that day.
			let topName = entries[0].name;
			let topDur = -1;
			entries.forEach(e => {
				const d = e.duration || 0;
				if (d > topDur) { topDur = d; topName = e.name; }
			});
			const b = this.settings.specialDayBehaviors.find(x => x.id === topName.toLowerCase());

			const date = new Date(key + 'T12:00:00');
			const dateLabel = `${dayNames[(date.getDay() + 6) % 7]} ${date.getDate()}`;

			const row = list.createDiv({ cls: 'tf-compact-hist-row' });
			row.createSpan({ cls: 'tf-compact-hist-date', text: dateLabel });
			const chip = row.createSpan({
				cls: 'tf-compact-hist-type',
				text: b ? translateSpecialDayName(b.id, b.label) : topName,
			});
			if (b) chip.setCssStyles({ color: b.textColor || '#fff', backgroundColor: b.color });
			const sign = flex >= 0 ? '+' : '−';
			row.createSpan({
				cls: `tf-compact-hist-flex ${flex >= 0 ? 'tf-trend-pos' : 'tf-trend-neg'}`,
				text: `${sign}${Utils.formatHoursToHM(Math.abs(flex), unit)}`,
			});
		};

		if (opts.showAll) {
			// One month heading per calendar month, newest first, with that month's days under it.
			let currentMonthKey = '';
			let list: HTMLElement | null = null;
			dayKeys.forEach(key => {
				const date = new Date(key + 'T12:00:00');
				const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
				if (monthKey !== currentMonthKey || !list) {
					currentMonthKey = monthKey;
					section.createDiv({ cls: 'tf-compact-hist-month', text: getMonthName(date) });
					list = section.createDiv({ cls: 'tf-compact-hist-list' });
				}
				renderRow(list, key);
			});
		} else {
			const list = section.createDiv({ cls: 'tf-compact-hist-list' });
			dayKeys.forEach(key => renderRow(list, key));
		}
	}

	private _rebuildHistorySection(): void {
		if (!this._narrowHistoryEl) return;
		this._narrowHistoryEl.empty();
		this._fillRecentHistory(this._narrowHistoryEl, { showAll: this._showAllHistoryNarrow });
	}

	// "vs last week / vs last month" trend deltas; magnitude is formatted, the arrow is ours.
	private _getWeekDelta(): number {
		const today = new Date();
		const dow = today.getDay();
		const daysFromMonday = dow === 0 ? 6 : dow - 1;
		const thisMonday = new Date(today);
		thisMonday.setHours(0, 0, 0, 0);
		thisMonday.setDate(today.getDate() - daysFromMonday);
		const prevMonday = new Date(thisMonday);
		prevMonday.setDate(thisMonday.getDate() - 7);
		return this.getWeekComplianceData(thisMonday).totalHours - this.getWeekComplianceData(prevMonday).totalHours;
	}

	private _getMonthDelta(): number {
		const now = new Date();
		const y = now.getFullYear();
		const m = now.getMonth();
		const cur = this.data.getStatistics('month', y, m).totalHours ?? 0;
		const pm = m === 0 ? 11 : m - 1;
		const py = m === 0 ? y - 1 : y;
		const prev = this.data.getStatistics('month', py, pm).totalHours ?? 0;
		return cur - prev;
	}

	private _fillTrendDelta(container: HTMLElement): void {
		const unit = this.settings.hourUnit;
		const row = container.createDiv({ cls: 'tf-trend-delta' });
		const renderDelta = (label: string, delta: number) => {
			const cell = row.createDiv({ cls: 'tf-trend-cell' });
			cell.createSpan({ cls: 'tf-trend-label', text: label });
			const valueCls = delta > 0 ? 'tf-trend-pos' : delta < 0 ? 'tf-trend-neg' : 'tf-trend-zero';
			const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '·';
			cell.createSpan({
				cls: `tf-trend-value ${valueCls}`,
				text: `${arrow} ${Utils.formatHoursToHM(Math.abs(delta), unit)}`,
			});
		};
		renderDelta(t('ui.vsLastWeek'), this._getWeekDelta());
		renderDelta(t('ui.vsLastMonth'), this._getMonthDelta());
	}

	// Days of a day-based leave type booked this year (taken + planned), from the absence
	// flow (holidays store) plus any leave logged as timer entries, deduped per date.
	private _getLeaveUsedDays(behaviorId: string, year: number): number {
		const dailyGoal = this.settings.baseWorkday * this.settings.workPercent;
		const perDate: Record<string, number> = {};
		Object.entries(this.data.holidays).forEach(([dateKey, info]) => {
			if (info.type !== behaviorId) return;
			if (new Date(dateKey + 'T12:00:00').getFullYear() !== year) return;
			perDate[dateKey] = Math.max(perDate[dateKey] ?? 0, info.halfDay ? 0.5 : 1);
		});
		Object.entries(this.data.daily).forEach(([dateKey, entries]) => {
			if (new Date(dateKey + 'T12:00:00').getFullYear() !== year) return;
			const hours = entries.reduce((s, e) => e.name === behaviorId ? s + (e.duration || 0) : s, 0);
			if (hours <= 0) return;
			const frac = dailyGoal > 0 ? Math.min(hours / dailyGoal, 1) : 0;
			perDate[dateKey] = Math.max(perDate[dateKey] ?? 0, frac);
		});
		return Object.values(perDate).reduce((s, v) => s + v, 0);
	}

	private _getLeaveUsedHours(behaviorId: string, opts: { timeframe?: string; year?: number; month?: number } = {}): number {
		const timeframe = opts.timeframe ?? 'year';
		const today = new Date();
		const year = opts.year ?? today.getFullYear();
		const month = opts.month ?? today.getMonth();
		let total = 0;
		Object.entries(this.data.daily).forEach(([dateKey, entries]) => {
			if (timeframe !== 'total') {
				const d = new Date(dateKey + 'T12:00:00');
				if (d.getFullYear() !== year) return;
				if (timeframe === 'month' && d.getMonth() !== month) return;
			}
			entries.forEach(e => {
				if (e.name === behaviorId) total += (e.duration || 0);
			});
		});
		return total;
	}

	// Flextime withdrawn implicitly by completed (past) work days that ended under goal.
	// The shortfall already lowers the balance; we surface it in the comp-time ("avspasering")
	// counter so that figure reflects all withdrawn time, not just explicit avspasering entries.
	private _getUnderGoalWithdrawn(opts: { timeframe?: string; year?: number; month?: number } = {}): number {
		if (!this.settings.enableGoalTracking) return 0;
		const timeframe = opts.timeframe ?? 'year';
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const year = opts.year ?? today.getFullYear();
		const month = opts.month ?? today.getMonth();
		let total = 0;
		Object.entries(this.data.daily).forEach(([dateKey, entries]) => {
			const d = new Date(dateKey + 'T12:00:00');
			// Only count days that are over — today isn't "completed" yet.
			if (d >= today) return;
			if (timeframe !== 'total') {
				if (d.getFullYear() !== year) return;
				if (timeframe === 'month' && d.getMonth() !== month) return;
			}
			// Net flextime of the day's work entries (jobb / untyped). A negative sum means the
			// day ended under goal; that shortfall is the withdrawn time. Special entries like
			// avspasering are excluded here — they're already counted on their own.
			let workFlex = 0;
			let hasWork = false;
			entries.forEach(e => {
				const b = this.settings.specialDayBehaviors.find(x => x.id === e.name.toLowerCase());
				if (!b || b.isWorkType) { workFlex += e.flextime || 0; hasWork = true; }
			});
			if (hasWork && workFlex < 0) total += -workFlex;
		});
		return total;
	}

	private _fillWideWeeklyChart(container: HTMLElement): void {
		const weekTotals = this.data.getWeekTotals(7);
		const today = new Date();
		const weekGoal = this.settings.baseWorkweek * this.settings.workPercent;
		const weekLimit = this.settings.complianceSettings?.weeklyHoursLimit ?? 40;
		const currentWeekNum = Utils.getWeekNumber(today);
		const maxHours = Math.max(...weekTotals, weekGoal, 1);

		const chart = container.createDiv({ cls: 'tf-wide-weekly-chart' });

		// Goal/limit reference lines, scaled by the same maxHours/maxBarPx (60) the bars use.
		// Bars sit above the week-label row, so offset the lines by that baseline (label 14px + 4px gap).
		const refBarPx = 60;
		const baselinePx = 18;
		const goalPx = Math.min(Math.round((weekGoal / maxHours) * refBarPx), refBarPx);
		chart.createDiv({ cls: 'tf-wide-weekly-ref tf-wide-weekly-ref-goal' }).style.bottom = `${goalPx + baselinePx}px`;
		if (weekLimit > weekGoal) {
			const limitPx = Math.min(Math.round((weekLimit / maxHours) * refBarPx), refBarPx);
			chart.createDiv({ cls: 'tf-wide-weekly-ref tf-wide-weekly-ref-limit' }).style.bottom = `${limitPx + baselinePx}px`;
		}

		weekTotals.forEach((hours, i) => {
			const d = new Date(today);
			d.setDate(today.getDate() - (6 - i) * 7);
			const weekNum = Utils.getWeekNumber(d);
			const isCurrent = weekNum === currentWeekNum && d.getFullYear() === today.getFullYear();
			const isOverLimit = hours > weekLimit;
			// Bar height in pixels (percent heights collapse against an auto-height column)
			const maxBarPx = 60;
			const barPx = hours > 0 ? Math.max(Math.round((hours / maxHours) * maxBarPx), 3) : 0;

			const col = chart.createDiv({ cls: 'tf-wide-weekly-chart-col' });
			col.createDiv({
				cls: `tf-wide-weekly-chart-hour-label${isCurrent ? ' current' : ''}`,
				text: hours > 0 ? `${Math.round(hours)}${this.settings.hourUnit}` : '',
			});
			const barWrap = col.createDiv({
				cls: `tf-wide-weekly-chart-bar-wrap${isCurrent ? ' current' : isOverLimit ? ' over-limit' : ''}`,
			});
			barWrap.style.height = `${barPx}px`;
			col.createDiv({
				cls: `tf-wide-weekly-chart-label-el${isCurrent ? ' current' : ''}`,
				text: `${t('stats.weekPrefix')}${weekNum}`,
			});
		});
	}

	build(): HTMLElement {
		const layout = createDiv({ cls: 'tf-v3-layout' });

		// Set initial layout attribute and wire up ResizeObserver
		this.container.setAttribute('data-layout',
			this.container.offsetWidth >= 600 ? 'wide' : 'sidebar');
		const resizeObs = new ResizeObserver((entries: ResizeObserverEntry[]) => {
			const w = entries[0].contentRect.width;
			this.container.setAttribute('data-layout', w >= 600 ? 'wide' : 'sidebar');
			// Refit the upcoming list once layout/heights have settled.
			window.requestAnimationFrame(() => this._adjustUpcomingToFit());
		});
		resizeObs.observe(this.container);
		this._resizeObserver = resizeObs;

		// Top: balance hero + progress strip
		const top = layout.createDiv({ cls: 'tf-v3-top' });
		top.appendChild(this.buildBalanceHero());
		if (this.settings.enableGoalTracking) {
			top.appendChild(this.buildProgressStrip());
		}

		// Content: left col (calendar + upcoming) | right col (stats, visible only in wide mode)
		const content = layout.createDiv({ cls: 'tf-v3-content' });
		content.appendChild(this.buildBarCalendarSection());
		content.appendChild(this.buildWideRightColumn());

		// Stats footer (sidebar only, hidden in wide mode via CSS)
		layout.appendChild(this.buildStatsFooter());

		// Sidebar-only extras: trend deltas + compact leave tracking + recent history.
		// These restore mobile parity (the right column + history are wide-only); hidden in wide via CSS.
		const extras = layout.createDiv({ cls: 'tf-sidebar-extras' });
		this._fillTrendDelta(extras);
		const leaveItems = this._leaveBehaviors();
		this._narrowLeaveEl = extras.createDiv({ cls: 'tf-narrow-leave-section' });
		this._fillLeaveTracking(this._narrowLeaveEl, leaveItems, { compact: true, showAll: this._showAllLeaveNarrow });
		this._narrowHistoryEl = extras.createDiv({ cls: 'tf-narrow-history-section' });
		this._fillRecentHistory(this._narrowHistoryEl, { showAll: this._showAllHistoryNarrow });

		this.container.appendChild(layout);
		// History (wide only) sits above the status bar; status bar is the bottom-most card
		this.container.appendChild(this.buildHistoryCard());
		this.container.appendChild(this.buildDashboardStatusBar());
		this.container.appendChild(this.buildViewToggle());

		return this.container;
	}
}
