// (sql`
//     INSERT INTO reservation_or_disabled (rord_uuid, slot, date, room_uuid, status) VALUES
//         (${uuid.uuid}::uuid, ${slot_result.value.slot}::slot, ${date_result.value}, ${room_uuid_result.value.uuid}::uuid, 'disabled')
//         RETURNING rord_uuid, slot, date, room_uuid;
// `);

import { Result, err, ok } from 'neverthrow';
import { Pool } from '@neondatabase/serverless';
import { sql } from '@ts-safeql/sql-tag';

import { UuidValue } from '../../domain/UuidValue';
import { SlotValue } from '../../domain/SlotValue';

export async function createDisabled(
	dependencies: { pool: Pool },
	rord_uuid: UuidValue,
	slot: SlotValue,
	date: Date,
	room_uuid: UuidValue
): Promise<Result<void, Error>> {
	const { pool } = dependencies;

	const throwWrapper = async () => {
		try {
			const result = await pool.query<{
				rord_uuid: string;
				slot: 'first' | 'second' | 'third' | 'fourth' | 'fifth';
				date: Date;
				room_uuid: string;
			}>(
				sql`
    INSERT INTO reservation_or_disabled (rord_uuid, slot, date, room_uuid, status) VALUES
        (${rord_uuid.uuid}::uuid, ${slot.slot}::slot, ${date}, ${room_uuid.uuid}::uuid, 'disabled')
        RETURNING rord_uuid, slot, date, room_uuid;
`
			);

			return ok(result);
		} catch (e) {
			return err(e as Error);
		}
	};

	const result = await throwWrapper();

	if (result.isErr()) {
		return result;
	}

	if (result.value.rows.length !== 1) {
		return err(new Error('Unexpected count'));
	}

	return ok(undefined);
}
