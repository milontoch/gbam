// @ts-check
import { defineConfig } from 'astro/config';

// Change `site` to your own domain once you buy one.
export default defineConfig({
	site: 'https://gbam.pages.dev',
	// /merge-pdf is built as merge-pdf.html; Cloudflare serves it without ".html".
	build: { format: 'file' },
	trailingSlash: 'never',
});
