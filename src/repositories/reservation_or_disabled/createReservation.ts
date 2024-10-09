// sql`
// INSERT INTO reservation (reservation_uuid, user_id) VALUES (${reservation_uuid.uuid}::uuid, ${user_id_result.value.user_id}::text) RETURNING reservation_uuid;
// `

// sql`
// INSERT INTO reservation_or_disabled (rord_uuid, room_uuid, date, slot, status, reservation_uuid) VALUES
// (${reservation_or_disabled_uuid.uuid}::uuid, ${room_uuid_result.value.uuid}::uuid, ${date}, ${slot_result.value.slot}::slot, 'reserved', ${reservation_uuid.uuid}::uuid) RETURNING rord_uuid;
// `

import { Result, err, ok } from 'neverthrow';
import { Pool } from '@neondatabase/serverless';
import { sql } from '@ts-safeql/sql-tag';

import { UuidValue } from '../../domain/UuidValue';
import { SlotValue } from '../../domain/SlotValue';
import { UserIdValue } from '../../domain/UserIdValue';

export async function createReservation(
	dependencies: { pool: Pool },
	rord_uuid: UuidValue,
	reservation_uuid: UuidValue,
	user_id: UserIdValue,
	room_uuid: UuidValue,
	date: Date,
	slot: SlotValue
): Promise<Result<void, Error>> {
	const { pool } = dependencies;

	const throwWrapper = async (): Promise<Result<void, Error>> => {
		try {
			const result_1 = await pool.query<{ reservation_uuid: string }>(
				sql`
                INSERT INTO reservation (reservation_uuid, user_id) VALUES (${reservation_uuid.uuid}::uuid, ${user_id.user_id}::text) RETURNING reservation_uuid;
                `
			);

			if (result_1.rows.length !== 1) {
				return err(new Error('Failed to create reservation'));
			}

			const result_2 = await pool.query<{ rord_uuid: string }>(
				sql`
                INSERT INTO reservation_or_disabled (rord_uuid, room_uuid, date, slot, status, reservation_uuid) VALUES
                (${rord_uuid.uuid}::uuid, ${room_uuid.uuid}::uuid, ${date}, ${slot.slot}::slot, 'reserved', ${reservation_uuid.uuid}::uuid) RETURNING rord_uuid;
                `
			);

			if (result_2.rows.length !== 1) {
				return err(new Error('Failed to create reservation_or_disabled'));
			}

			return ok(undefined);
		} catch (error) {
			return err(error as Error);
		}
	};

	const result = await throwWrapper();

	return result;
}
