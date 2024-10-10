import { Pool } from '@neondatabase/serverless';
import { Result } from 'neverthrow';
import { Room } from '../../domain/Room';
import { findAvailableRooms } from '../../repositories/room/findAvailableRooms';
import { SlotValue } from '../../domain/SlotValue';

export async function getAvailableRooms(dependencies: { pool: Pool }, date: Date, slot: SlotValue): Promise<Result<Room[], Error>> {
	const result = await findAvailableRooms(dependencies, date, slot);
	return result;
}
