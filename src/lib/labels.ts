/**
 * Label tables at module top level, translated on every read. wuchale extracts
 * only strings inside functions (a top-level string would be evaluated once at
 * import, in whichever language got there first), so each label is a function
 * behind a getter and call sites keep reading plain strings
 * (`LABELS[key]`, `option.label`).
 */

/** `{ direct: () => 'Direct play' }` → a record whose `direct` reads the current translation. */
export function labelTable<K extends string>(labels: Record<K, () => string>): Record<K, string> {
	const table = {} as Record<K, string>;
	for (const [key, label] of Object.entries(labels) as [K, () => string][]) {
		Object.defineProperty(table, key, { get: label, enumerable: true });
	}
	return table;
}

/** `{ value: 'small' }` + `() => 'Small'` → the item with a translated `label` getter. */
export function labeled<const T extends object>(
	item: T,
	label: () => string
): T & { readonly label: string } {
	return Object.defineProperty({ ...item }, 'label', { get: label, enumerable: true }) as T & {
		readonly label: string;
	};
}
