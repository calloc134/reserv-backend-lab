// }>(
//     sql`
//     SELECT
//         rord.rord_uuid,
//         rord.room_uuid,
//         room.name as room_name,
//         rord.status,
//         rord.date,
//         rord.slot,
//         CASE
//             WHEN rord.status = 'reserved' THEN res.user_id
//             ELSE NULL
//         END AS user_id
//     FROM
//         reservation_or_disabled rord
//     INNER JOIN
//         room
//     ON
//         rord.room_uuid = room.room_uuid
//     LEFT JOIN
//         reservation res
//     ON
//         rord.reservation_uuid = res.reservation_uuid
//     WHERE
//         (rord.status = 'disabled' OR res.user_id = ${clerk_user_id_result.value.user_id}::text) AND rord.date >= ${start_date} AND rord.date <= ${end_date}
//     ORDER BY
//         rord.date,
//         rord.slot;
// `

import { Result, err, ok } from 'neverthrow';
import { Pool } from '@neondatabase/serverless';
import { sql } from '@ts-safeql/sql-tag';
import { newUuidValue } from '../../domain/UuidValue';
import { newSlotValue } from '../../domain/SlotValue';
import { ReservationOrDisabledWithRoom } from '../../domain/ReservationOrDisabledWithRoom';
import { newNameValue } from '../../domain/NameValue';
import { newUserIdValue } from '../../domain/UserIdValue';

export async function findReservationByDateRange(
	dependencies: { pool: Pool },
	start_date: Date,
	end_date: Date
): Promise<Result<ReservationOrDisabledWithRoom[], Error>> {
	const { pool } = dependencies;

	const sql_response = await pool.query<{ rord_uuid: string; room_uuid: string; room_name: string; status: 'reserved' | 'disabled'; date: Date; slot: 'first' | 'second' | 'third' | 'fourth' | 'fifth'; user_id: string | null }>(sql`
    SELECT 
        rord.rord_uuid,
        rord.room_uuid,
        room.name as room_name,
        rord.status,
        rord.date,
        rord.slot,
        CASE 
            WHEN rord.status = 'reserved' THEN res.user_id
            ELSE NULL
        END AS user_id
    FROM 
        reservation_or_disabled rord
    INNER JOIN
        room
    ON
        rord.room_uuid = room.room_uuid
    LEFT JOIN 
        reservation res 
    ON 
        rord.reservation_uuid = res.reservation_uuid
	WHERE 
				rord.date >= ${start_date} AND rord.date <= ${end_date}
    ORDER BY 
        rord.date, 
        rord.slot;
`);

	// エンティティの詰め替え
	const reservation_or_disabled_with_room: ReservationOrDisabledWithRoom[] = [];

	for (const row of sql_response.rows) {
		const rord_uuid_result = newUuidValue(row.rord_uuid);
		if (rord_uuid_result.isErr()) {
			return err(rord_uuid_result.error);
		}

		const room_uuid_result = newUuidValue(row.room_uuid);
		if (room_uuid_result.isErr()) {
			return err(room_uuid_result.error);
		}

		if (row.status !== 'reserved' && row.status !== 'disabled') {
			return err(new Error('Unexpected status'));
		}

		const room_name_result = newNameValue(row.room_name);
		if (room_name_result.isErr()) {
			return err(room_name_result.error);
		}

		const slot_result = newSlotValue(row.slot);
		if (slot_result.isErr()) {
			return err(slot_result.error);
		}

		const user_id_result = row.user_id ? newUserIdValue(row.user_id) : null;
		if (user_id_result && user_id_result.isErr()) {
			return err(user_id_result.error);
		}

		reservation_or_disabled_with_room.push({
			rord_uuid: rord_uuid_result.value,
			room_uuid: room_uuid_result.value,
			room_name: room_name_result.value,
			status: row.status,
			date: row.date,
			slot: slot_result.value,
			user_id: user_id_result ? user_id_result.value : null,
		});
	}

	return ok(reservation_or_disabled_with_room);
}
