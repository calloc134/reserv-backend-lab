import { Result, err, ok } from 'neverthrow';
import { UuidValue } from '../../domain/UuidValue';
import { Sql } from 'postgres';

import { SlotValue } from '../../domain/SlotValue';

// sql`
// SELECT count(*)::int FROM reservation_or_disabled WHERE room_uuid = ${room_uuid_result.value.uuid}::uuid AND date = ${date} AND slot = ${slot_result.value.slot}::slot;
// `
// );

export async function existsReservationByDateSlotRoomId(
	dependencies: { db: Sql },
	room_uuid: UuidValue,
	date: Date,
	slot: SlotValue
): Promise<Result<boolean, Error>> {
	const { db } = dependencies;
	const rows = await db<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM reservation_or_disabled
    WHERE room_uuid = ${room_uuid.uuid} AND date = ${date} AND slot = ${slot.slot};
  `;
	if (rows[0].count === 0) {
		return ok(false);
	} else if (rows[0].count === 1) {
		return ok(true);
	}

	return err(new Error('Unexpected count'));
}
