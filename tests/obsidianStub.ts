// Minimal runtime stand-ins for the obsidian API, enough to import plugin modules in tests
export class App {}
export class TFile {}
export class Modal {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class ItemView {}
export class WorkspaceLeaf {}
export class Notice {
	static messages: string[] = [];
	constructor(message?: string) {
		Notice.messages.push(message ?? '');
	}
}
export const normalizePath = (path: string): string => path;
export const addIcon = (): void => {};
export const setIcon = (): void => {};
