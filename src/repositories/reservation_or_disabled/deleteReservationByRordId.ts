// const result_2 = await pool.query<{ rord_uuid: string }>(
//     sql` DELETE FROM reservation USING reservation_or_disabled WHERE reservation.reservation_uuid = reservation_or_disabled.reservation_uuid AND reservation_or_disabled.rord_uuid = ${rord_uuid_result.value.uuid}::uuid RETURNING rord_uuid;`
// );

import { Result, err, ok } from 'neverthrow';
import { Sql } from 'postgres';
import { UuidValue } from '../../domain/UuidValue';

export async function deleteReservationByRordId(dependencies: { db: Sql }, rord_uuid: UuidValue): Promise<Result<void, Error>> {
	const { db } = dependencies;

	const throwWrapper = async () => {
		try {
			const rows = await db<{ rord_uuid: string }>`
        DELETE FROM reservation
        USING reservation_or_disabled
        WHERE reservation.reservation_uuid = reservation_or_disabled.reservation_uuid
          AND reservation_or_disabled.rord_uuid = ${rord_uuid.uuid}
        RETURNING rord_uuid;
      `;

			// cascadeなのでreservationも消える
			// このやり方が好ましいかはわからない。ビジネスロジックがRDBMSに依存しているということになるが、そもそもこういう需要があるために追加された機能である気もする。

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
