import { ClerkClient } from '@clerk/backend';
import { type User } from '../../domain/User';
import { err, ok, type Result } from 'neverthrow';
import { newUserIdValue, UserIdValue } from '../../domain/UserIdValue';

export async function findByUserIds(
	dependencies: {
		clerkClient: ClerkClient;
	},
	userIds: UserIdValue[]
): Promise<Result<User[], Error>> {
	const clerk_response = await dependencies.clerkClient.users.getUserList({
		userId: userIds.map((userId) => userId.user_id),
		limit: 100,
	});

	// 長さが0の場合はエラーと考えられる
	if (clerk_response.totalCount === 0) {
		return err(new Error('User not found'));
	}

	const result: User[] = [];
	for (const user of clerk_response.data) {
		if (!user || !user.id) {
			return err(new Error('User not found'));
		}

		const user_id_result = newUserIdValue(user.id);

		if (user_id_result.isErr()) {
			return err(user_id_result.error);
		}

		// firstName, lastNameは空文字を許容
		result.push({
			user_id: user_id_result.value,
			firstName: user.firstName || '',
			lastName: user.lastName || '',
		});
	}

	return ok(result);
}
