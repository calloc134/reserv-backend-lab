import { SlotValue } from './SlotValue';
import { UserIdValue } from './UserIdValue';
import { UuidValue } from './UuidValue';

export type ReservationOrDisabledForDelete = {
	// rord_uuid: UuidValue;
	status: 'reserved' | 'disabled';
	date: Date;
	// slot: SlotValue;
	// ユーザに関してはIDで依存している
	user_id: UserIdValue | null;
};
