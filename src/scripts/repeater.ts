import { h } from './ui';

export interface RepeaterField {
	key: string;
	label: string;
	kind?: 'text' | 'number' | 'textarea';
	placeholder?: string;
	wide?: boolean; // spans the full width on larger screens
}

interface Options<T extends Record<string, string>> {
	container: HTMLElement;
	addBtn: HTMLButtonElement;
	items: T[]; // edited in place
	blank: () => T;
	fields: RepeaterField[];
	itemLabel: string; // "Item", "Job", "School"
	max: number;
	min?: number;
	onChange: () => void;
}

// Builds a list of editable rows (invoice items, CV jobs...) with Add and Remove buttons.
export function mountRepeater<T extends Record<string, string>>(o: Options<T>) {
	const min = o.min ?? 0;

	function render(focusLast = false) {
		o.container.replaceChildren();
		o.items.forEach((item, i) => {
			const box = h('div', 'entry');
			const head = h('div', 'entry-head');
			head.append(h('strong', undefined, `${o.itemLabel} ${i + 1}`));
			const remove = h('button', 'btn btn-secondary btn-small', 'Remove');
			remove.type = 'button';
			remove.disabled = o.items.length <= min;
			remove.setAttribute('aria-label', `Remove ${o.itemLabel} ${i + 1}`);
			remove.addEventListener('click', () => {
				o.items.splice(i, 1);
				render();
				o.onChange();
			});
			head.append(remove);
			box.append(head);

			const grid = h('div', 'form-grid');
			for (const f of o.fields) {
				const label = h('label', f.wide ? 'field wide' : 'field');
				label.append(h('span', undefined, f.label));
				const input = f.kind === 'textarea' ? h('textarea') : h('input');
				if (input instanceof HTMLInputElement) {
					input.type = f.kind === 'number' ? 'number' : 'text';
					if (f.kind === 'number') {
						input.inputMode = 'decimal';
						input.min = '0';
						input.step = 'any';
					}
				} else {
					input.rows = 3;
				}
				input.value = item[f.key] ?? '';
				if (f.placeholder) input.placeholder = f.placeholder;
				input.addEventListener('input', () => {
					(item as Record<string, string>)[f.key] = input.value;
					o.onChange();
				});
				label.append(input);
				grid.append(label);
			}
			box.append(grid);
			o.container.append(box);
		});
		o.addBtn.disabled = o.items.length >= o.max;
		if (focusLast) o.container.querySelector<HTMLElement>('.entry:last-child input, .entry:last-child textarea')?.focus();
	}

	o.addBtn.addEventListener('click', () => {
		if (o.items.length >= o.max) return;
		o.items.push(o.blank());
		render(true);
		o.onChange();
	});

	render();
}
