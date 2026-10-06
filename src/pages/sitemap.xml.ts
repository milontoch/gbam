import type { APIRoute } from 'astro';
import { liveTools } from '../data/tools';

// Only pages that really exist are listed. Tools marked "soon" have no page, so they are left out.
const staticPages = ['/', '/about', '/privacy', '/terms', '/contact', '/licenses'];

export const GET: APIRoute = ({ site }) => {
	const paths = [...staticPages, ...liveTools().map((t) => `/${t.slug}`)];
	const urls = paths.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n');
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
