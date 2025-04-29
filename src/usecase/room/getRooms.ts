import { Result } from 'neverthrow';
import { Room } from '../../domain/Room';
import { Sql } from 'postgres';
import { findRooms } from '../../repositories/room/findRooms';

export async function getRooms(dependencies: { db: Sql }): Promise<Result<Room[], Error>> {
	const { db } = dependencies;
	const result = await findRooms({ db });
	return result;
}
