import { Sql } from 'postgres';

import { Result, err, ok } from 'neverthrow';

import { UuidValue } from '../../domain/UuidValue';
import { SlotValue } from '../../domain/SlotValue';
import { UserIdValue } from '../../domain/UserIdValue';

export async function createReservation(
	dependencies: { db: Sql },
	rord_uuid: UuidValue,
	reservation_uuid: UuidValue,
	user_id: UserIdValue,
	room_uuid: UuidValue,
	date: Date,
	slot: SlotValue
): Promise<Result<void, Error>> {
	const { db } = dependencies;
	try {
		const rows1 = await db<{ reservation_uuid: string }[]>`
      INSERT INTO reservation (reservation_uuid, user_id)
      VALUES (${reservation_uuid.uuid}::uuid, ${user_id.user_id})
      RETURNING reservation_uuid;
    `;
		if (rows1.length !== 1) {
			return err(new Error('Failed to create reservation'));
		}
		const rows2 = await db<{ rord_uuid: string }[]>`
      INSERT INTO reservation_or_disabled (rord_uuid, room_uuid, date, slot, status, reservation_uuid)
      VALUES (${rord_uuid.uuid}::uuid, ${room_uuid.uuid}::uuid, ${date}, ${slot.slot}::slot, 'reserved', ${reservation_uuid.uuid}::uuid)
      RETURNING rord_uuid;
    `;
		if (rows2.length !== 1) {
			return err(new Error('Failed to create reservation_or_disabled'));
		}
		return ok(undefined);
	} catch (error) {
		return err(error as Error);
	}
}
