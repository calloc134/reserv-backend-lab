import { Sql } from 'postgres';
import { Room } from '../../domain/Room';
import { err, ok, Result } from 'neverthrow';
import { newUuidValue } from '../../domain/UuidValue';

export async function findRooms(dependencies: { db: Sql }): Promise<Result<Room[], Error>> {
	const { db } = dependencies;

	const rows = await db<{ room_uuid: string; name: string }[]>`
    SELECT * FROM room ORDER BY room_uuid;
  `;

	const result: Room[] = [];

	for (const row of rows) {
		const uuid_result = newUuidValue(row.room_uuid);

		if (uuid_result.isErr()) {
			return err(uuid_result.error);
		}

		const uuid = uuid_result.value;

		result.push({
			room_uuid: uuid,
			name: row.name,
		});
	}

	return ok(result);
}
