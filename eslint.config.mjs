// Obsidian community-plugin guideline linting.
// Run `npm run lint` before committing to catch the same issues the Obsidian
// community-plugin review flags (the same class cleared in 2.0.1).
// Plugin: https://github.com/obsidianmd/eslint-plugin (eslint-plugin-obsidianmd).
//
// Note: the plugin's `recommended` config applies its type-aware rules globally
// (no `files` filter), so they crash on non-TS files like package.json. We lint
// the TypeScript source (`npm run lint` → `eslint src`) and give it real type
// information via the typescript-eslint project service.
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{ ignores: ["main.js", "dist/**", "esbuild.config.mjs", "version-bump.mjs", "eslint.config.mjs"] },

	// Obsidian's recommended ruleset (TS guideline rules, security, sentence-case, etc.).
	...obsidianmd.configs.recommended,

	// Type-aware parsing for our source. `projectService` auto-resolves tsconfig.json.
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
);
