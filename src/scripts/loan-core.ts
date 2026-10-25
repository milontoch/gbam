// Loan maths. No browser code here, so it can be tested directly.
//
// Reducing balance: interest is charged only on what you still owe, so it shrinks as you repay.
// Flat rate: interest is charged on the full amount borrowed for the whole loan, however much you have repaid.

export type Mode = 'reducing' | 'flat';
export type RatePer = 'year' | 'month';

export interface LoanInput {
	principal: number;
	rate: number; // percent
	ratePer: RatePer;
	months: number; // whole number of months
	mode: Mode;
}

export interface Row {
	n: number;
	payment: number;
	interest: number;
	principal: number;
	balance: number;
}

export interface LoanResult {
	payment: number;
	interest: number;
	total: number;
	yearlyRate: number; // the same cost expressed as a reducing-balance rate per year, in percent
	schedule: Row[];
}

export const MAX_MONTHS = 600;

export function validate(i: LoanInput): string | null {
	if (!Number.isFinite(i.principal) || i.principal <= 0) return 'Enter the amount you want to borrow.';
	if (i.principal > 1e12) return 'That amount is too large to calculate.';
	if (!Number.isFinite(i.rate) || i.rate < 0) return 'Enter the interest rate (0 or more).';
	if (i.ratePer === 'year' && i.rate > 1000) return 'A yearly rate above 1000% is too large to calculate.';
	if (i.ratePer === 'month' && i.rate > 100) return 'A monthly rate above 100% is too large to calculate.';
	if (!Number.isFinite(i.months) || i.months < 1) return 'Enter how long the loan lasts.';
	if (!Number.isInteger(i.months)) return 'Make the length a whole number of months. For years, use a whole or half year.';
	if (i.months > MAX_MONTHS) return `The longest loan this calculator handles is ${MAX_MONTHS} months (${MAX_MONTHS / 12} years).`;
	return null;
}

// The monthly rate i that makes the payments worth exactly the amount borrowed today (the loan's true cost).
export function monthlyCostRate(principal: number, payment: number, months: number): number {
	if (payment * months <= principal * (1 + 1e-12)) return 0;
	const presentValue = (i: number) => (payment * (1 - Math.pow(1 + i, -months))) / i;
	let lo = 1e-12;
	let hi = 1;
	while (presentValue(hi) > principal && hi < 1e6) hi *= 2;
	for (let k = 0; k < 200; k++) {
		const mid = (lo + hi) / 2;
		if (presentValue(mid) > principal) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

export function calculate(i: LoanInput): LoanResult {
	const P = i.principal;
	const n = i.months;
	let payment: number;
	let interestTotal: number;
	const schedule: Row[] = [];

	if (i.mode === 'reducing') {
		const r = i.ratePer === 'year' ? i.rate / 100 / 12 : i.rate / 100;
		payment = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
		interestTotal = payment * n - P;
		let balance = P;
		for (let k = 1; k <= n; k++) {
			const interest = balance * r;
			const principal = payment - interest;
			balance = k === n ? 0 : Math.max(0, balance - principal);
			schedule.push({ n: k, payment, interest, principal, balance });
		}
	} else {
		interestTotal = i.ratePer === 'year' ? P * (i.rate / 100) * (n / 12) : P * (i.rate / 100) * n;
		payment = (P + interestTotal) / n;
		for (let k = 1; k <= n; k++) {
			schedule.push({ n: k, payment, interest: interestTotal / n, principal: P / n, balance: k === n ? 0 : P - (P / n) * k });
		}
	}

	const yearlyRate = monthlyCostRate(P, payment, n) * 12 * 100;
	return { payment, interest: interestTotal, total: payment * n, yearlyRate, schedule };
}
