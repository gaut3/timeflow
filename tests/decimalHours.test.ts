// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Notice } from 'obsidian';
import { Utils } from '../src/utils';
import { appendDecimalHours } from '../src/decimalHours';
import { DEFAULT_SETTINGS, TimeFlowSettings } from '../src/settings';
import { setLanguage } from '../src/i18n';

// Obsidian augments HTMLElement with these helpers; happy-dom does not
type ObsidianEl = HTMLElement & {
	createSpan: (o?: { cls?: string; text?: string }) => HTMLSpanElement;
	appendText: (text: string) => void;
};
const proto = HTMLElement.prototype as ObsidianEl;
proto.createSpan = function (this: HTMLElement, o = {}) {
	const span = this.ownerDocument.createElement('span');
	if (o.cls) span.className = o.cls;
	if (o.text) span.textContent = o.text;
	this.appendChild(span);
	return span;
};
proto.appendText = function (this: HTMLElement, text: string) {
	this.appendChild(this.ownerDocument.createTextNode(text));
};

const hm = (h: number, m: number) => h + m / 60;

// An English user: the hour unit follows the language ('h') until chosen explicitly
function settings(overrides: Partial<TimeFlowSettings> = {}): TimeFlowSettings {
	return { ...structuredClone(DEFAULT_SETTINGS), language: 'en', hourUnit: 'h', ...overrides };
}

function durationEl(text: string): HTMLElement {
	const el = document.createElement('span');
	el.textContent = text;
	document.body.appendChild(el);
	return el;
}

describe('Utils.formatDecimalHours', () => {
	it.each([
		[hm(9, 15), false, '9.25'],
		[hm(8, 14), false, '8.23'],
		[7.4, false, '7.40'],
		[hm(1, 21), true, '+1.35'],
		[-0.75, true, '-0.75'],
		[-0.75, false, '-0.75'],
		[0, false, '0.00'],
		[0, true, '0.00'],
	])('%d (signed: %s) -> %s', (hours, signed, expected) => {
		expect(Utils.formatDecimalHours(hours, signed)).toBe(expected);
	});

	it('always has exactly two decimals', () => {
		for (const hours of [1, 2.5, 10, 0.1, 37.5]) {
			expect(Utils.formatDecimalHours(hours)).toMatch(/^\d+\.\d{2}$/);
		}
	});

	it('matches the minutes formatHoursToHM shows, including rounding to the hour', () => {
		for (let minutes = 0; minutes <= 24 * 60; minutes++) {
			const hours = minutes / 60 + 0.004; // sub-minute noise from calculations
			const [, h, m] = Utils.formatHoursToHM(hours).match(/^(\d+)h (\d+)m$/)!;
			expect(Utils.formatDecimalHours(hours)).toBe(((+h * 60 + +m) / 60).toFixed(2));
		}
		expect(Utils.formatHoursToHM(hm(0, 59.6))).toBe('1h 00m');
		expect(Utils.formatDecimalHours(hm(0, 59.6))).toBe('1.00');
	});

	it('drops the sign when the value rounds to zero minutes', () => {
		expect(Utils.formatDecimalHours(-0.001, true)).toBe('0.00');
		expect(Utils.formatDecimalHours(0.001, true)).toBe('0.00');
	});
});

