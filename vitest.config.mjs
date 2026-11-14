import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		// The obsidian package ships types only; tests run against a stub
		alias: { obsidian: fileURLToPath(new URL('./tests/obsidianStub.ts', import.meta.url)) },
	},
	test: {
		include: ['tests/**/*.test.ts'],
	},
});
