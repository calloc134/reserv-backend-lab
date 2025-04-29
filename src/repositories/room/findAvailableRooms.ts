import { Sql } from 'postgres';
import { Room } from '../../domain/Room';
import { err, ok, Result } from 'neverthrow';
import { newUuidValue } from '../../domain/UuidValue';
import { SlotValue } from '../../domain/SlotValue';

export async function findAvailableRooms(dependencies: { db: Sql }, date: Date, slot: SlotValue): Promise<Result<Room[], Error>> {
	const { db } = dependencies;

	const rows = await db<{ room_uuid: string; name: string }[]>`
    SELECT room_uuid, name
    FROM room
    WHERE room_uuid NOT IN (
      SELECT room_uuid FROM reservation_or_disabled WHERE date = ${date} AND slot = ${slot.slot}::slot
    )
    ORDER BY room_uuid;
  `;

	const result: Room[] = [];

	for (const row of rows) {
		const uuid_result = newUuidValue(row.room_uuid);

		if (uuid_result.isErr()) {
			return err(uuid_result.error);
		}

		const uuid = uuid_result.value;

		result.push({
			room_uuid: uuid,
			name: row.name,
		});
	}

	return ok(result);
}
