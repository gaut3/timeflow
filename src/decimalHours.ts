import { Notice } from 'obsidian';
import { TimeFlowSettings } from './settings';
import { Utils } from './utils';
import { t } from './i18n';

const COPIED_CLASS = 'tf-decimal-hours-copied';
const COPIED_MS = 1200;

/**
 * Append " (9.25 hrs)" after the duration text already in `el`, when the
 * showDecimalHours setting is on. Clicking it (or Enter/Space) copies just the
 * number. Display-only: never changes the hours passed in.
 */
export function appendDecimalHours(el: HTMLElement, hours: number, settings: TimeFlowSettings, signed = false): void {
	if (settings.showDecimalHours === false) return;

	const value = Utils.formatDecimalHours(hours, signed);
	// Follow the hour unit the "9h 15m" text beside it uses
	const unit = settings.hourUnit === 't' ? 't' : t('units.decimalHours');
	el.appendText(' ');
	const span = el.createSpan({ cls: 'tf-decimal-hours', text: `(${value} ${unit})` });
	span.setAttribute('role', 'button');
	span.tabIndex = 0;
	span.title = t('ui.copy');
	span.setAttribute('aria-label', `${t('ui.copy')} ${value}`);

	const copy = (e: Event) => {
		// Rows and cards around durations have their own click handlers
		e.preventDefault();
		e.stopPropagation();
		void copyDecimalHours(span, value);
	};
	span.addEventListener('click', copy);
	span.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') copy(e);
	});
}

async function copyDecimalHours(span: HTMLElement, value: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(value);
	} catch {
		new Notice(t('notifications.copyFailed'));
		return;
	}
	new Notice(t('notifications.copiedValue').replace('{value}', value));
	span.classList.add(COPIED_CLASS);
	window.setTimeout(() => span.classList.remove(COPIED_CLASS), COPIED_MS);
}
