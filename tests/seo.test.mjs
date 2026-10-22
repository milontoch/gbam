// SEO safety net. It records what search engines read on every page (address, title, description,
// heading, canonical link, structured data) in tests/seo-baseline.json and fails when something changes
// by accident, for example during a redesign. If a change is intended, review it and run:
//   npm run seo:baseline
import fs from 'node:fs';
import { BASE } from './lib.mjs';

export const BASELINE = 'tests/seo-baseline.json';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const pick = (html, re) => decode((html.match(re) || [])[1] || '').trim();

export async function snapshot() {
	const sitemap = await (await fetch(BASE + '/sitemap.xml')).text();
	const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]).sort();
	const pages = {};
	for (const path of paths) {
		const res = await fetch(BASE + path);
		const html = await res.text();
		const canonical = pick(html, /<link rel="canonical" href="([^"]*)"/);
		const types = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].flatMap((m) => [...m[1].matchAll(/"@type":"(\w+)"/g)].map((t) => t[1]));
		pages[path] = {
			status: res.status,
			title: pick(html, /<title>([^<]*)<\/title>/),
			description: pick(html, /<meta name="description" content="([^"]*)"/),
			h1: pick(html, /<h1[^>]*>(.*?)<\/h1>/s).replace(/<[^>]+>/g, ''),
			canonicalPath: canonical.replace(/^https?:\/\/[^/]+/, '') || '(missing)',
			noindex: /<meta name="robots" content="[^"]*noindex/.test(html),
			structuredData: [...new Set(types)].sort(),
			internalLinks: [...new Set([...html.matchAll(/<a [^>]*href="(\/[^"#?]*)"/g)].map((m) => m[1]))].length,
		};
	}
	return { paths, pages };
}

export default async function (t) {
	const now = await snapshot();
	const live = process.env.BASE_URL ? ' (live site)' : '';

	// 1) rules that must always hold, whatever the design
	for (const path of now.paths) {
		const p = now.pages[path];
		t.check(`seo ${path}: answers 200`, p.status === 200, String(p.status));
		t.check(`seo ${path}: canonical points to itself`, p.canonicalPath === (path === '/' ? '/' : path), p.canonicalPath);
		t.check(`seo ${path}: not marked noindex`, !p.noindex);
		t.check(`seo ${path}: has a title of sensible length`, p.title.length >= 10 && p.title.length <= 70, `${p.title.length} chars`);
		t.check(`seo ${path}: has a description of sensible length`, p.description.length >= 50 && p.description.length <= 170, `${p.description.length} chars`);
		t.check(`seo ${path}: has a heading`, p.h1.length > 0);
	}
	const titles = now.paths.map((p) => now.pages[p].title);
	t.check('seo: every page has a different title', new Set(titles).size === titles.length);

	// 2) compare with the recorded baseline
	if (!fs.existsSync(BASELINE)) {
		t.check('seo: a baseline exists (run: npm run seo:baseline)', false);
		return;
	}
	const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
	const removed = base.paths.filter((p) => !now.paths.includes(p));
	const added = now.paths.filter((p) => !base.paths.includes(p));
	t.check(`seo: no page address was removed or renamed${live}`, removed.length === 0, removed.join(', '));
	t.check('seo: no page address was added without updating the baseline', added.length === 0, added.join(', '));
	for (const path of base.paths.filter((p) => now.pages[p])) {
		const a = base.pages[path];
		const b = now.pages[path];
		for (const key of ['title', 'description', 'h1', 'canonicalPath', 'noindex']) {
			t.check(`seo ${path}: ${key} unchanged`, JSON.stringify(a[key]) === JSON.stringify(b[key]), `was "${a[key]}" now "${b[key]}"`);
		}
		t.check(`seo ${path}: structured data unchanged`, JSON.stringify(a.structuredData) === JSON.stringify(b.structuredData), `was ${a.structuredData} now ${b.structuredData}`);
		t.check(`seo ${path}: internal links not dropped by more than a few`, b.internalLinks >= a.internalLinks - 3, `was ${a.internalLinks} now ${b.internalLinks}`);
	}
}
