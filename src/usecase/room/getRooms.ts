import { Result } from 'neverthrow';
import { Room } from '../../domain/Room';
import { Pool } from '@neondatabase/serverless';
import { findRooms } from '../../repositories/room/findRooms';

export async function getRooms(dependencies: { pool: Pool }): Promise<Result<Room[], Error>> {
	const result = await findRooms(dependencies);
	return result;
}
