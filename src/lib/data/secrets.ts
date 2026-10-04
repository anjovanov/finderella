/**
 * What admin pages show for a stored secret: the last four characters only
 * (`••••1234`), or just dots for a very short value. null = nothing stored.
 */
export function maskSecret(secret: string | null | undefined): string | null {
	const value = secret?.trim();
	if (!value) return null;
	return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}
