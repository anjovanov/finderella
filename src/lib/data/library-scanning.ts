/** Rescan intervals offered in admin → Site settings → Library scanning (hours). */
export const SCAN_INTERVAL_HOURS = [1, 6, 12, 24] as const;
export type ScanIntervalHours = (typeof SCAN_INTERVAL_HOURS)[number];

export const DEFAULT_SCAN_INTERVAL_HOURS: ScanIntervalHours = 24;

export function isScanIntervalHours(value: unknown): value is ScanIntervalHours {
	return SCAN_INTERVAL_HOURS.includes(value as ScanIntervalHours);
}

/** A library is due for its periodic rescan (never scanned = due). null interval = never. */
export function scanDue(lastScanAt: Date | null, intervalHours: number | null, now: Date): boolean {
	if (!intervalHours) return false;
	if (!lastScanAt) return true;
	return now.getTime() - lastScanAt.getTime() >= intervalHours * 3_600_000;
}

export function scanIntervalLabel(hours: number | null): string {
	if (!hours) return 'Off';
	return hours === 24 ? 'Every day' : hours === 1 ? 'Every hour' : `Every ${hours} hours`;
}
