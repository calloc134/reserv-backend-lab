import { Sql } from 'postgres';
import { err, ok, Result } from 'neverthrow';
import { ReservationOrDisabledWithRoom } from '../../domain/ReservationOrDisabledWithRoom';
import { findReservationByDateRange } from '../../repositories/reservation_or_disabled/findReservationByDateRange';
import { findByUserIds } from '../../repositories/user/findByUserIds';
import { UserIdValue } from '../../domain/UserIdValue';
import { ClerkClient } from '@clerk/backend';
import { User } from '../../domain/User';
import { findReservationByDateRangeUserId } from '../../repositories/reservation_or_disabled/findReservationByDateRangeUserId';

export async function getReservationsByDateRangeUserId(
	dependencies: { db: Sql; clerkClient: ClerkClient },
	user_id: UserIdValue,
	start: Date,
	end: Date
): Promise<Result<{ reservations: ReservationOrDisabledWithRoom[]; users: User[] }, Error>> {
	// 予約を取得
	const { db, clerkClient } = dependencies;
	const reservations_result = await findReservationByDateRangeUserId({ db }, user_id, start, end);
	if (reservations_result.isErr()) {
		return err(reservations_result.error);
	}

	// 取得するユーザIDの対象について洗い出し
	const user_ids: UserIdValue[] = [];
	for (const row of reservations_result.value) {
		if (row.status === 'reserved' && row.user_id) {
			user_ids.push(row.user_id);
		}
	}

	// 予約に関連するユーザを取得
	const users_result = await findByUserIds({ clerkClient }, user_ids);
	if (users_result.isErr()) {
		return err(users_result.error);
	}

	return ok({ reservations: reservations_result.value, users: users_result.value });
}
