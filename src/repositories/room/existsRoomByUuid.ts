import { Result, err, ok } from 'neverthrow';
import { UuidValue } from '../../domain/UuidValue';
import { Sql } from 'postgres';

export async function existsRoomByUuid(dependencies: { db: Sql }, room_uuid: UuidValue): Promise<Result<boolean, Error>> {
	const { db } = dependencies;
	const rows = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM room WHERE room_uuid = ${room_uuid.uuid}::uuid;
  `;

	const count = rows[0].count;
	if (count === 0) {
		return ok(false);
	} else if (count === 1) {
		return ok(true);
	}

	return err(new Error('Unexpected count'));
}
