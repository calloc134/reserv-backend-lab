import { Sql } from 'postgres';
import { err, ok, Result } from 'neverthrow';
import { Room } from '../../domain/Room';
import { existsRoomByUuid } from '../../repositories/room/existsRoomByUuid';
import { existsReservationByDateSlotRoomId } from '../../repositories/reservation_or_disabled/existsReservationByDateSlotRoomId';
import { createDisabled } from '../../repositories/reservation_or_disabled/createDisabled';
import { SlotValue } from '../../domain/SlotValue';
import { createUuidValue, UuidValue } from '../../domain/UuidValue';

export async function toDisable(
	dependencies: { db: Sql },
	room_uuid: UuidValue,
	date: Date,
	slot: SlotValue
): Promise<Result<void, Error>> {
	// まず部屋が存在するか確認
	const { db } = dependencies;
	const exist_room_result = await existsRoomByUuid({ db }, room_uuid);
	if (exist_room_result.isErr()) {
		return err(exist_room_result.error);
	}
	if (!exist_room_result.value) {
		return err(new Error('部屋が存在しません'));
	}

	// 予約が存在しないことを確認
	const exist_reservation_result = await existsReservationByDateSlotRoomId({ db }, room_uuid, date, slot);
	if (exist_reservation_result.isErr()) {
		return err(exist_reservation_result.error);
	}
	if (exist_reservation_result.value) {
		return err(new Error('既に予約が存在します'));
	}

	// uuid作成
	const uuid = createUuidValue();

	// 予約を無効化
	const create_disabled_result = await createDisabled({ db }, uuid, slot, date, room_uuid);
	if (create_disabled_result.isErr()) {
		return err(create_disabled_result.error);
	}

	return ok(undefined);
}
