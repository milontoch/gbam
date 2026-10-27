// The single source of truth for every tool.
// The home page grid, the menu and (later) the sitemap all read from this list.
// To add a tool: add an entry here, add src/pages/<slug>.astro and src/scripts/<slug>.ts.

export type Category = 'Image' | 'PDF' | 'Documents' | 'Calculators' | 'WhatsApp';

export interface Tool {
	slug: string; // URL path: /<slug>
	name: string; // short name for menus and cards
	h1: string; // page heading
	summary: string; // one line for cards
	badge: string; // 2 to 3 letters shown on the card tile
	category: Category;
	live: boolean; // false = "coming soon" (not linked, not in sitemap)
	metaTitle: string; // <title>, keep under about 60 characters
	metaDescription: string; // keep under about 155 characters
}

export const tools: Tool[] = [
	{
		slug: 'compress-image',
		name: 'Compress Image',
		h1: 'Compress Image Online',
		summary: 'Make photos smaller for WhatsApp, email and uploads.',
		badge: 'IMG',
		category: 'Image',
		live: true,
		metaTitle: 'Compress Image Online – Free & Private | HandyQuill',
		metaDescription:
			'Reduce JPG, PNG and WebP file size right in your browser. Free, no sign-up, and your photos never leave your device.',
	},
	{
		slug: 'resize-image',
		name: 'Resize Image',
		h1: 'Resize Image Online',
		summary: 'Change photo width and height to exact sizes.',
		badge: 'IMG',
		category: 'Image',
		live: true,
		metaTitle: 'Resize Image Online – Free & Private | HandyQuill',
		metaDescription:
			'Resize photos to any width and height in your browser. Free, no sign-up, and your images never leave your device.',
	},
	{
		slug: 'merge-pdf',
		name: 'Merge PDF',
		h1: 'Merge PDF Files Online',
		summary: 'Combine several PDFs into one file.',
		badge: 'PDF',
		category: 'PDF',
		live: true,
		metaTitle: 'Merge PDF Files Online – Free & Private | HandyQuill',
		metaDescription:
			'Combine multiple PDF files into one in your browser. Free, no sign-up, and your documents never leave your device.',
	},
	{
		slug: 'split-pdf',
		name: 'Split PDF',
		h1: 'Split PDF Online',
		summary: 'Pull pages out of a PDF or cut it into parts.',
		badge: 'PDF',
		category: 'PDF',
		live: true,
		metaTitle: 'Split PDF Online – Free & Private | HandyQuill',
		metaDescription:
			'Extract pages or split a PDF into separate files in your browser. Free, and your documents never leave your device.',
	},
	{
		slug: 'compress-pdf',
		name: 'Compress PDF',
		h1: 'Compress PDF Online',
		summary: 'Shrink scanned PDFs for portals and email.',
		badge: 'PDF',
		category: 'PDF',
		live: true,
		metaTitle: 'Compress PDF Online – Free & Private | HandyQuill',
		metaDescription:
			'Make scanned PDFs smaller for job portals and email, right in your browser. Free, and your files never leave your device.',
	},
	{
		slug: 'invoice-generator',
		name: 'Invoice Generator',
		h1: 'Free Invoice & Receipt Generator',
		summary: 'Create a clean invoice or receipt and save it as PDF.',
		badge: 'INV',
		category: 'Documents',
		live: true,
		metaTitle: 'Free Invoice & Receipt Generator | HandyQuill',
		metaDescription:
			'Create professional invoices and receipts in Naira or any currency and download them as PDF. Free, no sign-up, and nothing is uploaded.',
	},
	{
		slug: 'cv-builder',
		name: 'CV Builder',
		h1: 'Free CV Builder',
		summary: 'Build a neat CV and download it as PDF.',
		badge: 'CV',
		category: 'Documents',
		live: true,
		metaTitle: 'Free CV Builder – Make a CV and Download PDF | HandyQuill',
		metaDescription:
			'Build a clean, professional CV in minutes and download it as PDF. Free, no sign-up, and your details never leave your device.',
	},
	{
		slug: 'passport-photo-maker',
		name: 'Passport Photo Maker',
		h1: 'Passport Photo Maker',
		summary: 'Crop to passport size and print several on one sheet.',
		badge: 'ID',
		category: 'Image',
		live: true,
		metaTitle: 'Passport Photo Maker – Free & Private | HandyQuill',
		metaDescription:
			'Crop your photo to passport size and make a print-ready sheet. Free, and your photo never leaves your device.',
	},
	{
		slug: 'images-to-pdf',
		name: 'Images to PDF',
		h1: 'Images to PDF: Make a PDF From Photos',
		summary: 'Turn photos and scans into one PDF, in the order you choose.',
		badge: 'PDF',
		category: 'PDF',
		live: true,
		metaTitle: 'Images to PDF – JPG, PNG to PDF Maker | HandyQuill',
		metaDescription:
			'Turn JPG, PNG and other photos into one PDF, in the order you choose. Free, no sign-up, and your pictures never leave your device.',
	},
	{
		slug: 'whatsapp-link-generator',
		name: 'WhatsApp Link Generator',
		h1: 'WhatsApp Link Generator (Click to Chat)',
		summary: 'Make a link that opens a WhatsApp chat, with a message ready to send.',
		badge: 'WA',
		category: 'WhatsApp',
		live: true,
		metaTitle: 'WhatsApp Link Generator – Click to Chat | HandyQuill',
		metaDescription:
			'Make a wa.me link that opens a WhatsApp chat with your number and a ready-typed message. Free, no sign-up, and nothing is sent anywhere.',
	},
	{
		slug: 'cgpa-calculator',
		name: 'CGPA Calculator',
		h1: 'CGPA Calculator (5.0 Scale)',
		summary: 'Work out your semester GPA and your updated CGPA.',
		badge: 'GPA',
		category: 'Calculators',
		live: true,
		metaTitle: 'CGPA Calculator (5.0 Scale) – Free & Private | HandyQuill',
		metaDescription:
			'Add your courses and grades to get your semester GPA, your updated CGPA and your degree class on the 5.0 scale. Free, and nothing is sent anywhere.',
	},
	{
		slug: 'loan-calculator',
		name: 'Loan Interest Calculator',
		h1: 'Loan Interest Calculator: Flat vs Reducing Balance',
		summary: 'See your monthly payment, total interest and the real yearly cost.',
		badge: 'LN',
		category: 'Calculators',
		live: true,
		metaTitle: 'Loan Interest Calculator – Flat vs Reducing | HandyQuill',
		metaDescription:
			'Work out the monthly payment, total interest and true yearly cost of a loan, for flat-rate or reducing-balance interest. Free, and nothing is sent anywhere.',
	},
];

export const liveTools = () => tools.filter((t) => t.live);
export const getTool = (slug: string): Tool => {
	const tool = tools.find((t) => t.slug === slug);
	if (!tool) throw new Error(`Unknown tool slug: ${slug}`);
	return tool;
};
