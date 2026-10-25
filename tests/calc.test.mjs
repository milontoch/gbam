// WhatsApp link generator, CGPA calculator and loan calculator.
import { calculate, monthlyCostRate, validate } from '../src/scripts/loan-core.ts';
import { degreeClass, round2, semesterResult, updatedCgpa } from '../src/scripts/cgpa-core.ts';
import { buildLink, normalizeNumber } from '../src/scripts/whatsapp-core.ts';
import { finish, open, overflowX } from './lib.mjs';

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const text = (page, sel) => page.textContent(sel);

export default async function (t) {
	// ---------------- the maths, checked against answers worked out independently ----------------
	let r = calculate({ principal: 1_000_000, rate: 24, ratePer: 'year', months: 12, mode: 'reducing' });
	t.check('loan maths: 1,000,000 at 24% a year for 12 months is 94,559.60 a month', near(r.payment, 94559.6, 0.01), r.payment.toFixed(2));
	t.check('loan maths: the schedule ends at exactly zero and principal adds up', r.schedule.at(-1).balance === 0 && near(r.schedule.reduce((s, x) => s + x.principal, 0), 1_000_000, 0.01));
	t.check('loan maths: a reducing-balance loan costs exactly the rate typed', near(r.yearlyRate, 24, 1e-6));
	r = calculate({ principal: 1_000_000, rate: 5, ratePer: 'month', months: 12, mode: 'flat' });
	t.check('loan maths: 5% a month flat for 12 months = 600,000 interest, 133,333.33 a month', near(r.interest, 600000, 0.001) && near(r.payment, 133333.3333, 0.01));
	const presentValue = (i, p, n) => (p * (1 - Math.pow(1 + i, -n))) / i;
	t.check('loan maths: payments discounted at the reported real cost equal the amount borrowed', near(presentValue(r.yearlyRate / 1200, r.payment, 12), 1_000_000, 0.5), `${r.yearlyRate.toFixed(1)}%`);
	r = calculate({ principal: 1_000_000, rate: 10, ratePer: 'year', months: 24, mode: 'flat' });
	t.check('loan maths: 10% a year flat for 2 years is about 18% a year in real terms', r.yearlyRate > 17 && r.yearlyRate < 20, r.yearlyRate.toFixed(2));
	r = calculate({ principal: 120000, rate: 0, ratePer: 'year', months: 12, mode: 'reducing' });
	t.check('loan maths: 0% interest means 10,000 a month and nothing extra', near(r.payment, 10000, 1e-9) && r.interest === 0 && r.yearlyRate === 0);
	r = calculate({ principal: 5e11, rate: 20, ratePer: 'year', months: 600, mode: 'reducing' });
	t.check('loan maths: 600 months on 500 billion stays finite', Number.isFinite(r.payment) && r.schedule.length === 600);
	t.check('loan maths: bad inputs are refused', [{ principal: 0, rate: 5 }, { principal: 1000, rate: -1 }, { principal: 1000, rate: 5, months: 0 }, { principal: 1000, rate: 5, months: 601 }, { principal: 1000, rate: 5, months: 10.5 }, { principal: NaN, rate: 5 }, { principal: 1000, rate: 1500 }].every((x) => validate({ ratePer: 'year', months: 12, mode: 'flat', ...x }) !== null));
	t.check('loan maths: the real-cost solver handles a lender who charges nothing extra', monthlyCostRate(1000, 1000, 1) === 0);

	const sem = semesterResult([{ units: 3, grade: 'A' }, { units: 2, grade: 'B' }, { units: 4, grade: 'C' }, { units: 1, grade: 'F' }]);
	t.check('CGPA maths: (15+8+12+0) / 10 units = 3.50', sem.units === 10 && sem.points === 35 && round2(sem.gpa) === 3.5);
	t.check('CGPA maths: 3.80 over 60 units plus this semester = 3.76', round2(updatedCgpa(3.8, 60, sem)) === 3.76);
	t.check('CGPA maths: the example on the page (3-unit A + 2-unit C) is 4.20', round2(semesterResult([{ units: 3, grade: 'A' }, { units: 2, grade: 'C' }]).gpa) === 4.2);
	t.check('CGPA maths: every class boundary', [[5, 'First Class'], [4.5, 'First Class'], [4.49, 'Second Class Upper (2:1)'], [3.5, 'Second Class Upper (2:1)'], [3.49, 'Second Class Lower (2:2)'], [2.4, 'Second Class Lower (2:2)'], [2.39, 'Third Class'], [1.5, 'Third Class'], [1.49, 'Pass'], [1, 'Pass']].every(([c, e]) => degreeClass(c) === e) && degreeClass(0.99).startsWith('Below'));
	t.check('CGPA maths: rows with no units or a bad grade are ignored', semesterResult([{ units: 0, grade: 'A' }, { units: 3, grade: 'Z' }, { units: -2, grade: 'B' }]).gpa === null);

	const num = (dial, s) => {
		const x = normalizeNumber(dial, s);
		return x.ok ? x.digits : 'ERR';
	};
	t.check('WhatsApp number: Nigerian numbers in every common style', ['0801 234 5678', '8012345678', '+234-801-234-5678', '2348012345678', '00234 801 234 5678', '(0801) 234-5678'].every((s) => num('234', s) === '2348012345678'));
	t.check('WhatsApp number: a Nigerian number with a missing or extra digit is refused', num('234', '080123456') === 'ERR' && num('234', '080123456789') === 'ERR');
	t.check('WhatsApp number: letters and blanks are refused', num('234', '0801abc5678') === 'ERR' && num('234', '   ') === 'ERR');
	t.check('WhatsApp number: UK, US and "other country" numbers', num('44', '07911 123456') === '447911123456' && num('1', '(555) 123-4567') === '15551234567' && num('', '+49 151 23456789') === '4915123456789' && num('', '+1234567890123456') === 'ERR');
	t.check('WhatsApp link: message is URL-encoded the way WhatsApp expects', buildLink('2348012345678', "Hello & welcome! I'm interested.\nPrice?") === "https://wa.me/2348012345678?text=Hello%20%26%20welcome!%20I'm%20interested.%0APrice%3F");
	t.check('WhatsApp link: no message, no number, and emoji', buildLink('2348012345678', ' ') === 'https://wa.me/2348012345678' && buildLink('', 'Join us') === 'https://wa.me/?text=Join%20us' && buildLink('1', 'Café 😀') === 'https://wa.me/1?text=Caf%C3%A9%20%F0%9F%98%80');

	// ---------------- WhatsApp page ----------------
	{
		const page = await open(t, '/whatsapp-link-generator');
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
		t.check('whatsapp page: starts on Nigeria and shows no link yet', (await page.inputValue('#country')) === '234' && (await page.isHidden('#output')));
		await page.fill('#phone', '0801 234 5678');
		await page.fill('#message', "Hello & welcome! I'm interested.");
		const link = await page.inputValue('#link');
		t.check('whatsapp page: builds the right link', link === "https://wa.me/2348012345678?text=Hello%20%26%20welcome!%20I'm%20interested.", link);
		t.check('whatsapp page: the Open button uses the same link, safely', (await page.getAttribute('#open-link', 'href')) === link && /noopener/.test((await page.getAttribute('#open-link', 'rel')) || '') && (await page.getAttribute('#open-link', 'target')) === '_blank');
		await page.click('#copy-btn');
		t.check('whatsapp page: Copy puts the link on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === link);
		await page.fill('#phone', '080123');
		t.check('whatsapp page: a wrong number gives a clear message and hides the link', /10 digits after 234/.test(await text(page, '#status')) && (await page.isHidden('#output')));
		await page.fill('#phone', '0801 234 5678');
		await page.fill('#message', '<img src=x onerror=window.__xss=1> <script>window.__xss=1</script>');
		t.check('whatsapp page: HTML in the message is only ever text', !(await page.evaluate(() => window.__xss)) && (await page.inputValue('#link')).includes('%3Cimg'));
		await page.fill('#message', 'a'.repeat(1001));
		t.check('whatsapp page: a message over 1000 characters is refused', /under 1000/.test(await text(page, '#status')) && (await page.isHidden('#output')));
		await page.fill('#message', 'Join our group today');
		await page.check('#no-number');
		t.check('whatsapp page: "share a message" mode builds a link without a number', (await page.inputValue('#link')) === 'https://wa.me/?text=Join%20our%20group%20today' && (await page.isHidden('#phone-fields')));
		await page.uncheck('#no-number'); // the country box is hidden while this is on
		await page.selectOption('#country', { label: 'Other: I will type the full number with the country code' });
		await page.fill('#phone', '+49 151 23456789');
		t.check('whatsapp page: "Other" country accepts a full international number', (await page.inputValue('#link')).startsWith('https://wa.me/4915123456789'));
		t.check('whatsapp page: no sideways scroll', !(await overflowX(page)));
		await finish(t, page, 'whatsapp page');
	}

	// ---------------- CGPA page ----------------
	{
		const page = await open(t, '/cgpa-calculator');
		const row = (n) => `#courses .entry:nth-child(${n})`;
		const setRow = async (n, units, grade) => {
			await page.fill(`${row(n)} input[type=number]`, String(units));
			if (grade) await page.selectOption(`${row(n)} select`, grade);
		};
		t.check('cgpa page: asks for courses before showing anything', /Add your courses/.test(await text(page, '#result')));
		await setRow(1, 3, 'A');
		await page.click('#add-course');
		await setRow(2, 2, 'B');
		await page.click('#add-course');
		await setRow(3, 4, 'C');
		await page.click('#add-course');
		await setRow(4, 1, 'F');
		let out = await text(page, '#result');
		t.check('cgpa page: semester GPA is 3.50 for the worked example', /Semester GPA\s*3\.50/.test(out) && /10 credit units, 35 quality points/.test(out), out.slice(0, 120));
		t.check('cgpa page: without history it shows the class this GPA would be', /Second Class Upper/.test(out));
		await page.fill('#prev-cgpa', '3.80');
		await page.fill('#prev-units', '60');
		out = await text(page, '#result');
		t.check('cgpa page: new CGPA is 3.76 over 70 units', /New CGPA\s*3\.76/.test(out) && /70 credit units in total/.test(out), out.slice(0, 160));
		await page.fill('#prev-cgpa', '6');
		t.check('cgpa page: a CGPA above 5 is refused with a message', /from 0 to 5/.test(await text(page, '#result')));
		await page.fill('#prev-cgpa', '');
		await page.fill('#prev-units', '');
		await page.click('#add-course');
		await page.fill(`${row(5)} input[type=number]`, '3'); // units but no grade
		t.check('cgpa page: a half-filled row is reported, not silently counted', /1 course is not counted yet/.test(await text(page, '#result')));
		await page.fill(`${row(5)} input[type=number]`, '99');
		await page.selectOption(`${row(5)} select`, 'A');
		t.check('cgpa page: 99 credit units in one course is refused', /more than 30 credit units/.test(await text(page, '#result')));
		await page.click(`${row(5)} button`);
		t.check('cgpa page: removing a row works', (await page.$$('#courses .entry')).length === 4);
		for (let i = 0; i < 25; i++) if (!(await page.isDisabled('#add-course'))) await page.click('#add-course');
		t.check('cgpa page: stops at 25 courses', (await page.$$('#courses .entry')).length === 25 && (await page.isDisabled('#add-course')));
		t.check('cgpa page: no sideways scroll', !(await overflowX(page)));
		await finish(t, page, 'cgpa page');
	}

	// ---------------- loan page ----------------
	{
		const page = await open(t, '/loan-calculator');
		t.check('loan page: asks for the three boxes first', /Fill in the three boxes/.test(await text(page, '#result')));
		await page.fill('#amount', '1000000');
		await page.fill('#rate', '24');
		await page.selectOption('#rate-per', 'year');
		await page.fill('#term', '12');
		let out = await text(page, '#result');
		t.check('loan page: reducing balance shows ₦94,559.60 a month', out.includes('₦94,559.60'), out.slice(0, 160));
		t.check('loan page: total interest ₦134,715.16', out.includes('₦134,715.16'));
		t.check('loan page: real yearly cost is the 24% typed', /24\.0% a year/.test(out));
		await page.fill('#rate', '5');
		await page.selectOption('#rate-per', 'month');
		await page.check('#mode-flat');
		out = await text(page, '#result');
		t.check('loan page: flat 5% a month shows ₦133,333.33 a month and ₦1,600,000.00 in total', out.includes('₦133,333.33') && out.includes('₦1,600,000.00') && out.includes('₦600,000.00'), out.slice(0, 200));
		t.check('loan page: the real yearly cost of that flat loan is about 97%', /97\.1% a year/.test(out), out.match(/\d+\.\d% a year/)?.[0]);
		t.check('loan page: a flat loan explains why the real cost is higher', /flat rate is charged on the full amount/.test(out));
		await page.selectOption('#term-unit', 'years');
		await page.fill('#term', '1');
		t.check('loan page: 1 year equals 12 months', (await text(page, '#result')).includes('₦133,333.33'));
		await page.fill('#term', '1.3333');
		t.check('loan page: a term that is not a whole number of months is refused', /whole number of months/.test(await text(page, '#result')));
		await page.fill('#term', '1.5');
		t.check('loan page: 1.5 years is accepted as 18 months', /for 18 months/.test(await text(page, '#result')));
		await page.selectOption('#currency', 'USD');
		t.check('loan page: changing the currency changes the symbol', (await text(page, '#result')).includes('$'));
		await page.selectOption('#currency', 'NGN');
		await page.fill('#term', '1');
		await page.click('#schedule-btn');
		t.check('loan page: the schedule has 12 rows and ends at zero', (await page.$$('#schedule tbody tr')).length === 12 && /₦0\.00$/.test((await text(page, '#schedule tbody tr:last-child td:last-child')).trim()));
		await page.selectOption('#term-unit', 'months');
		await page.fill('#term', '600');
		t.check('loan page: a 600-month schedule shows 600 rows', (await page.$$('#schedule tbody tr')).length === 600);
		t.check('loan page: the long schedule scrolls inside its own box, not the page', !(await overflowX(page)));
		await page.fill('#term', '601');
		t.check('loan page: 601 months is refused', /longest loan/.test(await text(page, '#result')));
		await page.fill('#term', '12');
		await page.fill('#amount', '-5');
		t.check('loan page: a negative amount is refused', /amount you want to borrow/.test(await text(page, '#result')));
		await page.fill('#amount', '1e999');
		t.check('loan page: an absurd amount never shows NaN or Infinity', !/NaN|Infinity/.test(await text(page, '#result')));
		await page.fill('#amount', '500000');
		await page.fill('#rate', '0');
		await page.check('#mode-reducing');
		t.check('loan page: 0% interest works', (await text(page, '#result')).includes('₦41,666.67') && /0\.0% a year/.test(await text(page, '#result')));
		await finish(t, page, 'loan page');
	}
}
