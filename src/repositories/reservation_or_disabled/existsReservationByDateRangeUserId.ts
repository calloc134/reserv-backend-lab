// sql`
// SELECT count(*)::int FROM reservation_or_disabled rord
// LEFT JOIN reservation res ON rord.reservation_uuid = res.reservation_uuid
// WHERE res.user_id = ${user_id_result.value.user_id}::text AND rord.date >= ${start_date} AND rord.date <= ${end_date};
// `
// );

import { Result, err, ok } from 'neverthrow';
import { Pool } from '@neondatabase/serverless';
import { sql } from '@ts-safeql/sql-tag';
import { UserIdValue } from '../../domain/UserIdValue';

export async function existsReservationByDateRangeUserId(
	dependencies: { pool: Pool },
	user_id: UserIdValue,
	start_date: Date,
	end_date: Date
): Promise<Result<boolean, Error>> {
	const { pool } = dependencies;

	const sql_response = await pool.query<{ count: number }>(sql`
        SELECT COUNT(*)::int FROM reservation_or_disabled rord
        LEFT JOIN reservation res ON rord.reservation_uuid = res.reservation_uuid
        WHERE res.user_id = ${user_id.user_id} AND rord.date >= ${start_date} AND rord.date <= ${end_date};
    `);

	// 予約が複数存在したらおかしいので
	if (sql_response.rows[0].count === 0) {
		return ok(false);
	} else if (sql_response.rows[0].count === 1) {
		return ok(true);
	}

	return err(new Error('Unexpected count'));
}
