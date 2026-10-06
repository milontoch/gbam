// Small helpers shared by every tool page.

export const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function setStatus(el: HTMLElement, message: string, isError = false) {
	el.textContent = message;
	el.classList.toggle('error', isError);
}

export interface Download {
	url: string;
	filename: string;
	label?: string;
}

// Adds one result row. File names are untrusted, so only textContent is used here, never innerHTML.
export function addResultRow(list: HTMLElement, name: string, detail: string, failed: boolean, download?: Download) {
	const li = document.createElement('li');
	li.className = failed ? 'result failed' : 'result';

	const text = document.createElement('div');
	const title = document.createElement('p');
	title.className = 'result-name';
	title.textContent = name;
	const info = document.createElement('p');
	info.className = 'result-detail';
	info.textContent = detail;
	text.append(title, info);
	li.append(text);

	if (download) {
		const a = document.createElement('a');
		a.className = 'btn';
		a.href = download.url;
		a.download = download.filename;
		a.textContent = download.label ?? 'Download';
		li.append(a);
	}
	list.append(li);
	return li;
}

// Keeps track of blob: URLs so they can be released when results are replaced.
export function urlKeeper() {
	let urls: string[] = [];
	return {
		make(blob: Blob) {
			const url = URL.createObjectURL(blob);
			urls.push(url);
			return url;
		},
		clear() {
			urls.forEach((u) => URL.revokeObjectURL(u));
			urls = [];
		},
	};
}

// Tiny element builder. Text always goes in via textContent, so user input can never become HTML.
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (text !== undefined) el.textContent = text;
	return el;
}

// Browsers use the page title as the default file name in "Save as PDF", so set a good one while printing.
export function printAs(title: string) {
	const original = document.title;
	document.title = title.replace(/[^\w\- ]+/g, '').trim() || original;
	window.addEventListener('afterprint', () => (document.title = original), { once: true });
	window.print();
}

// File names come from the user's own files. Strip path and control characters before reusing them in downloads.
export function safeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 120);
}

export function baseName(filename: string, fallback = 'file') {
	return safeFilename(filename.replace(/\.[^.]+$/, '')).trim() || fallback;
}
