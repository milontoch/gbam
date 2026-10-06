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

export function baseName(filename: string, fallback = 'file') {
	return filename.replace(/\.[^.]+$/, '') || fallback;
}
