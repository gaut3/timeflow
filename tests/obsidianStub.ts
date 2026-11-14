// Minimal runtime stand-ins for the obsidian API, enough to import plugin modules in tests
export class App {}
export class TFile {}
export class Modal {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class ItemView {}
export class WorkspaceLeaf {}
export class Notice {}
export const normalizePath = (path: string): string => path;
export const addIcon = (): void => {};
export const setIcon = (): void => {};
