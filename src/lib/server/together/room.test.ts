import { describe, expect, it } from 'vitest';
import type { TogetherServerMessage, TogetherState } from '$lib/data/together';
import {
	CHAT_RATE,
	LAGGING_MS,
	RECONNECT_GRACE_MS,
	Room,
	STALL_TIMEOUT_MS,
	WAIT_TIMEOUT_MS,
	type Connection,
	type TogetherIdentity
} from './room';

function identity(name: string): TogetherIdentity {
	return {
		userId: `user-${name}`,
		profileId: `profile-${name}`,
		name,
		avatarColor: 'teal',
		avatarIcon: null
	};
}

class FakeConnection implements Connection {
	messages: TogetherServerMessage[] = [];
	closed: { code: number; reason: string } | null = null;
	send(message: TogetherServerMessage) {
		this.messages.push(message);
	}
	close(code: number, reason: string) {
		this.closed = { code, reason };
	}
	of<T extends TogetherServerMessage['type']>(type: T) {
		return this.messages.filter((m) => m.type === type) as Extract<
			TogetherServerMessage,
			{ type: T }
		>[];
	}
	lastState(): TogetherState | undefined {
		return this.of('state').at(-1)?.state;
	}
	events(): string[] {
		return this.of('chat')
			.filter((m) => m.entry.kind === 'event')
			.map((m) => m.entry.text);
	}
}

function setup(people = ['Ana', 'Ben'], opts: { playing?: boolean; position?: number } = {}) {
	let now = 1_000_000;
	const clock = {
		now: () => now,
		advance(ms: number) {
			now += ms;
		}
	};
	const room = new Room(
		'code',
		identity(people[0]),
		{ kind: 'series', slug: 'show', episodeSlug: 'e1' },
		opts.position ?? 0,
		opts.playing ?? false,
		clock.now
	);
	const conns: FakeConnection[] = [];
	const ids: string[] = [];
	for (const name of people) {
		const conn = new FakeConnection();
		const joined = room.join(identity(name), conn);
		if (!joined.ok) throw new Error('join failed');
		conns.push(conn);
		ids.push(joined.participantId);
	}
	return { room, conns, ids, clock };
}

describe('Room timeline', () => {
	it('holds a play until everyone is ready, then runs from the target', () => {
		const { room, conns, ids, clock } = setup();
		room.handle(ids[0], { type: 'play', position: 42 });
		const held = conns[1].lastState()!;
		expect(held).toMatchObject({ playing: true, waiting: true, position: 42 });
		expect(held.waitingFor).toEqual(ids);

		room.handle(ids[0], { type: 'ready', seq: held.seq });
		expect(conns[1].lastState()).toMatchObject({ waiting: true, waitingFor: [ids[1]] });

		clock.advance(500);
		room.handle(ids[1], { type: 'ready', seq: held.seq });
		const running = conns[0].lastState()!;
		expect(running).toMatchObject({ playing: true, waiting: false, position: 42 });
		expect(running.anchorAt).toBe(clock.now());
	});

	it('ignores ready reports for a superseded wait', () => {
		const { room, conns, ids } = setup();
		room.handle(ids[0], { type: 'play', position: 10 });
		const first = conns[0].lastState()!.seq;
		room.handle(ids[1], { type: 'seek', position: 300 });
		room.handle(ids[0], { type: 'ready', seq: first });
		room.handle(ids[1], { type: 'ready', seq: first });
		expect(conns[0].lastState()).toMatchObject({ waiting: true, position: 300 });
	});

	it('starts without stragglers after the timeout and marks them lagging', () => {
		const { room, conns, ids, clock } = setup();
		room.handle(ids[0], { type: 'play', position: 0 });
		room.handle(ids[0], { type: 'ready', seq: conns[0].lastState()!.seq });
		clock.advance(WAIT_TIMEOUT_MS);
		room.tick();
		expect(conns[0].lastState()).toMatchObject({ waiting: false, playing: true });

		// Ben is lagging: his stall doesn't hold the group…
		room.handle(ids[1], { type: 'buffering', position: 3 });
		expect(conns[0].lastState()!.waiting).toBe(false);
		// …until the lagging period is over.
		clock.advance(LAGGING_MS + 1);
		room.handle(ids[1], { type: 'buffering', position: 3 });
		expect(conns[0].lastState()).toMatchObject({ waiting: true, position: 3 });
	});

	it('a stall holds the group longer than an intent', () => {
		const { room, conns, ids, clock } = setup(['Ana', 'Ben'], { playing: true });
		room.handle(ids[1], { type: 'buffering', position: 50 });
		room.handle(ids[0], { type: 'ready', seq: conns[0].lastState()!.seq });
		clock.advance(WAIT_TIMEOUT_MS);
		room.tick();
		expect(conns[0].lastState()!.waiting).toBe(true);
		clock.advance(STALL_TIMEOUT_MS - WAIT_TIMEOUT_MS);
		room.tick();
		expect(conns[0].lastState()!.waiting).toBe(false);
	});

	it('pause cancels a wait; seeking while paused just moves', () => {
		const { room, conns, ids } = setup();
		room.handle(ids[0], { type: 'play', position: 5 });
		room.handle(ids[1], { type: 'pause', position: 6 });
		expect(conns[0].lastState()).toMatchObject({ playing: false, waiting: false, position: 6 });
		room.handle(ids[1], { type: 'seek', position: 60 });
		expect(conns[0].lastState()).toMatchObject({ playing: false, waiting: false, position: 60 });
		expect(conns[0].events()).toContain('Ben jumped to 1m');
	});

	it('ignores a play while already running', () => {
		const { room, conns, ids } = setup(['Ana', 'Ben'], { playing: true });
		const before = conns[0].of('state').length;
		room.handle(ids[1], { type: 'play', position: 999 });
		expect(conns[0].of('state').length).toBe(before);
	});

	it('a disconnect stops holding a wait', () => {
		const { room, conns, ids } = setup();
		room.handle(ids[0], { type: 'play', position: 0 });
		room.handle(ids[0], { type: 'ready', seq: conns[0].lastState()!.seq });
		room.disconnect(ids[1], conns[1]);
		expect(conns[0].lastState()!.waiting).toBe(false);
	});
});

