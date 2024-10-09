import { NameValue } from './NameValue';
import { SlotValue } from './SlotValue';
import { UserIdValue } from './UserIdValue';
import { UuidValue } from './UuidValue';

export type ReservationOrDisabledWithRoom = {
	rord_uuid: UuidValue;
	status: 'reserved' | 'disabled';
	date: Date;
	slot: SlotValue;
	// ユーザに関してはIDで依存している
	user_id: UserIdValue | null;
	// 部屋の情報はここに含まれるようにしている
	// 実際のテーブルのデータ型とは異なるが差異を許容
	room_uuid: UuidValue;
	room_name: NameValue;
};
