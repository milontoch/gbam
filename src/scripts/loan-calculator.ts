import { calculate, validate, type Mode, type RatePer } from './loan-core';
import { byId, h } from './ui';

const SYMBOLS: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€', GHS: 'GH₵', KES: 'KSh ', ZAR: 'R ' };
const money = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const currencyEl = byId<HTMLSelectElement>('currency');
const amountEl = byId<HTMLInputElement>('amount');
const rateEl = byId<HTMLInputElement>('rate');
const ratePerEl = byId<HTMLSelectElement>('rate-per');
const termEl = byId<HTMLInputElement>('term');
const termUnitEl = byId<HTMLSelectElement>('term-unit');
const modeFlat = byId<HTMLInputElement>('mode-flat');
const result = byId('result');
const scheduleBtn = byId<HTMLButtonElement>('schedule-btn');
const scheduleBox = byId('schedule');

let showSchedule = false;

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

function stat(label: string, value: string, note?: string) {
	const box = h('div', 'stat');
	box.append(h('p', 'stat-label', label), h('p', 'stat-value', value));
	if (note) box.append(h('p', 'stat-note', note));
	return box;
}

function render() {
	result.replaceChildren();
	scheduleBox.replaceChildren();
	scheduleBtn.classList.add('hidden');

	const mode: Mode = modeFlat.checked ? 'flat' : 'reducing';
	const ratePer = ratePerEl.value as RatePer;
	const term = num(termEl.value);
	const months = termUnitEl.value === 'years' ? Math.round(term * 12 * 1e6) / 1e6 : term;
	const input = { principal: num(amountEl.value), rate: num(rateEl.value), ratePer, months, mode };

	const empty = amountEl.value.trim() === '' && rateEl.value.trim() === '' && termEl.value.trim() === '';
	const problem = validate(input);
	if (problem) {
		result.append(h('p', empty ? 'muted' : 'status error', empty ? 'Fill in the three boxes above to see your repayments.' : problem));
		return;
	}

	const sym = SYMBOLS[currencyEl.value] ?? '';
	const fmt = (n: number) => `${sym}${money.format(n)}`;
	const r = calculate(input);

	const grid = h('div', 'stat-grid');
	grid.append(
		stat('You pay every month', fmt(r.payment), `for ${input.months} month${input.months === 1 ? '' : 's'}`),
		stat('Total interest', fmt(r.interest)),
		stat('Total you repay', fmt(r.total), `${fmt(input.principal)} borrowed + ${fmt(r.interest)} interest`),
		stat(
			'Real yearly cost',
			`${r.yearlyRate.toFixed(1)}% a year`,
			mode === 'flat'
				? 'A flat rate is charged on the full amount all the way through, so it costs more than the number suggests. This is the same cost as a reducing-balance rate.'
				: 'The interest rate on what you still owe, added up over a year.',
		),
	);
	result.append(grid);

	scheduleBtn.classList.remove('hidden');
	scheduleBtn.textContent = showSchedule ? 'Hide payment schedule' : 'Show payment schedule';
	if (showSchedule) {
		const table = h('table');
		const head = h('tr');
		for (const t of ['Month', 'Payment', 'Interest', 'Principal', 'Balance left']) head.append(h('th', undefined, t));
		const thead = h('thead');
		thead.append(head);
		const body = h('tbody');
		for (const row of r.schedule) {
			const tr = h('tr');
			tr.append(h('td', undefined, String(row.n)), h('td', undefined, fmt(row.payment)), h('td', undefined, fmt(row.interest)), h('td', undefined, fmt(row.principal)), h('td', undefined, fmt(row.balance)));
			body.append(tr);
		}
		table.append(thead, body);
		const wrap = h('div', 'table-wrap');
		wrap.append(table);
		scheduleBox.append(wrap);
	}
}

scheduleBtn.addEventListener('click', () => {
	showSchedule = !showSchedule;
	render();
});
for (const el of [currencyEl, amountEl, rateEl, ratePerEl, termEl, termUnitEl, modeFlat, byId<HTMLInputElement>('mode-reducing')]) {
	el.addEventListener('input', render);
	el.addEventListener('change', render);
}
render();
