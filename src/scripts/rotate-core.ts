// Rotation rules for the Rotate PDF Pages tool. No browser code here, so it can be tested directly.
// Angles are clockwise degrees: 90 = turned right, 180 = upside down, 270 = turned left.

export const normalizeAngle = (angle: number) => ((Math.round(angle / 90) * 90) % 360 + 360) % 360;

// What a page looks like after it is turned by `delta` degrees on top of `current`.
export const turn = (current: number, delta: number) => normalizeAngle(current + delta);

export function describeTurn(angle: number): string {
	switch (normalizeAngle(angle)) {
		case 90:
			return 'turned right';
		case 180:
			return 'upside down';
		case 270:
			return 'turned left';
		default:
			return '';
	}
}

export const isSideways = (width: number, height: number) => width > height;
