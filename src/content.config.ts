import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Every guide is a Markdown file in src/content/guides. The fields below are checked at build time,
// so a typo in the title length, a missing date or a wrong tool name stops the build instead of reaching the site.
const guides = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
	schema: z.object({
		title: z.string().min(15).max(60), // the page title adds " | <site name>", so keep this short
		description: z.string().min(70).max(160),
		tool: z.string().optional(), // slug of the tool this guide is about, for example "compress-image"
		published: z.coerce.date(),
		updated: z.coerce.date(),
		// true = written but not yet reviewed by a person: never built into the live site
		draft: z.boolean().default(false),
		sources: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
	}),
});

export const collections = { guides };
