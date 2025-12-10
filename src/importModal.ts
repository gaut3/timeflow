import { App, Modal, Notice } from 'obsidian';
import { TimerManager, Timer } from './timerManager';
import { autoDetectAndParse, TimekeepParser, CSVParser, GenericJSONParser, ParseResult, ImportParser } from './importParsers';
import { t, formatDate, formatTime } from './i18n';

export class ImportModal extends Modal {
	timerManager: TimerManager;
	onSuccess: () => void | Promise<void>;
	selectedFormat: string = 'auto';
	parsedEntries: Timer[] = [];
	parseWarnings: string[] = [];

	constructor(app: App, timerManager: TimerManager, onSuccess: () => void | Promise<void>) {
		super(app);
		this.timerManager = timerManager;
		this.onSuccess = onSuccess;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('timeflow-import-modal');

		contentEl.createEl('h2', { text: t('import.title') });

		contentEl.createEl('p', {
			text: t('import.description'),
			cls: 'setting-item-description'
		});

		// Format selector
		const formatDiv = contentEl.createDiv({ cls: 'tf-import-format-div' });

		formatDiv.createEl('label', { text: t('import.format') + ' ', cls: 'tf-import-label' });

		const formatSelect = formatDiv.createEl('select', { cls: 'tf-import-select' });

		const formats = [
			{ value: 'auto', label: t('import.autoDetect') },
			{ value: 'timekeep', label: 'Timekeep JSON' },
			{ value: 'csv', label: 'CSV' },
			{ value: 'json', label: 'JSON Array' }
		];

		formats.forEach(f => {
			const option = formatSelect.createEl('option', { text: f.label, value: f.value });
			if (f.value === this.selectedFormat) option.selected = true;
		});

		formatSelect.onchange = () => {
			this.selectedFormat = formatSelect.value;
		};

		// File upload button
		const uploadDiv = contentEl.createDiv({ cls: 'tf-import-upload-div' });

		const fileInput = uploadDiv.createEl('input', {
			type: 'file',
			cls: 'tf-import-file-input',
			attr: { accept: '.json,.csv,.txt' }
		});

		const uploadBtn = uploadDiv.createEl('button', { text: '📁 ' + t('import.selectFile'), cls: 'tf-import-upload-btn' });
		uploadBtn.onclick = () => fileInput.click();

		const fileNameSpan = uploadDiv.createEl('span', { text: t('import.noFile'), cls: 'tf-import-file-name' });

		// Text area for manual input
		contentEl.createEl('div', { text: t('import.orPasteData'), cls: 'tf-import-textarea-label' });

		const textArea = contentEl.createEl('textarea', {
			cls: 'tf-import-textarea',
			attr: {
				rows: '12',
				placeholder: t('import.placeholder')
			}
		});

		// Handle file selection
		fileInput.onchange = () => {
			const file = fileInput.files?.[0];
			if (file) {
				fileNameSpan.textContent = file.name;
				const reader = new FileReader();
				reader.onload = (e) => {
					textArea.value = e.target?.result as string || '';
					this.updatePreview(textArea.value, previewDiv, importBtn);
				};
				reader.readAsText(file);
			}
		};

		// Preview section
		const previewDiv = contentEl.createDiv({ cls: 'tf-import-preview' });

		// Parse button
		const parseBtn = contentEl.createEl('button', { text: '🔍 ' + t('buttons.preview'), cls: 'tf-import-parse-btn' });
		parseBtn.onclick = () => {
			this.updatePreview(textArea.value, previewDiv, importBtn);
		};

		// Also parse on text change after a delay
		let parseTimeout: number;
		textArea.oninput = () => {
			clearTimeout(parseTimeout);
			parseTimeout = window.setTimeout(() => {
				if (textArea.value.trim().length > 50) {
					this.updatePreview(textArea.value, previewDiv, importBtn);
				}
			}, 500);
		};

		// Info section
		const infoDiv = contentEl.createDiv({ cls: 'tf-import-info' });

		infoDiv.createEl('strong', { text: '📋 ' + t('import.supportedFormats') });
		const list = infoDiv.createEl('ul');
		list.createEl('li', { text: 'Timekeep JSON: {"entries": [...]}' });
		list.createEl('li', { text: `CSV: ${t('import.tableHeaders.date')};${t('import.tableHeaders.start')};${t('import.tableHeaders.end')};Type` });
		list.createEl('li', { text: 'JSON Array: [{"date": "...", "start": "...", ...}]' });

		// Buttons
		const buttonDiv = contentEl.createDiv({ cls: 'tf-import-buttons' });

		const cancelBtn = buttonDiv.createEl('button', { text: t('buttons.cancel') });
		cancelBtn.onclick = () => this.close();

		const importBtn = buttonDiv.createEl('button', { text: t('buttons.import'), cls: 'mod-cta' });
		importBtn.disabled = true;
		importBtn.onclick = async () => {
			if (this.parsedEntries.length === 0) {
				new Notice('⚠️ ' + t('import.noEntries'));
				return;
			}

			try {
				// Import entries
				const currentEntries = this.timerManager.data.entries;
				let addedCount = 0;
				let skippedCount = 0;

				this.parsedEntries.forEach(entry => {
					// Check for duplicates
					const isDuplicate = currentEntries.some(e =>
						e.name === entry.name &&
						e.startTime === entry.startTime &&
						e.endTime === entry.endTime
					);

					if (!isDuplicate) {
						currentEntries.push(entry);
						addedCount++;
					} else {
						skippedCount++;
					}
				});

				this.timerManager.data.entries = currentEntries;
				await this.timerManager.save();

				if (skippedCount > 0) {
					new Notice(`✅ ${t('import.imported')} ${addedCount} ${t('import.entries')}, ${t('import.skippedDuplicates')} ${skippedCount} ${t('import.duplicates')}`);
				} else {
					new Notice(`✅ ${t('import.imported')} ${addedCount} ${t('import.entries')}!`);
				}

				this.close();
				this.onSuccess();
			} catch (error) {
				new Notice(`❌ ${t('import.errors_label')}: ${error instanceof Error ? error.message : String(error)}`);
				console.error('Import error:', error);
			}
		};
	}

