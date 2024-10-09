import { ClerkClient } from '@clerk/backend';
import { type UserIdValue } from '../../domain/UserIdValue';
import { type User } from '../../domain/User';
import { err, ok, Result } from 'neverthrow';

export async function findByUserId(
	dependencies: {
		clerkClient: ClerkClient;
	},
	// ここは値オブジェクトを利用しなくても別に良いとして許容
	userId: string
): Promise<Result<User, Error>> {
	const clerk_response = await dependencies.clerkClient.users.getUser(userId);

	if (!clerk_response || !clerk_response.id) {
		return err(new Error('User not found'));
	}

	// firstName, lastNameは空文字を許容
	const result = {
		user_id: clerk_response.id,
		firstName: clerk_response.firstName || '',
		lastName: clerk_response.lastName || '',
	};

	return ok(result);
}
