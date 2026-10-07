import { mountRepeater } from './repeater';
import { byId, h, printAs } from './ui';

type Job = { role: string; company: string; dates: string; details: string };
type School = { school: string; award: string; dates: string; details: string };

const f = {
	name: byId<HTMLInputElement>('name'),
	title: byId<HTMLInputElement>('title'),
	email: byId<HTMLInputElement>('email'),
	phone: byId<HTMLInputElement>('phone'),
	location: byId<HTMLInputElement>('location'),
	link: byId<HTMLInputElement>('link'),
	summary: byId<HTMLTextAreaElement>('summary'),
	skills: byId<HTMLTextAreaElement>('skills'),
	extra: byId<HTMLTextAreaElement>('extra'),
	referees: byId<HTMLTextAreaElement>('referees'),
	accent: byId<HTMLSelectElement>('accent'),
};
const doc = byId('doc');
const printBtn = byId<HTMLButtonElement>('print-btn');

const jobs: Job[] = [{ role: '', company: '', dates: '', details: '' }];
const schools: School[] = [{ school: '', award: '', dates: '', details: '' }];

const ACCENTS: Record<string, string> = { green: '#047857', navy: '#1e3a8a', black: '#111827' };

const lines = (text: string) =>
	text
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);

function section(title: string): HTMLElement {
	const s = h('section', 'cv-section');
	s.append(h('h3', undefined, title));
	return s;
}

function entry(title: string, subtitle: string, dates: string, details: string): HTMLElement {
	const e = h('div', 'cv-entry');
	const head = h('div', 'cv-entry-head');
	head.append(h('span', undefined, [title, subtitle].filter(Boolean).join(', ')));
	if (dates) head.append(h('span', 'dates', dates));
	e.append(head);
	const bullets = lines(details);
	if (bullets.length > 0) {
		const ul = h('ul');
		bullets.forEach((b) => ul.append(h('li', undefined, b)));
		e.append(ul);
	}
	return e;
}

function render() {
	doc.style.setProperty('--doc-accent', ACCENTS[f.accent.value] ?? ACCENTS.green);
	doc.replaceChildren();

	// header
	const header = h('header');
	header.append(h('h2', 'cv-name', f.name.value || 'Your Name'));
	if (f.title.value) header.append(h('p', 'cv-role', f.title.value));
	const contact = [f.email.value, f.phone.value, f.location.value, f.link.value].filter(Boolean);
	if (contact.length > 0) header.append(h('p', 'doc-muted', contact.join('  •  ')));
	doc.append(header);

	if (f.summary.value.trim()) {
		const s = section('Profile');
		s.append(h('p', 'doc-pre', f.summary.value.trim()));
		doc.append(s);
	}

	const filledJobs = jobs.filter((j) => j.role || j.company || j.details);
	if (filledJobs.length > 0) {
		const s = section('Work experience');
		filledJobs.forEach((j) => s.append(entry(j.role, j.company, j.dates, j.details)));
		doc.append(s);
	}

	const filledSchools = schools.filter((e) => e.school || e.award || e.details);
	if (filledSchools.length > 0) {
		const s = section('Education');
		filledSchools.forEach((e) => s.append(entry(e.award, e.school, e.dates, e.details)));
		doc.append(s);
	}

	const skills = f.skills.value
		.split(/[\n,]/)
		.map((x) => x.trim())
		.filter(Boolean);
	if (skills.length > 0) {
		const s = section('Skills');
		s.append(h('p', undefined, skills.join('  •  ')));
		doc.append(s);
	}

	const extra = lines(f.extra.value);
	if (extra.length > 0) {
		const s = section('Additional information');
		const ul = h('ul');
		extra.forEach((x) => ul.append(h('li', undefined, x)));
		s.append(ul);
		doc.append(s);
	}

	if (f.referees.value.trim()) {
		const s = section('Referees');
		s.append(h('p', 'doc-pre', f.referees.value.trim()));
		doc.append(s);
	}
}

for (const el of Object.values(f)) {
	el.addEventListener('input', render);
	el.addEventListener('change', render);
}

mountRepeater<Job>({
	container: byId('jobs'),
	addBtn: byId<HTMLButtonElement>('add-job'),
	items: jobs,
	blank: () => ({ role: '', company: '', dates: '', details: '' }),
	fields: [
		{ key: 'role', label: 'Job title', placeholder: 'e.g. Sales Executive' },
		{ key: 'company', label: 'Company', placeholder: 'e.g. ABC Limited, Lagos' },
		{ key: 'dates', label: 'Dates', wide: true, placeholder: 'e.g. Mar 2021 – Present' },
		{ key: 'details', label: 'What you did (one point per line)', kind: 'textarea', wide: true },
	],
	itemLabel: 'Job',
	max: 8,
	min: 1,
	onChange: render,
});

mountRepeater<School>({
	container: byId('schools'),
	addBtn: byId<HTMLButtonElement>('add-school'),
	items: schools,
	blank: () => ({ school: '', award: '', dates: '', details: '' }),
	fields: [
		{ key: 'award', label: 'Qualification', placeholder: 'e.g. B.Sc. Computer Science' },
		{ key: 'school', label: 'School', placeholder: 'e.g. University of Ibadan' },
		{ key: 'dates', label: 'Dates', wide: true, placeholder: 'e.g. 2016 – 2020' },
		{ key: 'details', label: 'Grade or notes (one per line, optional)', kind: 'textarea', wide: true },
	],
	itemLabel: 'School',
	max: 5,
	min: 1,
	onChange: render,
});

printBtn.addEventListener('click', () => printAs(`CV ${f.name.value}`.trim()));
render();
