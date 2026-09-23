/**
 * Mono playback for direct-play files: route the <video> through Web Audio and
 * mix it down to one channel, which the speakers then all play. Transcoded
 * (HLS) sessions don't need this — the gateway encodes them mono already.
 *
 * The node forces one channel with the spec's "speakers" downmix, which keeps
 * the centre (dialogue) channel at full level: 5.1 → 0.707·(L+R) + C + 0.5·(Ls+Rs).
 * Element volume/mute still apply (they act before the source node).
 *
 * `createMediaElementSource` works once per element, and once it has run the
 * element is only audible through that graph. So the graph is built lazily the
 * first time mono is wanted, kept for the element's lifetime (switching mono
 * off turns the node into a passthrough), and torn down only by
 * releaseDownmix when the element itself goes away. Every call is idempotent.
 */

interface Downmix {
	context: AudioContext;
	source: MediaElementAudioSourceNode;
	node: GainNode;
	resume: () => void;
}

const graphs = new WeakMap<HTMLMediaElement, Downmix>();
const CAPTURE = { capture: true };

function build(video: HTMLMediaElement): Downmix {
	const context = new AudioContext();
	const source = context.createMediaElementSource(video);
	const node = context.createGain();
	source.connect(node).connect(context.destination);

	// A context created without a user gesture starts suspended, and a
	// suspended context plays the element silently. Resume on playback and on
	// any input (a click or key press counts as the gesture autoplay wants).
	const resume = () => {
		if (context.state === 'suspended') context.resume().catch(() => {});
	};
	resume();
	video.addEventListener('play', resume);
	window.addEventListener('pointerdown', resume, CAPTURE);
	window.addEventListener('keydown', resume, CAPTURE);
	return { context, source, node, resume };
}

/** Mono on or off for this element; builds the graph only when mono is first wanted. */
export function setMonoDownmix(video: HTMLMediaElement, mono: boolean): void {
	let graph = graphs.get(video);
	if (!graph) {
		if (!mono) return; // never routed: the element plays natively
		graph = build(video);
		graphs.set(video, graph);
	}
	if (mono) {
		graph.node.channelCount = 1;
		graph.node.channelCountMode = 'explicit';
		graph.node.channelInterpretation = 'speakers';
	} else {
		// Passthrough: the node takes whatever the source carries.
		graph.node.channelCountMode = 'max';
	}
}

/** Dispose the element's graph (if any). Leaves the element silent — call only when it goes away. */
export function releaseDownmix(video: HTMLMediaElement): void {
	const graph = graphs.get(video);
	if (!graph) return;
	graphs.delete(video);
	video.removeEventListener('play', graph.resume);
	window.removeEventListener('pointerdown', graph.resume, CAPTURE);
	window.removeEventListener('keydown', graph.resume, CAPTURE);
	graph.source.disconnect();
	graph.context.close().catch(() => {});
}
