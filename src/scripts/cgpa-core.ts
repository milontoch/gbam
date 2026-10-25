// CGPA maths for the common 5.0 scale. No browser code here, so it can be tested directly.
// Grade points: A=5, B=4, C=3, D=2, E=1, F=0. A GPA is the average of grade points weighted by credit units.

export const GRADE_POINTS: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };

export interface Course {
	units: number;
	grade: string; // 'A' to 'F'
}

export interface Semester {
	units: number; // total credit units counted
	points: number; // total quality points (units x grade points)
	gpa: number | null; // null when there is nothing to count
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function semesterResult(courses: Course[]): Semester {
	let units = 0;
	let points = 0;
	for (const c of courses) {
		const gp = GRADE_POINTS[c.grade];
		if (gp === undefined || !(c.units > 0)) continue;
		units += c.units;
		points += c.units * gp;
	}
	return { units, points, gpa: units > 0 ? points / units : null };
}

// New CGPA after adding a semester to what you already have.
export function updatedCgpa(prevCgpa: number, prevUnits: number, sem: Semester): number | null {
	const units = prevUnits + sem.units;
	return units > 0 ? (prevCgpa * prevUnits + sem.points) / units : null;
}

// The class bands most Nigerian universities use on the 5.0 scale. Schools can differ, so the page says so.
export function degreeClass(cgpa: number): string {
	const c = round2(cgpa);
	if (c >= 4.5) return 'First Class';
	if (c >= 3.5) return 'Second Class Upper (2:1)';
	if (c >= 2.4) return 'Second Class Lower (2:2)';
	if (c >= 1.5) return 'Third Class';
	if (c >= 1.0) return 'Pass';
	return 'Below the pass mark (no degree class)';
}
