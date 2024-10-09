import { slot } from '../../domain/SlotValue';

export type ReservationResponse = {
	rord_uuid: string;
	user: {
		user_id: string;
		name: string;
	} | null;
	room: {
		room_uuid: string;
		name: string;
	};
	slot: slot;
	date: string;
};
