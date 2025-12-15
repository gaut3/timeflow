import { App, Modal } from 'obsidian';
import { Timer } from './timerManager';
import { t } from './i18n';
import { Utils } from './utils';

export class CommentModal extends Modal {
	timer: Timer;
	isRequired: boolean;
	hoursOverThreshold: number;
	onSubmit: (comment: string) => void | Promise<void>;
	onSkip: () => void | Promise<void>;

	constructor(
		app: App,
		timer: Timer,
		isRequired: boolean,
		hoursOverThreshold: number,
		onSubmit: (comment: string) => void | Promise<void>,
		onSkip: () => void | Promise<void>
	) {
		super(app);
		this.timer = timer;
		this.isRequired = isRequired;
		this.hoursOverThreshold = hoursOverThreshold;
		this.onSubmit = onSubmit;
		this.onSkip = onSkip;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('tf-comment-modal');

		// Title
		contentEl.createEl('h3', {
			text: t('modals.commentTitle'),
			cls: 'tf-comment-modal-title'
		});

		// Show required notice if comment is mandatory
		if (this.isRequired) {
			const noticeDiv = contentEl.createDiv({ cls: 'tf-comment-required-notice' });
			noticeDiv.createEl('strong', { text: '⚠️ ' + t('modals.commentRequired') });
			noticeDiv.createEl('br');
			const explanation = t('modals.overtimeExplanation').replace(
				'{hours}',
				Utils.formatHoursToHM(this.hoursOverThreshold)
			);
			noticeDiv.appendText(explanation);
		}

		// Prompt text
		contentEl.createEl('p', {
			text: t('modals.commentPrompt'),
			cls: 'tf-comment-prompt'
		});

		// Textarea for comment
		const textarea = contentEl.createEl('textarea', {
			cls: 'tf-comment-textarea',
			attr: {
				rows: '4',
				maxlength: '500',
				placeholder: this.timer.comment || ''
			}
		});
		textarea.value = this.timer.comment || '';

		// Character count
		const charCount = contentEl.createDiv({ cls: 'tf-comment-char-count' });
		const updateCharCount = () => {
			charCount.textContent = `${textarea.value.length}/500`;
		};
		updateCharCount();
		textarea.addEventListener('input', updateCharCount);

		// Button container
		const buttonDiv = contentEl.createDiv({ cls: 'tf-comment-buttons' });

		// Skip button
		const skipBtn = buttonDiv.createEl('button', {
			text: t('modals.skip'),
			cls: 'tf-comment-skip-btn'
		});
		if (this.isRequired) {
			skipBtn.disabled = true;
			skipBtn.addClass('tf-comment-skip-disabled');
			skipBtn.title = t('modals.commentRequired');
		}
		skipBtn.addEventListener('click', async () => {
			this.close();
			await this.onSkip();
		});

		// Save button
		const saveBtn = buttonDiv.createEl('button', {
			text: t('buttons.save'),
			cls: 'mod-cta'
		});
		saveBtn.addEventListener('click', async () => {
			const comment = textarea.value.trim();
			if (this.isRequired && !comment) {
				// Show validation error - don't close
				textarea.addClass('tf-comment-textarea-error');
				return;
			}
			this.close();
			await this.onSubmit(comment);
		});

		// Focus textarea
		textarea.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
