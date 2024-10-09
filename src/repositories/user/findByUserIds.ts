import { ClerkClient } from '@clerk/backend';
import { type User } from '../../domain/User';
import { err, ok, type Result } from 'neverthrow';

export async function findByUserIds(
	dependencies: {
		clerkClient: ClerkClient;
	},
	// ここは値オブジェクトを利用しなくても別に良いとして許容
	// userIds: UserIdValue[]
	userIds: string[]
): Promise<Result<User[], Error>> {
	const clerk_response = await dependencies.clerkClient.users.getUserList({
		userId: userIds,
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

		// firstName, lastNameは空文字を許容
		result.push({
			user_id: user.id,
			firstName: user.firstName || '',
			lastName: user.lastName || '',
		});
	}

	return ok(result);
}
