import { mountRepeater } from './repeater';
import { byId, h, printAs, setStatus, urlKeeper } from './ui';

type Item = { desc: string; qty: string; price: string };

const SYMBOLS: Record<string, string> = {
	NGN: '₦',
	USD: '$',
	GBP: '£',
	EUR: '€',
	GHS: 'GH₵',
	KES: 'KSh ',
	ZAR: 'R ',
};

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const MAX_ITEMS = 30;

const f = {
	type: byId<HTMLSelectElement>('type'),
	bizName: byId<HTMLInputElement>('biz-name'),
	bizDetails: byId<HTMLTextAreaElement>('biz-details'),
	logo: byId<HTMLInputElement>('logo'),
	clearLogo: byId<HTMLButtonElement>('clear-logo'),
	clientName: byId<HTMLInputElement>('client-name'),
	clientDetails: byId<HTMLTextAreaElement>('client-details'),
	number: byId<HTMLInputElement>('number'),
	date: byId<HTMLInputElement>('date'),
	due: byId<HTMLInputElement>('due'),
	dueField: byId('due-field'),
	currency: byId<HTMLSelectElement>('currency'),
	discount: byId<HTMLInputElement>('discount'),
	tax: byId<HTMLInputElement>('tax'),
	vat: byId<HTMLButtonElement>('vat-btn'),
	notes: byId<HTMLTextAreaElement>('notes'),
};
const doc = byId('doc');
const printBtn = byId<HTMLButtonElement>('print-btn');
const status = byId('status');

const items: Item[] = [{ desc: '', qty: '1', price: '' }];
const logoUrls = urlKeeper();
let logoUrl = '';

// ---------- helpers ----------
const money = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Turns typed text into a safe, non-negative number. Anything odd becomes 0.
function num(text: string, max = 1e12): number {
	const n = Number(String(text).replace(/,/g, ''));
	return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
}

