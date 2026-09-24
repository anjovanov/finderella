/** Pass a response body through unchanged, reporting each chunk's size (bandwidth accounting). */
export function countBytes(
	body: ReadableStream<Uint8Array>,
	onBytes: (bytes: number) => void
): ReadableStream<Uint8Array> {
	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				onBytes(chunk.byteLength);
				controller.enqueue(chunk);
			}
		})
	);
}
