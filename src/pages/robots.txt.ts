import type { APIRoute } from 'astro';

// Built from the `site` setting in astro.config.mjs, so it follows you when you buy a domain.
export const GET: APIRoute = ({ site }) => {
	const body = ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('/sitemap.xml', site).href}`, ''].join('\n');
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
