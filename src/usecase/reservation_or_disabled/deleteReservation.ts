import { Pool } from '@neondatabase/serverless';
import { UuidValue } from '../../domain/UuidValue';
import { findReservationByRordIdForDelete } from '../../repositories/reservation_or_disabled/findReservationByRordIdForDelete';
import { err, ok, Result } from 'neverthrow';
import { UserIdValue } from '../../domain/UserIdValue';
import { deleteReservationByRordId } from '../../repositories/reservation_or_disabled/deleteReservationByRordId';

export async function deleteReservation(
	dependencies: {
		pool: Pool;
	},
	user_id: UserIdValue,
	rord_uuid: UuidValue
): Promise<Result<void, Error>> {
	// まず予約の詳細を取得
	const reservation_for_delete = await findReservationByRordIdForDelete(dependencies, rord_uuid);
	if (reservation_for_delete.isErr()) {
		return err(new Error('Failed to fetch reservation'));
	}
	if (reservation_for_delete.value.status !== 'reserved' || reservation_for_delete.value.user_id === null) {
		return err(new Error('予約ではなく、利用禁止の日時です。'));
	}
	if (reservation_for_delete.value.user_id.user_id !== user_id.user_id) {
		return err(new Error('他のユーザの予約はキャンセルできません。'));
	}

	const now_date = new Date();
	// 過去の予約はキャンセルできない
	if (reservation_for_delete.value.date.getTime() - now_date.getTime() < 0) {
		return err(new Error('過去の予約はキャンセルできません。'));
	}

	// 予約を削除
	const delete_reservation_result = await deleteReservationByRordId(dependencies, rord_uuid);
	if (delete_reservation_result.isErr()) {
		return err(new Error('Failed to delete reservation'));
	}

	return ok(undefined);
}
