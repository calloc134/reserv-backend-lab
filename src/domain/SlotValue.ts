import { Result, ok, err } from 'neverthrow';

export type slot = 'first' | 'second' | 'third' | 'fourth';

export type SlotValue = {
	slot: slot;
};

export function newSlotValue(slot: slot): Result<SlotValue, Error> {
	if (slot !== 'first' && slot !== 'second' && slot !== 'third' && slot !== 'fourth') {
		return err(new Error('Slot must be first, second, third or fourth'));
	}
	return ok({ slot });
}
