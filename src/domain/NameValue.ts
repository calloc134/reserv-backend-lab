import { err, ok, Result } from 'neverthrow';

export type NameValue = {
	name: string;
};

export function newNameValue(name: string): Result<NameValue, Error> {
	if (name.length < 3) {
		return err(new Error('Name must be at least 3 characters long'));
	}

	if (name.length > 20) {
		return err(new Error('Name must be at most 20 characters long'));
	}

	return ok({ name });
}
