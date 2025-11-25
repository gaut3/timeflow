import { App, Modal, Notice, Setting } from 'obsidian';
import { TimerManager } from './timerManager';

export class ImportModal extends Modal {
	timerManager: TimerManager;
	onSuccess: () => void;

	constructor(app: App, timerManager: TimerManager, onSuccess: () => void) {
		super(app);
		this.timerManager = timerManager;
		this.onSuccess = onSuccess;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Import Timekeep Data' });

		contentEl.createEl('p', {
			text: 'Paste your Timekeep JSON data below. This can be from a timekeep codeblock or exported data.',
			cls: 'setting-item-description'
		});

		// Text area for JSON input
		const textArea = contentEl.createEl('textarea', {
			attr: {
				rows: '15',
				placeholder: '{"entries":[...]}'
			}
		});
		textArea.style.width = '100%';
		textArea.style.fontFamily = 'monospace';
		textArea.style.fontSize = '12px';
		textArea.style.marginBottom = '15px';

		// Info section
		const infoDiv = contentEl.createDiv();
		infoDiv.style.marginBottom = '15px';
		infoDiv.style.padding = '10px';
		infoDiv.style.background = 'var(--background-secondary)';
		infoDiv.style.borderRadius = '5px';

		infoDiv.createEl('strong', { text: '📋 How to get your data:' });
		const list = infoDiv.createEl('ul');
		list.createEl('li', { text: 'Open your file with Timekeep codeblocks' });
		list.createEl('li', { text: 'Copy the entire JSON from inside the timekeep block' });
		list.createEl('li', { text: 'Paste it in the text area above' });

		// Buttons
		const buttonDiv = contentEl.createDiv();
		buttonDiv.style.display = 'flex';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.justifyContent = 'flex-end';

		const cancelBtn = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();

		const importBtn = buttonDiv.createEl('button', { text: 'Import', cls: 'mod-cta' });
		importBtn.onclick = async () => {
			const jsonText = textArea.value.trim();
			if (!jsonText) {
				new Notice('⚠️ Please paste your Timekeep data');
				return;
			}

			try {
				// Try to parse JSON
				const data = JSON.parse(jsonText);

				// Validate structure
				if (!data.entries || !Array.isArray(data.entries)) {
					new Notice('⚠️ Invalid format: missing "entries" array');
					return;
				}

				// Validate at least one entry has the right structure
				if (data.entries.length > 0) {
					const firstEntry = data.entries[0];
					if (!firstEntry.hasOwnProperty('name') || !firstEntry.hasOwnProperty('startTime')) {
						new Notice('⚠️ Invalid entry format: missing required fields (name, startTime)');
						return;
					}
				}

				// Import the data
				const success = await this.timerManager.importTimekeepData(jsonText);

				if (success) {
					new Notice(`✅ Successfully imported ${data.entries.length} entries!`);
					this.close();
					this.onSuccess(); // Refresh the dashboard
				} else {
					new Notice('❌ Failed to import data');
				}

			} catch (error: any) {
				if (error instanceof SyntaxError) {
					new Notice('⚠️ Invalid JSON format. Please check your data.');
				} else {
					new Notice(`❌ Error: ${error.message}`);
				}
				console.error('Import error:', error);
			}
		};

		// Add keyboard shortcut hint
		const hint = contentEl.createEl('div');
		hint.style.marginTop = '10px';
		hint.style.fontSize = '12px';
		hint.style.color = 'var(--text-muted)';
		hint.textContent = '💡 Tip: You can also create "TimeFlow Data.md" manually in your vault root';
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
