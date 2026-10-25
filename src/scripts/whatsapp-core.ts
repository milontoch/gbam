// Phone-number and link logic for the WhatsApp link generator. No browser code here, so it can be tested directly.
// WhatsApp's own format: https://wa.me/<full number in international format>?text=<url-encoded message>
// The number has no plus sign, zeroes, brackets or dashes; without a number, https://wa.me/?text=... lets the sender pick a contact.

export interface Country {
	name: string;
	dial: string; // country calling code, digits only
}

export const COUNTRIES: Country[] = [
	{ name: 'Nigeria (+234)', dial: '234' },
	{ name: 'Ghana (+233)', dial: '233' },
	{ name: 'Kenya (+254)', dial: '254' },
	{ name: 'South Africa (+27)', dial: '27' },
	{ name: 'Cameroon (+237)', dial: '237' },
	{ name: 'Benin (+229)', dial: '229' },
	{ name: 'Togo (+228)', dial: '228' },
	{ name: 'Senegal (+221)', dial: '221' },
	{ name: "Côte d'Ivoire (+225)", dial: '225' },
	{ name: 'Uganda (+256)', dial: '256' },
	{ name: 'Tanzania (+255)', dial: '255' },
	{ name: 'Egypt (+20)', dial: '20' },
	{ name: 'United Kingdom (+44)', dial: '44' },
	{ name: 'Ireland (+353)', dial: '353' },
	{ name: 'United States or Canada (+1)', dial: '1' },
	{ name: 'United Arab Emirates (+971)', dial: '971' },
	{ name: 'India (+91)', dial: '91' },
	{ name: 'China (+86)', dial: '86' },
	{ name: 'Germany (+49)', dial: '49' },
	{ name: 'France (+33)', dial: '33' },
	{ name: 'Australia (+61)', dial: '61' },
	{ name: 'Other: I will type the full number with the country code', dial: '' },
];

export const MAX_MESSAGE_LENGTH = 1000;

export type NumberResult = { ok: true; digits: string } | { ok: false; error: string };

export function normalizeNumber(dial: string, raw: string): NumberResult {
	const text = raw.trim();
	if (!text) return { ok: false, error: 'Enter the phone number.' };
	if (/[a-z]/i.test(text)) return { ok: false, error: 'A phone number can only contain digits. Remove the letters.' };

	let digits = text.replace(/\D/g, ''); // spaces, dashes, brackets and plus signs go
	if (!digits) return { ok: false, error: 'Enter the phone number.' };

	const international = text.startsWith('+') || digits.startsWith('00');
	if (international) {
		digits = digits.replace(/^0+/, ''); // "00234..." is the old way of writing "+234..."
	} else if (dial) {
		const local = digits.replace(/^0+/, ''); // 0801... -> 801...
		// Someone who typed the whole number with the country code, without a plus, keeps it as it is.
		const typedWhole = digits.startsWith(dial) && digits.length >= dial.length + 7;
		digits = typedWhole ? digits : dial + local;
	} else {
		digits = digits.replace(/^0+/, '');
	}

	if (digits.startsWith('234') && digits.length !== 13) {
		return { ok: false, error: 'A Nigerian mobile number has 10 digits after 234, for example 0801 234 5678. Check for a missing or extra digit.' };
	}
	if (digits.length < 8 || digits.length > 15) {
		return { ok: false, error: 'A phone number with its country code has between 8 and 15 digits. Check for a missing or extra digit.' };
	}
	return { ok: true, digits };
}

export function buildLink(digits: string, message: string): string {
	const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
	const text = message.trim();
	return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