describe('appendDecimalHours', () => {
	let writeText: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		setLanguage('en');
		Notice.messages = [];
		writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
	});

	afterEach(() => {
		vi.useRealTimers();
		document.body.innerHTML = '';
	});

	it('appends the decimal value after the existing text', () => {
		const el = durationEl('9h 15m');
		appendDecimalHours(el, hm(9, 15), settings());
		expect(el.textContent).toBe('9h 15m (9.25 hrs)');
	});

	it('keeps the sign on balances', () => {
		const pos = durationEl('+1h 21m');
		appendDecimalHours(pos, hm(1, 21), settings(), true);
		expect(pos.textContent).toBe('+1h 21m (+1.35 hrs)');

		const neg = durationEl('−0h 45m');
		appendDecimalHours(neg, -0.75, settings(), true);
		expect(neg.textContent).toBe('−0h 45m (-0.75 hrs)');
	});

	it('uses the same hour unit as the hours-and-minutes text', () => {
		setLanguage('nb');
		const nbT = durationEl('7t 24m');
		appendDecimalHours(nbT, 7.4, settings({ language: 'nb', hourUnit: 't' }));
		expect(nbT.textContent).toBe('7t 24m (7.40 t)');

		// Norwegian UI with 'h' chosen explicitly
		const nbH = durationEl('7h 30m');
		appendDecimalHours(nbH, 7.5, settings({ language: 'nb', hourUnit: 'h' }));
		expect(nbH.textContent).toBe('7h 30m (7.50 h)');

		// English UI with 't' chosen explicitly
		setLanguage('en');
		const enT = durationEl('7t 30m');
		appendDecimalHours(enT, 7.5, settings({ hourUnit: 't' }));
		expect(enT.textContent).toBe('7t 30m (7.50 t)');
	});

	it('renders nothing, and no copy control, when disabled', () => {
		const el = durationEl('9h 15m');
		appendDecimalHours(el, hm(9, 15), settings({ showDecimalHours: false }));
		expect(el.textContent).toBe('9h 15m');
		expect(el.querySelector('.tf-decimal-hours')).toBeNull();
	});

	it('is a keyboard-focusable button with an accessible label', () => {
		const el = durationEl('9h 15m');
		appendDecimalHours(el, hm(9, 15), settings());
		const span = el.querySelector<HTMLElement>('.tf-decimal-hours')!;
		expect(span.getAttribute('role')).toBe('button');
		expect(span.tabIndex).toBe(0);
		expect(span.getAttribute('aria-label')).toBe('Copy 9.25');
	});

	it('copies only the number on click, without triggering parent click handlers', async () => {
		vi.useFakeTimers();
		const el = durationEl('+1h 21m');
		const parentClick = vi.fn();
		el.addEventListener('click', parentClick);
		appendDecimalHours(el, hm(1, 21), settings(), true);
		const span = el.querySelector<HTMLElement>('.tf-decimal-hours')!;

		span.click();
		await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('+1.35'));
		expect(parentClick).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(span.classList.contains('tf-decimal-hours-copied')).toBe(true));
		expect(Notice.messages).toEqual(['Copied +1.35']);

		vi.advanceTimersByTime(1200);
		expect(span.classList.contains('tf-decimal-hours-copied')).toBe(false);
	});

	it('copies with Enter or Space, but not other keys', async () => {
		const el = durationEl('7h 24m');
		appendDecimalHours(el, 7.4, settings());
		const span = el.querySelector<HTMLElement>('.tf-decimal-hours')!;

		span.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		expect(writeText).not.toHaveBeenCalled();

		span.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		span.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
		expect(writeText).toHaveBeenCalledWith('7.40');
	});

	it('reports a failed copy without the copied state', async () => {
		writeText.mockRejectedValue(new Error('denied'));
		const el = durationEl('9h 15m');
		appendDecimalHours(el, hm(9, 15), settings());
		const span = el.querySelector<HTMLElement>('.tf-decimal-hours')!;

		span.click();
		await vi.waitFor(() => expect(Notice.messages).toEqual(['Could not copy to the clipboard']));
		expect(span.classList.contains('tf-decimal-hours-copied')).toBe(false);
	});
});

describe('showDecimalHours setting', () => {
	it('is on by default, including for existing users without the key', () => {
		expect(DEFAULT_SETTINGS.showDecimalHours).toBe(true);
		// Same merge as TimeFlowPlugin.loadSettings
		const existing = { language: 'en', hideEmptyStats: true } as Partial<TimeFlowSettings>;
		expect(Object.assign(structuredClone(DEFAULT_SETTINGS), existing).showDecimalHours).toBe(true);
	});

	it('keeps an explicit opt-out', () => {
		const optedOut = { showDecimalHours: false } as Partial<TimeFlowSettings>;
		expect(Object.assign(structuredClone(DEFAULT_SETTINGS), optedOut).showDecimalHours).toBe(false);
	});
});
