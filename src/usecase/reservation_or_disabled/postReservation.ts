import { Pool } from '@neondatabase/serverless';
import { ok, err, Result } from 'neverthrow';
import { createReservation } from '../../repositories/reservation_or_disabled/createReservation';
import { existsReservationByDateSlotRoomId } from '../../repositories/reservation_or_disabled/existsReservationByDateSlotRoomId';
import { existsReservationByDateRangeUserId } from '../../repositories/reservation_or_disabled/existsReservationByDateRangeUserId';
import { SlotValue } from '../../domain/SlotValue';
import { UuidValue, createUuidValue } from '../../domain/UuidValue';
import { UserIdValue, newUserIdValue } from '../../domain/UserIdValue';
import { ClerkClient } from '@clerk/backend';
import { getPreviousMonday } from '../../utils/getPreviousMonday';
import { isWeekday } from '../../utils/isWeekday';

export async function postReservation(
	dependencies: { pool: Pool; clerkClient: ClerkClient },
	room_uuid: UuidValue,
	date: Date,
	slot: SlotValue,
	user_id: UserIdValue
): Promise<Result<void, Error>> {
	const now_date = new Date();
	// 過去の日付は予約できない
	if (date.getTime() - now_date.getTime() < 0) {
		return err(new Error('過去の日付は予約できません。'));
	}

	// 念の為、平日であることを確認
	if (!isWeekday(date)) {
		return err(new Error('平日でない日付です。'));
	}

	const start_date = getPreviousMonday(date);
	const end_date = new Date(start_date.getFullYear(), start_date.getMonth(), start_date.getDate() + 4);

	// 予約が埋まっているか確認
	const exist_reservation_result = await existsReservationByDateSlotRoomId(dependencies, room_uuid, date, slot);
	if (exist_reservation_result.isErr()) {
		return err(new Error('Failed to fetch reservation'));
	}
	if (exist_reservation_result.value) {
		return err(new Error('すでに予約が埋まっています。'));
	}

	// 一週間以内に予約しているか確認
	const exists_reservation_by_date_range_user_id_result = await existsReservationByDateRangeUserId(
		dependencies,
		user_id,
		start_date,
		end_date
	);
	if (exists_reservation_by_date_range_user_id_result.isErr()) {
		return err(new Error('Failed to fetch reservation'));
	}
	if (exists_reservation_by_date_range_user_id_result.value) {
		return err(new Error('一週間以内に予約しています。'));
	}

	// UUIDを生成
	const reservation_or_disabled_uuid = createUuidValue();
	const reservation_uuid = createUuidValue();

	// 予約を作成
	const create_reservation_result = await createReservation(
		dependencies,
		reservation_or_disabled_uuid,
		reservation_uuid,
		user_id,
		room_uuid,
		date,
		slot
	);
	if (create_reservation_result.isErr()) {
		return err(new Error('Failed to create reservation'));
	}

	return ok(undefined);
}
