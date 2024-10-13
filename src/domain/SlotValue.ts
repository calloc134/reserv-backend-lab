import { Result, ok, err } from 'neverthrow';

export type slot = 'first' | 'second' | 'third' | 'fourth' | 'fifth';

export type SlotValue = {
	slot: slot;
};

export function newSlotValue(slot_raw: string): Result<SlotValue, Error> {
	if (slot_raw !== 'first' && slot_raw !== 'second' && slot_raw !== 'third' && slot_raw !== 'fourth' && slot_raw !== 'fifth') {
		return err(new Error('Slot must be first, second, third, fourth or fifth'));
	}
	return ok({ slot: slot_raw });
}
