import { randomBytes } from 'node:crypto';
import type { TogetherMedia } from '$lib/data/together';
import { log } from '$lib/server/log';
import { Room, type TogetherIdentity } from './room';

/** Live parties per account; creating one first drops that account's empty ones. */
export const MAX_ROOMS_PER_USER = 3;
/**
 * A party nobody has been connected to for this long is over. Rooms end on
 * their own when the last seat goes (Room#remove), so this only reaps rooms
 * that were created but never joined.
 */
export const EMPTY_ROOM_TTL_MS = 2 * 60_000;
const TICK_MS = 1_000;
const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 10;

export class TooManyRoomsError extends Error {}

/**
 * Every live watch party, in memory. The hub is single-process by design (same
 * assumption as GatewayRegistry and SessionManager): a restart ends parties,
 * and their clients fall back to watching on their own.
 */
class RoomManager {
	#rooms = new Map<string, Room>();
	#timer: ReturnType<typeof setInterval> | null = null;

	create(owner: TogetherIdentity, media: TogetherMedia, position: number, playing: boolean): Room {
		for (const room of this.#rooms.values()) {
			if (room.ownerUserId === owner.userId && room.connectedCount === 0)
				this.#remove(room, 'gone');
		}
		const owned = [...this.#rooms.values()].filter((r) => r.ownerUserId === owner.userId);
		if (owned.length >= MAX_ROOMS_PER_USER) {
			throw new TooManyRoomsError('You already have several watch parties going. End one first.');
		}
		let code = newCode();
		while (this.#rooms.has(code)) code = newCode();
		const room = new Room(code, owner, media, position, playing);
		this.#rooms.set(code, room);
		this.#ensureTicking();
		log.info({ code, media }, 'watch party created');
		return room;
	}

	get(code: string): Room | undefined {
		const room = this.#rooms.get(code);
		return room && !room.ended ? room : undefined;
	}

	#tick(): void {
		const now = Date.now();
		for (const room of this.#rooms.values()) {
			room.tick();
			if (room.ended) this.#rooms.delete(room.code);
			else if (room.connectedCount === 0 && now - room.lastOccupiedAt > EMPTY_ROOM_TTL_MS) {
				this.#remove(room, 'gone');
			}
		}
		if (this.#rooms.size === 0 && this.#timer) {
			clearInterval(this.#timer);
			this.#timer = null;
		}
	}

	#remove(room: Room, reason: 'gone' | 'ended'): void {
		room.end(reason, 'This watch party has ended.');
		this.#rooms.delete(room.code);
		log.info({ code: room.code, reason }, 'watch party closed');
	}

	#ensureTicking(): void {
		if (this.#timer) return;
		this.#timer = setInterval(() => this.#tick(), TICK_MS);
		this.#timer.unref?.();
	}
}

/** Unguessable and easy to read aloud: no 0/o/1/l. 32^10 ≈ 1e15. */
function newCode(): string {
	const bytes = randomBytes(CODE_LENGTH);
	let code = '';
	for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
	return code;
}

export const togetherRooms = new RoomManager();
