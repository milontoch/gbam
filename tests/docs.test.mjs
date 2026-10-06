import { PDFDocument } from 'pdf-lib';
import { finish, makeImage, open, overflowX } from './lib.mjs';

const docText = (page) => page.textContent('#doc');
const printedPages = async (page) => {
	await page.emulateMedia({ media: 'print' });
	const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
	await page.emulateMedia({ media: 'screen' });
	return (await PDFDocument.load(pdf)).getPageCount();
};

export default async function (t) {
	// ---------------- Invoice ----------------
	{
		const page = await open(t, '/invoice-generator');
		await page.fill('#biz-name', 'Ade <b>Stores</b> & Sons');
		await page.fill('#client-name', '<img src=x onerror=window.__xss=1>');
		await page.fill('#number', 'INV-001');
		await page.fill('#items .entry:nth-child(1) input[type=text]', 'Logo design');
		const first = await page.$$('#items .entry:nth-child(1) input[type=number]');
		await first[0].fill('3');
		await first[1].fill('1500.5');
		await page.click('#add-item');
		await page.fill('#items .entry:nth-child(2) input[type=text]', 'Hosting');
		const second = await page.$$('#items .entry:nth-child(2) input[type=number]');
		await second[0].fill('1');
		await second[1].fill('10000');
		await page.click('#vat-btn');
		await page.fill('#discount', '10');
		let text = await docText(page);
		// 4501.50 + 10000 = 14501.50; 10% off = 13051.35; 7.5% VAT = 978.85; total 14030.20
		t.check('invoice: Naira symbol and line total', text.includes('₦4,501.50'));
		t.check('invoice: subtotal', text.includes('₦14,501.50'));
		t.check('invoice: discount', text.includes('-₦1,450.15'));
		t.check('invoice: VAT 7.5%', text.includes('₦978.85'));
		t.check('invoice: total due', text.includes('₦14,030.20'));
		t.check('invoice: typed HTML shown as text and never run', text.includes('<b>Stores</b>') && !(await page.evaluate(() => window.__xss)) && (await page.$$('#doc b, #doc img[src="x"]')).length === 0);
		await page.selectOption('#type', 'receipt');
		text = await docText(page);
		t.check('invoice: receipt mode', text.includes('RECEIPT') && text.includes('PAID') && text.includes('Total paid') && (await page.isHidden('#due-field')));

		// nasty numbers must never print NaN or Infinity
		await page.fill('#discount', '-50');
		await second[1].fill('1e999');
		await first[0].fill('abc').catch(() => {});
		await page.fill('#tax', '9999');
		text = await docText(page);
		t.check('invoice: absurd numbers never show NaN or Infinity', !/NaN|Infinity|undefined/.test(text), text.match(/Total paid[^\n]*/)?.[0]);
		await second[1].fill('10000');
		await page.fill('#discount', '10');
		await page.fill('#tax', '7.5');

		// logo
		const logo = await makeImage(page, { w: 800, h: 300, type: 'image/png' });
		await page.setInputFiles('#logo', { name: 'logo.png', mimeType: 'image/png', buffer: logo });
		await page.waitForSelector('#doc img.doc-logo');
		t.check('invoice: logo appears', true);
		await page.setInputFiles('#logo', { name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
		t.check('invoice: wrong logo type refused', /Logo must be/.test(await page.textContent('#status')));
		t.check('invoice: prints on one page', (await printedPages(page)) === 1);
		t.check('invoice: no sideways scroll', !(await overflowX(page)));

		// stress: 30 items (the maximum), an unbreakable 2000-character name, and a very long note
		for (let i = 2; i < 30; i++) await page.click('#add-item');
		t.check('invoice: add button stops at 30 items', await page.isDisabled('#add-item'));
		t.check('invoice: 30 item rows exist', (await page.$$('#items .entry')).length === 30);
		await page.fill('#biz-name', 'W'.repeat(2000));
		await page.fill('#notes', 'Pay now. '.repeat(300));
		t.check('invoice: huge text does not break the layout', !(await overflowX(page)));
		const printed = await printedPages(page);
		t.check('invoice: 30 items print on a sensible number of pages', printed >= 1 && printed <= 4, String(printed));
		await finish(t, page, 'invoice');
	}

	// ---------------- CV ----------------
	{
		const page = await open(t, '/cv-builder');
		await page.fill('#name', 'Chioma Okafor');
		await page.fill('#title', 'Accountant');
		await page.fill('#email', 'chioma@example.com');
		await page.fill('#jobs .entry:nth-child(1) input >> nth=0', 'Senior Accountant');
		await page.fill('#jobs .entry:nth-child(1) textarea', 'Prepared monthly reports\nReduced costs by 12%\n\n<script>window.__x=1</script>');
		await page.fill('#skills', 'Excel, Tally\nQuickBooks');
		const text = await docText(page);
		t.check('cv: name, title and skills shown', text.includes('Chioma Okafor') && text.includes('Excel  •  Tally  •  QuickBooks'));
		t.check('cv: blank lines skipped and script text is inert', (await page.$$('#doc .cv-entry li')).length === 3 && !(await page.evaluate(() => window.__x)));
		t.check('cv: empty sections are left out', !text.includes('Referees') && !text.includes('Education'));
		await page.fill('#referees', 'Available on request');
		t.check('cv: referees appear when filled', (await docText(page)).includes('Referees'));
		await page.click('#add-job');
		await page.click('#jobs .entry:nth-child(2) button');
		t.check('cv: add then remove a job', (await page.$$('#jobs .entry')).length === 1 && (await page.isDisabled('#jobs .entry button')));
		await page.selectOption('#accent', 'navy');
		t.check('cv: accent colour changes', (await page.evaluate(() => getComputedStyle(document.getElementById('doc')).getPropertyValue('--doc-accent').trim())) === '#1e3a8a');
		t.check('cv: short CV prints on one page', (await printedPages(page)) === 1);

		for (let i = 1; i < 8; i++) await page.click('#add-job');
		t.check('cv: add button stops at 8 jobs', await page.isDisabled('#add-job'));
		for (let i = 1; i <= 8; i++) {
			await page.fill(`#jobs .entry:nth-child(${i}) input >> nth=0`, `Job title number ${i} `.repeat(3));
			await page.fill(`#jobs .entry:nth-child(${i}) textarea`, 'Did a very important thing at work and wrote it down in a long sentence.\n'.repeat(6));
		}
		await page.fill('#summary', 'S'.repeat(1500));
		t.check('cv: huge content does not break the layout', !(await overflowX(page)));
		const printed = await printedPages(page);
		t.check('cv: a full CV prints on 1 to 4 pages', printed >= 1 && printed <= 4, String(printed));
		await finish(t, page, 'cv');
	}
}