describe('Room media', () => {
	it('changes episode once, holding at the start', () => {
		const { room, conns, ids } = setup(['Ana', 'Ben'], { playing: true, position: 1_200 });
		const media = { kind: 'series' as const, slug: 'show', episodeSlug: 'e2' };
		room.handle(ids[0], { type: 'media', media, label: 'S1 E2' });
		room.handle(ids[1], { type: 'media', media, label: 'S1 E2' });
		const changes = conns[0].events().filter((e) => e.includes('started'));
		expect(changes).toEqual(['Ana started S1 E2']);
		expect(conns[0].lastState()).toMatchObject({ media, waiting: true, position: 0 });
	});

	it('refuses another title', () => {
		const { room, conns, ids } = setup();
		room.handle(ids[0], {
			type: 'media',
			media: { kind: 'series', slug: 'other', episodeSlug: 'x' },
			label: ''
		});
		expect(conns[0].lastState()).toBeUndefined();
	});
});

describe('Room people', () => {
	it('keeps a seat through a quick reconnect, silently', () => {
		const { room, conns, ids, clock } = setup();
		room.disconnect(ids[1], conns[1]);
		clock.advance(RECONNECT_GRACE_MS - 1);
		room.tick();
		const again = new FakeConnection();
		const rejoined = room.join(identity('Ben'), again, ids[1]);
		expect(rejoined).toEqual({ ok: true, participantId: ids[1] });
		expect(again.of('welcome')).toHaveLength(1);
		expect(conns[0].events().filter((e) => e.startsWith('Ben'))).toEqual(['Ben joined']);
	});

	it('announces a leave after the grace period and hands off the host', () => {
		const { room, conns, ids, clock } = setup(['Ana', 'Ben', 'Cy']);
		room.disconnect(ids[0], conns[0]);
		clock.advance(RECONNECT_GRACE_MS);
		room.tick();
		expect(conns[1].events()).toEqual(expect.arrayContaining(['Ana left', 'Ben is now the host']));
		const people = conns[1].of('participants').at(-1)!.participants;
		expect(people.map((p) => [p.name, p.isHost])).toEqual([
			['Ben', true],
			['Cy', false]
		]);
	});

	it('leaving on purpose skips the grace period', () => {
		const { room, conns, ids } = setup();
		room.leave(ids[1], conns[1]);
		expect(conns[0].events()).toContain('Ben left');
		expect(conns[0].of('participants').at(-1)!.participants).toHaveLength(1);
	});

	it('ends when the last person leaves on purpose', () => {
		const { room, conns, ids } = setup(['Ana']);
		room.leave(ids[0], conns[0]);
		expect(room.ended).toBe(true);
		expect(room.join(identity('Ben'), new FakeConnection())).toEqual({
			ok: false,
			reason: 'ended'
		});
	});

	it('ends when the last seat outlives its grace, but a quick reload rejoins', () => {
		const { room, conns, ids, clock } = setup(['Ana']);
		room.disconnect(ids[0], conns[0]);
		clock.advance(RECONNECT_GRACE_MS - 1);
		room.tick();
		expect(room.ended).toBe(false);
		const again = new FakeConnection();
		expect(room.join(identity('Ana'), again, ids[0])).toEqual({ ok: true, participantId: ids[0] });

		room.disconnect(ids[0], again);
		clock.advance(RECONNECT_GRACE_MS);
		room.tick();
		expect(room.ended).toBe(true);
	});

	it('a seat in its grace period keeps the party alive after the other leaves', () => {
		const { room, conns, ids, clock } = setup();
		room.disconnect(ids[1], conns[1]);
		room.leave(ids[0], conns[0]);
		expect(room.ended).toBe(false);
		clock.advance(RECONNECT_GRACE_MS);
		room.tick();
		expect(room.ended).toBe(true);
	});

	it("won't resume someone else's seat", () => {
		const { room, ids } = setup();
		const joined = room.join(identity('Cy'), new FakeConnection(), ids[1]);
		expect(joined.ok && joined.participantId).not.toBe(ids[1]);
	});

	it('only the host removes people, and they stay out', () => {
		const { room, conns, ids } = setup();
		room.handle(ids[1], { type: 'kick', participantId: ids[0] });
		expect(conns[0].closed).toBeNull();
		room.handle(ids[0], { type: 'kick', participantId: ids[1] });
		expect(conns[1].of('ended')[0]).toMatchObject({ reason: 'kicked' });
		expect(conns[1].closed).not.toBeNull();
		expect(room.join(identity('Ben'), new FakeConnection())).toEqual({
			ok: false,
			reason: 'kicked'
		});
	});

	it('the host ends it for everyone', () => {
		const { room, conns, ids } = setup();
		room.handle(ids[1], { type: 'end' });
		expect(room.ended).toBe(false);
		room.handle(ids[0], { type: 'end' });
		expect(room.ended).toBe(true);
		expect(conns[1].of('ended')[0].message).toBe('Ana ended the watch party.');
	});

	it('is full at MAX_PARTICIPANTS', () => {
		const { room } = setup(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
		expect(room.join(identity('I'), new FakeConnection())).toEqual({ ok: false, reason: 'full' });
	});
});

describe('Room chat', () => {
	it('trims, drops empty lines and rate-limits', () => {
		const { room, conns, ids, clock } = setup();
		room.handle(ids[0], { type: 'chat', text: '   ' });
		for (let i = 0; i < CHAT_RATE + 2; i++)
			room.handle(ids[0], { type: 'chat', text: ` hi ${i} ` });
		const lines = conns[1].of('chat').filter((m) => m.entry.kind === 'message');
		expect(lines).toHaveLength(CHAT_RATE);
		expect(lines[0].entry.text).toBe('hi 0');
		expect(conns[0].of('error')).toHaveLength(2);

		clock.advance(5_001);
		room.handle(ids[0], { type: 'chat', text: 'again' });
		expect(conns[1].of('chat').at(-1)!.entry.text).toBe('again');
	});

	it('replays the history to newcomers', () => {
		const { room, ids } = setup();
		room.handle(ids[0], { type: 'chat', text: 'before you came' });
		const late = new FakeConnection();
		room.join(identity('Cy'), late);
		const history = late.of('welcome')[0].chat.map((c) => c.text);
		expect(history).toContain('before you came');
	});

	it('answers pings with the hub clock', () => {
		const { room, conns, ids, clock } = setup();
		room.handle(ids[0], { type: 'ping', t0: 7 });
		expect(conns[0].of('pong')[0]).toEqual({ type: 'pong', t0: 7, serverTime: clock.now() });
	});
});
