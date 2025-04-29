import { Sql } from 'postgres';
import { Result, err, ok } from 'neverthrow';
import { UserIdValue } from '../../domain/UserIdValue';

export async function existsReservationByDateRangeUserId(
	dependencies: { db: Sql },
	user_id: UserIdValue,
	start_date: Date,
	end_date: Date
): Promise<Result<boolean, Error>> {
	const { db } = dependencies;

	const rows = await db<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM reservation_or_disabled rord
    LEFT JOIN reservation res ON rord.reservation_uuid = res.reservation_uuid
    WHERE res.user_id = ${user_id.user_id} AND rord.date >= ${start_date} AND rord.date <= ${end_date};
  `;

	const count = rows[0].count;
	if (count === 0) {
		return ok(false);
	} else if (count === 1) {
		return ok(true);
	}

	return err(new Error('Unexpected count'));
}
