import { getCollection, type CollectionEntry } from 'astro:content';

export type Guide = CollectionEntry<'guides'>;

// Drafts are visible while you work (npm run dev) or when you build with PUBLIC_SHOW_DRAFTS=1,
// and never in the real site.
const showDrafts = import.meta.env.DEV || import.meta.env.PUBLIC_SHOW_DRAFTS === '1';

export async function getGuides(): Promise<Guide[]> {
	const all = await getCollection('guides', (g) => showDrafts || !g.data.draft);
	return all.sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
}

export const guideUrl = (g: Guide) => `/guides/${g.id}`;

export const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const readingMinutes = (g: Guide) => Math.max(1, Math.round((g.body ?? '').split(/\s+/).filter(Boolean).length / 200));
