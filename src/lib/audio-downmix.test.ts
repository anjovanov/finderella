import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseDownmix, setMonoDownmix } from './audio-downmix';

/** Minimal Web Audio fake that enforces createMediaElementSource's once-per-element rule. */
const routed = new WeakSet<object>();
const contexts: FakeContext[] = [];

class FakeNode {
	channelCount = 2;
	channelCountMode: ChannelCountMode = 'max';
	channelInterpretation: ChannelInterpretation = 'speakers';
	connect = vi.fn((next: unknown) => next);
	disconnect = vi.fn();
}

class FakeContext {
	state: AudioContextState = 'suspended';
	destination = new FakeNode();
	sources: FakeNode[] = [];
	gains: FakeNode[] = [];
	resume = vi.fn(async () => {
		this.state = 'running';
	});
	close = vi.fn(async () => {
		this.state = 'closed';
	});
	constructor() {
		contexts.push(this);
	}
	createMediaElementSource(element: object) {
		if (routed.has(element)) throw new DOMException('already connected', 'InvalidStateError');
		routed.add(element);
		const node = new FakeNode();
		this.sources.push(node);
		return node;
	}
	createGain() {
		const node = new FakeNode();
		this.gains.push(node);
		return node;
	}
}

let win: EventTarget;
const video = () => new EventTarget() as unknown as HTMLMediaElement;

beforeEach(() => {
	contexts.length = 0;
	win = new EventTarget();
	vi.stubGlobal('AudioContext', FakeContext);
	vi.stubGlobal('window', win);
});
afterEach(() => vi.unstubAllGlobals());

describe('mono downmix', () => {
	it('leaves an element alone until mono is wanted', () => {
		const el = video();
		setMonoDownmix(el, false);
		expect(contexts).toHaveLength(0);
	});

	it('routes through one mono node with the speakers downmix', () => {
		const el = video();
		setMonoDownmix(el, true);
		expect(contexts).toHaveLength(1);
		const [gain] = contexts[0].gains;
		expect(gain).toMatchObject({
			channelCount: 1,
			channelCountMode: 'explicit',
			channelInterpretation: 'speakers'
		});
		releaseDownmix(el);
	});

	it('is idempotent: repeated and toggled calls never rebuild the graph', () => {
		const el = video();
		setMonoDownmix(el, true);
		setMonoDownmix(el, true);
		setMonoDownmix(el, false);
		expect(contexts[0].gains[0].channelCountMode).toBe('max'); // passthrough
		setMonoDownmix(el, true);
		expect(contexts[0].gains[0].channelCountMode).toBe('explicit');
		expect(contexts).toHaveLength(1);
		releaseDownmix(el);
	});

	it('resumes a suspended context on play and on input', () => {
		const el = video();
		setMonoDownmix(el, true);
		const context = contexts[0];
		expect(context.resume).toHaveBeenCalledTimes(1); // attempted at build
		context.state = 'suspended';
		el.dispatchEvent(new Event('play'));
		expect(context.resume).toHaveBeenCalledTimes(2);
		context.state = 'suspended';
		win.dispatchEvent(new Event('pointerdown'));
		expect(context.resume).toHaveBeenCalledTimes(3);
		// Running: nothing to do.
		win.dispatchEvent(new Event('keydown'));
		expect(context.resume).toHaveBeenCalledTimes(3);
		releaseDownmix(el);
	});

	it('release closes the context and stops listening; unrouted elements are a no-op', () => {
		const el = video();
		setMonoDownmix(el, true);
		const context = contexts[0];
		releaseDownmix(el);
		expect(context.sources[0].disconnect).toHaveBeenCalled();
		expect(context.close).toHaveBeenCalled();
		context.state = 'suspended';
		win.dispatchEvent(new Event('pointerdown'));
		el.dispatchEvent(new Event('play'));
		expect(context.resume).toHaveBeenCalledTimes(1);
		releaseDownmix(el);
		releaseDownmix(video());
		expect(context.close).toHaveBeenCalledTimes(1);
	});
});
