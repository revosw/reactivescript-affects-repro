// A fake server: load() answers after 300 ms, save() after 1500 ms (long enough to see `pending?`).
// Every call is written to the on-page log, so the recording shows whether save() ever ran.
type Row = { id: string; at: number };
const db: Row[] = [{ id: "a", at: 1 }];
const t0 = performance.now();

export function note(text: string): void {
	const log = document.getElementById("log");
	if (log) log.textContent += `${((performance.now() - t0) / 1000).toFixed(2)}s  ${text}\n`;
}

export function load(tick: number): Promise<{ rows: Row[] }> {
	note(`load(${tick}) called`);
	return new Promise((resolve) =>
		setTimeout(() => {
			note(`load(${tick}) answered: a@${db[0].at}`);
			resolve({ rows: structuredClone(db) });
		}, 300),
	);
}

export function save(id: string, at: number): Promise<void> {
	note(`save(${id}, ${at}) called`);
	return new Promise((resolve) =>
		setTimeout(() => {
			db.find((r) => r.id === id)!.at = at;
			note(`save(${id}, ${at}) answered`);
			resolve();
		}, 1500),
	);
}
