import { Result, err, ok } from 'neverthrow';
import { UuidValue } from '../../domain/UuidValue';
import { Pool } from '@neondatabase/serverless';
import { sql } from '@ts-safeql/sql-tag';

export async function existsRoomByUuid(dependencies: { pool: Pool }, room_uuid: UuidValue): Promise<Result<boolean, Error>> {
	const { pool } = dependencies;

	const sql_response = await pool.query<{ count: number }>(sql`
        SELECT COUNT(*)::int FROM room WHERE room_uuid = ${room_uuid.uuid}::uuid;
    `);

	if (sql_response.rows[0].count === 0) {
		return ok(false);
	} else if (sql_response.rows[0].count === 1) {
		return ok(true);
	}

	return err(new Error('Unexpected count'));
}
