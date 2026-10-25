import { mountRepeater } from './repeater';
import { degreeClass, round2, semesterResult, updatedCgpa, GRADE_POINTS } from './cgpa-core';
import { byId, h } from './ui';

type Row = { name: string; units: string; grade: string };

const prevCgpaEl = byId<HTMLInputElement>('prev-cgpa');
const prevUnitsEl = byId<HTMLInputElement>('prev-units');
const result = byId('result');

const rows: Row[] = [{ name: '', units: '', grade: '' }];
const MAX_COURSES = 25;
const MAX_UNITS_PER_COURSE = 30;

const num = (s: string) => {
	const n = Number(s);
	return s.trim() !== '' && Number.isFinite(n) ? n : NaN;
};

function card(label: string, value: string, note?: string) {
	const box = h('div', 'stat');
	box.append(h('p', 'stat-label', label), h('p', 'stat-value', value));
	if (note) box.append(h('p', 'stat-note', note));
	return box;
}

function render() {
	result.replaceChildren();

	const valid: { units: number; grade: string }[] = [];
	let incomplete = 0;
	let tooBig = false;
	for (const r of rows) {
		const units = num(r.units);
		const hasAnything = r.units.trim() !== '' || r.grade !== '' || r.name.trim() !== '';
		if (Number.isFinite(units) && units > 0 && GRADE_POINTS[r.grade] !== undefined) {
			if (units > MAX_UNITS_PER_COURSE) tooBig = true;
			else valid.push({ units, grade: r.grade });
		} else if (hasAnything && (r.units.trim() !== '' || r.grade !== '')) {
			incomplete++;
		}
	}

	const messages: string[] = [];
	if (tooBig) messages.push(`A single course cannot have more than ${MAX_UNITS_PER_COURSE} credit units. Check the units.`);
	if (incomplete > 0) messages.push(`${incomplete} course${incomplete === 1 ? ' is' : 's are'} not counted yet. Each needs credit units and a grade.`);

	const sem = semesterResult(valid);
	if (sem.gpa === null) {
		result.append(h('p', 'muted', messages[0] ?? 'Add your courses above to see your GPA.'));
		return;
	}

	const grid = h('div', 'stat-grid');
	grid.append(card('Semester GPA', round2(sem.gpa).toFixed(2), `${sem.units} credit units, ${sem.points} quality points`));

	const prevCgpaText = prevCgpaEl.value;
	const prevUnitsText = prevUnitsEl.value;
	if (prevCgpaText.trim() !== '' || prevUnitsText.trim() !== '') {
		const pc = num(prevCgpaText);
		const pu = num(prevUnitsText);
		if (!Number.isFinite(pc) || pc < 0 || pc > 5) messages.push('Your previous CGPA must be a number from 0 to 5.');
		else if (!Number.isFinite(pu) || pu < 0 || pu > 600) messages.push('Enter the total credit units you had completed before this semester (0 to 600).');
		else {
			const cgpa = updatedCgpa(pc, pu, sem);
			if (cgpa !== null) {
				grid.append(card('New CGPA', round2(cgpa).toFixed(2), `${pu + sem.units} credit units in total`));
				grid.append(card('Degree class today', degreeClass(cgpa), 'Common bands on the 5.0 scale. Your school decides.'));
			}
		}
	} else {
		grid.append(card('Degree class if this were your CGPA', degreeClass(sem.gpa), 'Common bands on the 5.0 scale. Your school decides.'));
	}
	result.append(grid);
	for (const m of messages) result.append(h('p', 'status error', m));
}

mountRepeater<Row>({
	container: byId('courses'),
	addBtn: byId<HTMLButtonElement>('add-course'),
	items: rows,
	blank: () => ({ name: '', units: '', grade: '' }),
	fields: [
		{ key: 'name', label: 'Course (optional)', wide: true, placeholder: 'e.g. MTH 101' },
		{ key: 'units', label: 'Credit units', kind: 'number', placeholder: 'e.g. 3' },
		{
			key: 'grade',
			label: 'Grade',
			kind: 'select',
			options: [
				{ value: '', label: 'Choose grade' },
				{ value: 'A', label: 'A (5 points)' },
				{ value: 'B', label: 'B (4 points)' },
				{ value: 'C', label: 'C (3 points)' },
				{ value: 'D', label: 'D (2 points)' },
				{ value: 'E', label: 'E (1 point)' },
				{ value: 'F', label: 'F (0 points)' },
			],
		},
	],
	itemLabel: 'Course',
	max: MAX_COURSES,
	min: 1,
	onChange: render,
});

for (const el of [prevCgpaEl, prevUnitsEl]) el.addEventListener('input', render);
render();
