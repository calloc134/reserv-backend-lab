import { Result, ok, err } from 'neverthrow';

export type UserIdValue = {
	user_id: string;
};

export function newUserIdValue(user_id: string): Result<UserIdValue, Error> {
	const userIdRegex = new RegExp(/^user_[A-Za-z0-9]+$/);
	if (!userIdRegex.test(user_id)) {
		return err(new Error('Invalid user id'));
	}
	return ok({ user_id });
}
