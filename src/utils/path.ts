// With build.format = 'file', Astro reports paths like "/merge-pdf.html" or "/index.html"
// while building. Turn them into the clean public URL path: "/merge-pdf" or "/".
export function cleanPath(pathname: string): string {
	const p = pathname.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
	return p === '' ? '/' : p.length > 1 ? p.replace(/\/$/, '') : p;
}
