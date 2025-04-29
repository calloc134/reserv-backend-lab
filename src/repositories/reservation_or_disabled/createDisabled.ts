// (sql`
//     INSERT INTO reservation_or_disabled (rord_uuid, slot, date, room_uuid, status) VALUES
//         (${uuid.uuid}::uuid, ${slot_result.value.slot}::slot, ${date_result.value}, ${room_uuid_result.value.uuid}::uuid, 'disabled')
//         RETURNING rord_uuid, slot, date, room_uuid;
// `);

import { Result, err, ok } from 'neverthrow';
import { Sql } from 'postgres';

import { UuidValue } from '../../domain/UuidValue';
import { SlotValue } from '../../domain/SlotValue';

export async function createDisabled(dependencies: { db: Sql }, rord_uuid: UuidValue, slot: SlotValue, date: Date, room_uuid: UuidValue) {
	const { db } = dependencies;

	const throwWrapper = async () => {
		try {
			const rows = await db<{
				rord_uuid: string;
				slot: 'first' | 'second' | 'third' | 'fourth' | 'fifth';
				date: Date;
				room_uuid: string;
			}>`
        INSERT INTO reservation_or_disabled (rord_uuid, slot, date, room_uuid, status)
        VALUES (${rord_uuid.uuid}, ${slot.slot}, ${date}, ${room_uuid.uuid}, 'disabled')
        RETURNING rord_uuid, slot, date, room_uuid;
      `;

			return ok(rows);
		} catch (e) {
			return err(e as Error);
		}
	};

	const result = await throwWrapper();

	if (result.isErr()) {
		return result;
	}

	if (result.value.length !== 1) {
		return err(new Error('Unexpected count'));
	}

	return ok(undefined);
}
