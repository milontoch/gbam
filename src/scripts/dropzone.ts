// Wires a dropzone <label> and its hidden <input type="file"> so that both
// "tap to choose" and "drag and drop" hand the chosen files to one callback.
export function bindDropzone(zone: HTMLElement, input: HTMLInputElement, onFiles: (files: File[]) => void): void {
	input.addEventListener('change', () => {
		const files = Array.from(input.files ?? []);
		input.value = ''; // lets the user pick the same file again later
		if (files.length > 0) onFiles(files);
	});

	zone.addEventListener('dragover', (e) => {
		e.preventDefault();
		zone.classList.add('drag');
	});
	zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
	zone.addEventListener('drop', (e) => {
		e.preventDefault();
		zone.classList.remove('drag');
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length > 0) onFiles(files);
	});
}
