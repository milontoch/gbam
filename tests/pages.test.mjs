import { BASE, finish, open, overflowX } from './lib.mjs';

const WIDTHS = [320, 360, 375, 414, 768, 1280]; // small Androids to desktop

export default async function (t) {
	const sitemap = await (await fetch(BASE + '/sitemap.xml')).text();
	const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
	t.check('sitemap lists pages', paths.length >= 13, String(paths.length));
	const robots = await (await fetch(BASE + '/robots.txt')).text();
	t.check('robots.txt points to the sitemap', /Sitemap: https?:\/\/.+\/sitemap\.xml/.test(robots));

	const seen = new Set();
	for (const path of paths) {
		const res = await fetch(BASE + path);
		t.check(`${path}: loads (200)`, res.status === 200, String(res.status));
	}

	// every page at every phone width: no sideways scrolling, one h1, tap targets big enough
	for (const path of paths) {
		for (const width of WIDTHS) {
			const page = await open(t, path, { width });
			t.check(`${path} @${width}px: no sideways scroll`, !(await overflowX(page)));
			if (width === 375) {
				t.check(`${path}: exactly one <h1>`, (await page.locator('h1').count()) === 1);
				const small = await page.evaluate(() =>
					[...document.querySelectorAll('button, select, input:not([type=file]):not([type=range]):not([type=checkbox]):not([type=radio]), .btn')]
						.filter((el) => el.offsetParent !== null && !el.closest('.dropzone'))
						.map((el) => ({ h: el.getBoundingClientRect().height, id: el.id || el.className }))
						.filter((o) => o.h > 0 && o.h < 40)
						.map((o) => `${o.id}:${Math.round(o.h)}`),
				);
				t.check(`${path}: tap targets at least 40px tall`, small.length === 0, small.join(', '));
				// links found on this page must work
				const links = await page.$$eval('a[href^="/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href').split('#')[0]))]);
				for (const l of links) {
					if (seen.has(l)) continue;
					seen.add(l);
					const r = await fetch(BASE + l);
					t.check(`link ${l} works`, r.ok, String(r.status));
				}
			}
			if (width === 375) await finish(t, page, path);
			else await page.context().close();
		}
	}

	// mobile menu works with the keyboard and announces its state
	const page = await open(t, '/');
	const btn = page.locator('#menu-button');
	t.check('menu: starts closed', (await btn.getAttribute('aria-expanded')) === 'false' && !(await page.locator('#site-nav').isVisible()));
	await btn.focus();
	await page.keyboard.press('Enter');
	t.check('menu: opens with keyboard', (await btn.getAttribute('aria-expanded')) === 'true' && (await page.locator('#site-nav').isVisible()));
	await page.keyboard.press('Enter');
	t.check('menu: closes again', !(await page.locator('#site-nav').isVisible()));
	await finish(t, page, 'menu');
}
