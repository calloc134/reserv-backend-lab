import { ClerkClient } from '@clerk/backend';
import { type User } from '../../domain/User';
import { err, ok, Result } from 'neverthrow';
import { newUserIdValue, UserIdValue } from '../../domain/UserIdValue';

export async function findByUserId(
	dependencies: {
		clerkClient: ClerkClient;
	},
	// ここは値オブジェクトを利用しなくても別に良いとして許容
	userId: UserIdValue
): Promise<Result<User, Error>> {
	const clerk_response = await dependencies.clerkClient.users.getUser(userId.user_id);

	if (!clerk_response || !clerk_response.id) {
		return err(new Error('User not found'));
	}

	const user_id_result = newUserIdValue(clerk_response.id);

	if (user_id_result.isErr()) {
		return err(user_id_result.error);
	}

	// firstName, lastNameは空文字を許容
	const result: User = {
		user_id: user_id_result.value,
		firstName: clerk_response.firstName || '',
		lastName: clerk_response.lastName || '',
	};

	return ok(result);
}
