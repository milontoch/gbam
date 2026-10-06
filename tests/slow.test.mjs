import { BASE, status } from './lib.mjs';

// Throttling profiles (download speed in kilobits per second, round-trip delay in ms).
const PROFILES = {
	'slow 4G': { kbps: 1600, rtt: 150 },
	'slow 3G': { kbps: 400, rtt: 400 },
};

async function throttledPage(t, profile) {
	const context = await t.browser.newContext({ viewport: { width: 375, height: 800 }, acceptDownloads: true });
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Network.emulateNetworkConditions', {
		offline: false,
		latency: profile.rtt,
		downloadThroughput: (profile.kbps * 1024) / 8,
		uploadThroughput: (profile.kbps * 1024) / 8,
	});
	page.bytes = 0;
	cdp.on('Network.loadingFinished', (e) => (page.bytes += e.encodedDataLength));
	return { page, context };
}

export default async function (t) {
	const pagesToTime = ['/', '/compress-image', '/merge-pdf', '/passport-photo-maker', '/invoice-generator'];
	for (const [name, profile] of Object.entries(PROFILES)) {
		for (const path of pagesToTime) {
			const { page, context } = await throttledPage(t, profile);
			const t0 = Date.now();
			await page.goto(BASE + path, { waitUntil: 'load', timeout: 120000 });
			const secs = (Date.now() - t0) / 1000;
			const kb = Math.round(page.bytes / 1024);
			const limit = name === 'slow 3G' ? 12 : 6;
			t.check(`${name}: ${path} is fully loaded within ${limit}s`, secs <= limit, `${secs.toFixed(1)}s, ${kb} KB over the wire`);
			await context.close();
		}
	}

	// the biggest download: the AI model + engine on a slow 4G connection
	const portraitPath = (await import('node:os')).tmpdir() + '/gbam-test-portrait.jpg';
	const fs = await import('node:fs');
	if (fs.existsSync(portraitPath)) {
		const { page, context } = await throttledPage(t, PROFILES['slow 4G']);
		await page.goto(BASE + '/passport-photo-maker');
		await page.setInputFiles('#file-input', portraitPath);
		await page.waitForSelector('#editor:not(.hidden)');
		page.bytes = 0;
		const t0 = Date.now();
		await page.click('#ai-btn');
		let sawProgress = false;
		while (Date.now() - t0 < 240000) {
			const txt = await page.textContent('#ai-status');
			if (/Downloading/.test(txt) && (await page.isVisible('#ai-progress'))) sawProgress = true;
			if (/^Done|could not|cannot|stopped/i.test(txt)) break;
			await page.waitForTimeout(500);
		}
		const secs = (Date.now() - t0) / 1000;
		t.check('slow 4G: AI background removal completes', /^Done/.test(await page.textContent('#ai-status')), await page.textContent('#ai-status'));
		t.check('slow 4G: the download shows a progress bar', sawProgress);
		t.info(`AI first use on slow 4G (1.6 Mbps): ${secs.toFixed(0)}s from pressing the button to done (about 9 MB to download, plus processing)`);
		await context.close();
	}
	void status;
}
