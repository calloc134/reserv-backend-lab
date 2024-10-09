import { Result, err, ok } from 'neverthrow';
import { UuidValue } from '../../domain/UuidValue';
import { Pool } from '@neondatabase/serverless';
import { sql } from '@ts-safeql/sql-tag';

import { SlotValue } from '../../domain/SlotValue';

// sql`
// SELECT count(*)::int FROM reservation_or_disabled WHERE room_uuid = ${room_uuid_result.value.uuid}::uuid AND date = ${date} AND slot = ${slot_result.value.slot}::slot;
// `
// );

export async function existsReservationByDateSlotRoomId(
	dependencies: { pool: Pool },
	room_uuid: UuidValue,
	date: Date,
	slot: SlotValue
): Promise<Result<boolean, Error>> {
	const { pool } = dependencies;

	const sql_response = await pool.query<{ count: number }>(sql`
        SELECT COUNT(*)::int FROM reservation_or_disabled WHERE room_uuid = ${room_uuid.uuid}::uuid AND date = ${date} AND slot = ${slot.slot}::slot;
    `);

	if (sql_response.rows[0].count === 0) {
		return ok(false);
	} else if (sql_response.rows[0].count === 1) {
		return ok(true);
	}

	return err(new Error('Unexpected count'));
}
