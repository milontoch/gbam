// Turns "1-3, 5, 8-10" into zero-based page indexes [0,1,2,4,7,8,9].
// Throws an Error with a plain-English message when the input is wrong.
export function parseRanges(text: string, pageCount: number): number[] {
	const parts = text
		.replace(/[–—]/g, '-') // en/em dash typed by phone keyboards
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	if (parts.length === 0) throw new Error('Enter the pages you want, for example 1-3, 5.');

	const pages: number[] = [];
	for (const part of parts) {
		const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
		if (!m) throw new Error(`"${part}" is not a valid page or range. Use numbers like 1-3, 5.`);
		const first = Number(m[1]);
		const last = m[2] ? Number(m[2]) : first;
		if (first < 1 || last < 1 || first > pageCount || last > pageCount) {
			throw new Error(`Page ${first > pageCount || first < 1 ? first : last} does not exist. This PDF has ${pageCount} pages.`);
		}
		if (first > last) throw new Error(`"${part}": the first page must come before the last page.`);
		for (let p = first; p <= last; p++) pages.push(p - 1);
		if (pages.length > 5000) throw new Error('That is too many pages at once.');
	}
	return pages;
}
