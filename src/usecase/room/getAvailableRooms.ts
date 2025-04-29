import { Sql } from 'postgres';
import { Result } from 'neverthrow';
import { Room } from '../../domain/Room';
import { findAvailableRooms } from '../../repositories/room/findAvailableRooms';
import { SlotValue } from '../../domain/SlotValue';

export async function getAvailableRooms(dependencies: { db: Sql }, date: Date, slot: SlotValue): Promise<Result<Room[], Error>> {
	const { db } = dependencies;
	const result = await findAvailableRooms({ db }, date, slot);
	return result;
}
