import { COUNTRIES, MAX_MESSAGE_LENGTH, buildLink, normalizeNumber } from './whatsapp-core';
import { byId, h, setStatus } from './ui';

const countryEl = byId<HTMLSelectElement>('country');
const phoneEl = byId<HTMLInputElement>('phone');
const noNumberEl = byId<HTMLInputElement>('no-number');
const phoneField = byId('phone-fields');
const messageEl = byId<HTMLTextAreaElement>('message');
const counter = byId('message-count');
const status = byId('status');
const output = byId('output');
const linkEl = byId<HTMLInputElement>('link');
const openEl = byId<HTMLAnchorElement>('open-link');
const copyBtn = byId<HTMLButtonElement>('copy-btn');
const copyStatus = byId('copy-status');

COUNTRIES.forEach((c, i) => {
	const opt = h('option', undefined, c.name);
	opt.value = c.dial;
	if (i === 0) opt.selected = true; // Nigeria first
	countryEl.append(opt);
});

function update() {
	counter.textContent = `${messageEl.value.length} of ${MAX_MESSAGE_LENGTH}`;
	copyStatus.textContent = '';
	phoneField.classList.toggle('hidden', noNumberEl.checked);

	let digits = '';
	if (!noNumberEl.checked) {
		if (!phoneEl.value.trim()) {
			// nothing typed yet: no error, just no link
			setStatus(status, '');
			output.classList.add('hidden');
			return;
		}
		const result = normalizeNumber(countryEl.value, phoneEl.value);
		if (!result.ok) {
			setStatus(status, result.error, true);
			output.classList.add('hidden');
			return;
		}
		digits = result.digits;
	}
	if (messageEl.value.length > MAX_MESSAGE_LENGTH) {
		setStatus(status, `Keep the message under ${MAX_MESSAGE_LENGTH} characters so the link still works everywhere.`, true);
		output.classList.add('hidden');
		return;
	}
	if (noNumberEl.checked && !messageEl.value.trim()) {
		setStatus(status, 'Type the message people will share.');
		output.classList.add('hidden');
		return;
	}
	setStatus(status, '');
	const link = buildLink(digits, messageEl.value);
	linkEl.value = link;
	openEl.href = link;
	output.classList.remove('hidden');
}

copyBtn.addEventListener('click', async () => {
	try {
		await navigator.clipboard.writeText(linkEl.value);
		copyStatus.textContent = 'Copied.';
	} catch {
		// Older browsers: select the text so the person can copy it by hand.
		linkEl.select();
		copyStatus.textContent = document.execCommand?.('copy') ? 'Copied.' : 'Press and hold the link, then choose Copy.';
	}
});

for (const el of [countryEl, phoneEl, noNumberEl, messageEl]) {
	el.addEventListener('input', update);
	el.addEventListener('change', update);
}
update();
