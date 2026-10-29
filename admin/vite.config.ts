import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The admin app: a small app of its own, apart from the shopping app, on its own address (port 5175 on this PC).
// Like the shopping app it is only a face for the Flask server, so every /api call is passed straight through.
// It shares the shopping app's buttons, cards and colours (`#lib/...`, from ../src/lib), but none of its pages.
declare const process: { env: Record<string, string | undefined> };
const flask = process.env.DEFAKETIVE_API ?? 'http://127.0.0.1:5000';
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
	root: here,
	publicDir: false,
	// Its own cache: sharing the shopping app's (node_modules/.vite) makes the two developer servers undo each other.
	cacheDir: '../node_modules/.vite-admin',
	plugins: [
		tailwindcss(),
		svelte({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			}
		})
	],
	build: {
		outDir: 'build',
		emptyOutDir: true
	},
	server: {
		port: 5175,
		strictPort: true,
		proxy: { '/api': flask }
	},
	preview: {
		port: 5175,
		strictPort: true,
		proxy: { '/api': flask }
	}
});
