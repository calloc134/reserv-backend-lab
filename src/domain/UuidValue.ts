import { uuidv7 } from 'uuidv7';
import { err, ok, Result } from 'neverthrow';

export type UuidValue = {
	uuid: string;
};

export function createUuidValue(): UuidValue {
	const id = uuidv7();
	return { uuid: id };
}

export function newUuidValue(uuid: string): Result<UuidValue, Error> {
	const uuidRegex = new RegExp(/^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	if (!uuidRegex.test(uuid)) {
		return err(new Error('Invalid UUID'));
	}
	return ok({ uuid });
}
