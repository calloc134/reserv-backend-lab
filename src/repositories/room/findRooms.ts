import { Pool } from '@neondatabase/serverless';
import { Room } from '../../domain/Room';
import { sql } from '@ts-safeql/sql-tag';
import { err, ok, Result } from 'neverthrow';
import { newUuidValue } from '../../domain/UuidValue';

export async function findRooms(dependencies: { pool: Pool }): Promise<Result<Room[], Error>> {
	const { pool } = dependencies;

	const sql_response = await pool.query<{ room_uuid: string; name: string }>(sql`
		SELECT * FROM room ORDER BY room_uuid;
	`);

	const result: Room[] = [];

	for (const row of sql_response.rows) {
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