	updatePreview(content: string, previewDiv: HTMLElement, importBtn: HTMLButtonElement): void {
		previewDiv.empty();
		this.parsedEntries = [];
		this.parseWarnings = [];

		if (!content.trim()) {
			previewDiv.removeClass('is-visible');
			importBtn.disabled = true;
			return;
		}

		let result: ParseResult & { format?: string };

		// Parse based on selected format
		if (this.selectedFormat === 'auto') {
			result = autoDetectAndParse(content);
		} else {
			let parser: ImportParser;
			switch (this.selectedFormat) {
				case 'timekeep':
					parser = new TimekeepParser();
					break;
				case 'csv':
					parser = new CSVParser();
					break;
				case 'json':
					parser = new GenericJSONParser();
					break;
				default:
					parser = new TimekeepParser();
			}
			result = { ...parser.parse(content), format: parser.name };
		}

		previewDiv.addClass('is-visible');

		// Show format detected
		const formatInfo = previewDiv.createEl('div', { cls: 'tf-import-format-info' });
		formatInfo.createEl('strong', { text: t('import.format') });
		formatInfo.appendText(' ' + (result.format || '?'));

		// Show errors
		if (result.errors.length > 0) {
			const errorDiv = previewDiv.createEl('div', { cls: 'tf-import-error' });
			errorDiv.createEl('strong', { text: '❌ ' + t('import.errors_label') + ':' });
			const errorList = errorDiv.createEl('ul');
			result.errors.forEach(err => errorList.createEl('li', { text: err }));
		}

		// Show warnings
		if (result.warnings.length > 0) {
			const warnDiv = previewDiv.createEl('div', { cls: 'tf-import-warning' });
			warnDiv.createEl('strong', { text: '⚠️ ' + t('import.warnings') + ':' });
			const warnList = warnDiv.createEl('ul');
			// Show max 5 warnings
			result.warnings.slice(0, 5).forEach(warn => warnList.createEl('li', { text: warn }));
			if (result.warnings.length > 5) {
				warnList.createEl('li', { text: `... ${t('import.andMore')} ${result.warnings.length - 5} ${t('import.more')}` });
			}
		}

		// Show preview of entries
		if (result.entries.length > 0) {
			this.parsedEntries = result.entries;
			importBtn.disabled = false;

			const successDiv = previewDiv.createEl('div', { cls: 'tf-import-success' });
			successDiv.createEl('strong', { text: '✅ ' + result.entries.length + ' ' + t('import.entriesFound') });

			// Show first 5 entries as preview
			const previewTable = previewDiv.createEl('table', { cls: 'tf-import-preview-table' });

			const thead = previewTable.createEl('thead');
			const headerRow = thead.createEl('tr');
			[t('import.tableHeaders.date'), t('import.tableHeaders.start'), t('import.tableHeaders.end'), t('import.tableHeaders.type')].forEach(h => {
				headerRow.createEl('th', { text: h });
			});

			const tbody = previewTable.createEl('tbody');
			result.entries.slice(0, 5).forEach(entry => {
				const row = tbody.createEl('tr');

				const startDate = new Date(entry.startTime!);
				const endDate = entry.endTime ? new Date(entry.endTime) : null;

				const dateStr = formatDate(startDate);
				const startStr = formatTime(startDate);
				const endStr = endDate ? formatTime(endDate) : '-';

				[dateStr, startStr, endStr, entry.name].forEach(val => {
					row.createEl('td', { text: val });
				});
			});

			if (result.entries.length > 5) {
				const moreRow = tbody.createEl('tr', { cls: 'tf-import-more-row' });
				moreRow.createEl('td', {
					text: `... ${t('import.andMore')} ${result.entries.length - 5} ${t('import.more')}`,
					attr: { colspan: '4' }
				});
			}
		} else {
			importBtn.disabled = true;
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
