// Records what search engines currently see, as the reference for tests/seo.test.mjs.
// Use it ONLY after you have checked that the changes are intended:  npm run seo:baseline
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { BASE } from './lib.mjs';
import { BASELINE, snapshot } from './seo.test.mjs';

const port = new URL(BASE).port || '4399';
const server = process.env.BASE_URL ? null : spawn('npx', ['astro', 'preview', '--port', port], { stdio: 'ignore' });
try {
	for (let i = 0; i < 40; i++) {
		try {
			if ((await fetch(BASE + '/')).ok) break;
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}
	const snap = await snapshot();
	fs.writeFileSync(BASELINE, JSON.stringify(snap, null, 2) + '\n');
	console.log(`Saved ${snap.paths.length} pages to ${BASELINE}`);
} finally {
	server?.kill();
}
