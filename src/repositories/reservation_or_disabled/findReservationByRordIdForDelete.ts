// sql`
// SELECT rord.status, rord.date, res.user_id FROM reservation_or_disabled rord LEFT JOIN reservation res ON rord.reservation_uuid = res.reservation_uuid WHERE rord.rord_uuid = ${rord_uuid_result.value.uuid}::uuid;
// `

import { Result, err, ok } from 'neverthrow';
import { Pool } from '@neondatabase/serverless';
import { sql } from '@ts-safeql/sql-tag';

import { UuidValue } from '../../domain/UuidValue';
import { ReservationOrDisabledForDelete } from '../../domain/ReservationOrDisabledForDelete';
import { newUserIdValue } from '../../domain/UserIdValue';

export async function findReservationByRordIdForDelete(
	dependencies: { pool: Pool },
	rord_uuid: UuidValue
): Promise<Result<ReservationOrDisabledForDelete, Error>> {
	const { pool } = dependencies;

	const sql_response = await pool.query<{ status: 'reserved' | 'disabled'; date: Date; user_id: string | null }>(
		sql`SELECT rord.status, rord.date, res.user_id FROM reservation_or_disabled rord LEFT JOIN reservation res ON rord.reservation_uuid = res.reservation_uuid WHERE rord.rord_uuid = ${rord_uuid.uuid}::uuid;`
	);

	if (sql_response.rows.length !== 1) {
		return err(new Error('Unexpected count'));
	}

	const user_id = sql_response.rows[0].user_id ? newUserIdValue(sql_response.rows[0].user_id) : null;
	if (user_id && user_id.isErr()) {
		return err(user_id.error);
	}

	return ok({
		status: sql_response.rows[0].status,
		date: sql_response.rows[0].date,
		user_id: user_id ? user_id.value : null,
	});
}
