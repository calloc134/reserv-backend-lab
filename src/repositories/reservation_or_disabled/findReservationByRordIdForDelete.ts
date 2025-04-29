// sql`
// SELECT rord.status, rord.date, res.user_id FROM reservation_or_disabled rord LEFT JOIN reservation res ON rord.reservation_uuid = res.reservation_uuid WHERE rord.rord_uuid = ${rord_uuid_result.value.uuid}::uuid;
// `

import { Result, err, ok } from 'neverthrow';
import { Sql } from 'postgres';

import { UuidValue } from '../../domain/UuidValue';
import { ReservationOrDisabledForDelete } from '../../domain/ReservationOrDisabledForDelete';
import { newUserIdValue } from '../../domain/UserIdValue';

export async function findReservationByRordIdForDelete(
	dependencies: { db: Sql },
	rord_uuid: UuidValue
): Promise<Result<ReservationOrDisabledForDelete, Error>> {
	const { db } = dependencies;

	const rows = await db<{ status: 'reserved' | 'disabled'; date: Date; user_id: string | null }[]>`
    SELECT rord.status, rord.date, res.user_id
    FROM reservation_or_disabled rord
    LEFT JOIN reservation res ON rord.reservation_uuid = res.reservation_uuid
    WHERE rord.rord_uuid = ${rord_uuid.uuid}::uuid;
  `;

	if (rows.length !== 1) {
		return err(new Error('Unexpected count'));
	}

	const row = rows[0];
	const user_id = row.user_id ? newUserIdValue(row.user_id) : null;
	if (user_id && user_id.isErr()) {
		return err(user_id.error);
	}

	return ok({
		status: row.status,
		date: row.date,
		user_id: user_id ? user_id.value : null,
	});
}
