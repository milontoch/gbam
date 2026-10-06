// Runs the browser tests against the built site.
//   npm run test:e2e                 everything except the slow-network test
//   npm run test:e2e -- --only=pdf   one suite (pages, images, pdf, docs, passport, security, slow)
//   npm run test:e2e -- --slow       also run the slow-network suite (adds a minute or two)
import { spawn } from 'node:child_process';
import { launch, Report, BASE } from './lib.mjs';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const withSlow = args.includes('--slow') || only === 'slow';
const suites = ['pages', 'images', 'pdf', 'docs', 'passport', 'security', ...(withSlow ? ['slow'] : [])].filter((s) => !only || s === only);

const port = new URL(BASE).port || '4399';
const server = spawn('npx', ['astro', 'preview', '--port', port], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
	for (let i = 0; i < 40; i++) {
		try {
			if ((await fetch(BASE + '/')).ok) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error('The preview server did not start. Did you run "npm run build" first?');
}

const t = new Report();
try {
	await waitForServer();
	t.browser = await launch();
	for (const name of suites) {
		console.log(`\n=== ${name} ===`);
		const mod = await import(`./${name}.test.mjs`);
		await mod.default(t);
	}
	await t.browser.close();
} catch (err) {
	console.error('Test run crashed:', err);
	t.failed++;
	t.failures.push('crash: ' + err.message);
}
stop();
console.log(`\n${t.passed} passed, ${t.failed} failed`);
if (t.failed) console.log('Failures:\n - ' + t.failures.join('\n - '));
process.exit(t.failed ? 1 : 0);