function prettyDate(value: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
	const [y, m, d] = value.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function today(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function labelled(label: string, value: string): HTMLElement | null {
	if (!value) return null;
	const p = h('p');
	p.append(h('span', 'doc-muted', `${label}: `), document.createTextNode(value));
	return p;
}

// ---------- the document ----------
function render() {
	const isReceipt = f.type.value === 'receipt';
	const symbol = SYMBOLS[f.currency.value] ?? '';
	const fmt = (n: number) => `${symbol}${money.format(n)}`;
	f.dueField.classList.toggle('hidden', isReceipt);

	doc.replaceChildren();

	// top: business on the left, document details on the right
	const top = h('div', 'doc-top');
	const left = h('div');
	if (logoUrl) {
		const img = h('img', 'doc-logo');
		img.src = logoUrl;
		img.alt = '';
		left.append(img);
	}
	if (f.bizName.value) left.append(h('p', 'doc-biz', f.bizName.value));
	if (f.bizDetails.value) left.append(h('p', 'doc-pre doc-muted', f.bizDetails.value));

	const right = h('div', 'doc-meta');
	right.append(h('p', 'doc-title', isReceipt ? 'RECEIPT' : 'INVOICE'));
	for (const line of [
		labelled('No', f.number.value),
		labelled('Date', prettyDate(f.date.value)),
		isReceipt ? null : labelled('Due', prettyDate(f.due.value)),
	]) {
		if (line) right.append(line);
	}
	if (isReceipt) right.append(h('p', 'doc-stamp', 'PAID'));
	top.append(left, right);
	doc.append(top);

	// bill to
	if (f.clientName.value || f.clientDetails.value) {
		const bill = h('div');
		bill.append(h('p', 'doc-label', isReceipt ? 'Received from' : 'Bill to'));
		if (f.clientName.value) bill.append(h('p', 'doc-biz', f.clientName.value));
		if (f.clientDetails.value) bill.append(h('p', 'doc-pre doc-muted', f.clientDetails.value));
		doc.append(bill);
	}

	// items
	const table = h('table');
	const headRow = h('tr');
	headRow.append(h('th', undefined, 'Item'));
	for (const [text, cls] of [['Qty', 'col-qty num'], ['Price', 'col-price num'], ['Amount', 'col-amount num']] as const) {
		headRow.append(h('th', cls, text));
	}
	const thead = h('thead');
	thead.append(headRow);
	const tbody = h('tbody');

	let subtotal = 0;
	for (const item of items) {
		if (!item.desc && !item.price) continue;
		const qty = num(item.qty, 1e9);
		const price = num(item.price);
		const line = round2(qty * price);
		subtotal += line;
		const tr = h('tr');
		tr.append(h('td', 'doc-pre', item.desc), h('td', 'num', String(qty)), h('td', 'num', fmt(price)), h('td', 'num', fmt(line)));
		tbody.append(tr);
	}
	table.append(thead, tbody);
	doc.append(table);

	// totals
	const discountPct = Math.min(num(f.discount.value), 100);
	const taxPct = Math.min(num(f.tax.value), 100);
	const discount = round2((subtotal * discountPct) / 100);
	const taxable = round2(subtotal - discount);
	const tax = round2((taxable * taxPct) / 100);
	const total = round2(taxable + tax);

	const totals = h('div', 'doc-totals');
	const row = (label: string, value: string, cls?: string) => {
		const d = h('div', cls);
		d.append(h('span', undefined, label), h('span', undefined, value));
		totals.append(d);
	};
	row('Subtotal', fmt(subtotal));
	if (discount > 0) row(`Discount (${discountPct}%)`, `-${fmt(discount)}`);
	if (tax > 0) row(`Tax (${taxPct}%)`, fmt(tax));
	row(isReceipt ? 'Total paid' : 'Total due', fmt(total), 'grand');
	doc.append(totals);

	if (f.notes.value) {
		const notes = h('div', 'doc-notes');
		notes.append(h('p', 'doc-label', 'Notes and payment details'), h('p', 'doc-pre', f.notes.value));
		doc.append(notes);
	}
}

// ---------- logo (kept in memory only) ----------
f.logo.addEventListener('change', async () => {
	const file = f.logo.files?.[0];
	f.logo.value = '';
	if (!file) return;
	if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_LOGO_BYTES) {
		return setStatus(status, 'Logo must be a PNG, JPG or WebP image under 10 MB.', true);
	}
	try {
		const bmp = await createImageBitmap(file);
		const scale = Math.min(1, 400 / bmp.width, 200 / bmp.height); // small logo = small memory
		const c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(bmp.width * scale));
		c.height = Math.max(1, Math.round(bmp.height * scale));
		c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
		bmp.close();
		const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
		if (!blob) throw new Error('no blob');
		logoUrls.clear();
		logoUrl = logoUrls.make(blob);
		f.clearLogo.classList.remove('hidden');
		setStatus(status, '');
		render();
	} catch {
		setStatus(status, 'That logo could not be read. Try a different image.', true);
	}
});

f.clearLogo.addEventListener('click', () => {
	logoUrls.clear();
	logoUrl = '';
	f.clearLogo.classList.add('hidden');
	render();
});

// ---------- wiring ----------
f.vat.addEventListener('click', () => {
	f.tax.value = '7.5';
	render();
});

for (const el of [f.type, f.bizName, f.bizDetails, f.clientName, f.clientDetails, f.number, f.date, f.due, f.currency, f.discount, f.tax, f.notes]) {
	el.addEventListener('input', render);
	el.addEventListener('change', render);
}

mountRepeater<Item>({
	container: byId('items'),
	addBtn: byId<HTMLButtonElement>('add-item'),
	items,
	blank: () => ({ desc: '', qty: '1', price: '' }),
	fields: [
		{ key: 'desc', label: 'Description', wide: true, placeholder: 'e.g. Logo design' },
		{ key: 'qty', label: 'Quantity', kind: 'number' },
		{ key: 'price', label: 'Unit price', kind: 'number' },
	],
	itemLabel: 'Item',
	max: MAX_ITEMS,
	min: 1,
	onChange: render,
});

printBtn.addEventListener('click', () => {
	const prefix = f.type.value === 'receipt' ? 'Receipt' : 'Invoice';
	printAs(`${prefix} ${f.number.value}`.trim());
});

f.date.value = today();
render();
