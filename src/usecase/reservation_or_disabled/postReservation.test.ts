// postReservation.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { postReservation } from './postReservation';
import { Pool } from '@neondatabase/serverless';
import { ClerkClient } from '@clerk/backend';
import { ok, err } from 'neverthrow';
import { createReservation } from '../../repositories/reservation_or_disabled/createReservation';
import { existsReservationByDateSlotRoomId } from '../../repositories/reservation_or_disabled/existsReservationByDateSlotRoomId';
import { existsReservationByDateRangeUserId } from '../../repositories/reservation_or_disabled/existsReservationByDateRangeUserId';
import { createUuidValue, UuidValue } from '../../domain/UuidValue';
import { newSlotValue, SlotValue } from '../../domain/SlotValue';
import { newUserIdValue, UserIdValue } from '../../domain/UserIdValue';

// リポジトリ関数をモック化
vi.mock('../../repositories/reservation_or_disabled/createReservation');
vi.mock('../../repositories/reservation_or_disabled/existsReservationByDateSlotRoomId');
vi.mock('../../repositories/reservation_or_disabled/existsReservationByDateRangeUserId');

describe('postReservation', () => {
	const dependencies = {
		pool: {} as Pool,
		clerkClient: {} as ClerkClient,
	};

	const room_uuid: UuidValue = createUuidValue();
	const slot: SlotValue = newSlotValue('first')._unsafeUnwrap();
	const user_id: UserIdValue = newUserIdValue('user_2nYhbWmoBhw82I5X32Wfp7cXaQA')._unsafeUnwrap();

	beforeEach(() => {
		vi.resetAllMocks();
	});

	// 過去の日付であればエラーになることを確認
	it('should return error for past dates', async () => {
		const pastDates = [
			new Date(Date.now() - 1000 * 60 * 60 * 24 * 1), // 1日前
			new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2日前
			new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3日前
			new Date(Date.now() - 1000 * 60 * 60 * 12), // 12時間前
			new Date(Date.now() - 1000 * 60 * 60 * 6), // 6時間前
			new Date(Date.now() - 1000 * 60 * 60 * 3), // 3時間前
			new Date(Date.now() - 1000 * 60 * 60 * 1), // 1時間前
		];

		// リポジトリ関数が成功を返すようにモック
		vi.mocked(existsReservationByDateSlotRoomId).mockResolvedValue(ok(false));
		vi.mocked(existsReservationByDateRangeUserId).mockResolvedValue(ok(false));
		vi.mocked(createReservation).mockResolvedValue(ok(undefined));

		for (const date of pastDates) {
			const result = await postReservation(dependencies, room_uuid, date, slot, user_id);
			expect(result.isErr()).toBe(true);
			expect(result._unsafeUnwrapErr().message).toBe('過去の日付は予約できません。');
		}
	});

	// 当日でエラーにならないことを確認
	it('should not return error for current dates', async () => {
		const currentDates = [
			new Date(), // 現在
			new Date(Date.now() + 1000 * 60), // 1分後
			new Date(Date.now() + 1000 * 60 * 60), // 1時間後
		];

		vi.mocked(existsReservationByDateSlotRoomId).mockResolvedValue(ok(false));
		vi.mocked(existsReservationByDateRangeUserId).mockResolvedValue(ok(false));
		vi.mocked(createReservation).mockResolvedValue(ok(undefined));

		for (const date of currentDates) {
			const result = await postReservation(dependencies, room_uuid, date, slot, user_id);
			expect(result.isOk()).toBe(true);
		}
	});

	// 未来の日付でエラーにならないことを確認
	it('should not return error for future dates', async () => {
		const futureDates = [
			new Date(Date.now() + 1000 * 60 * 60 * 24 * 1), // 1日後
			new Date(Date.now() + 1000 * 60 * 60 * 24 * 2), // 2日後
			new Date(Date.now() + 1000 * 60 * 60 * 24 * 3), // 3日後
		];

		vi.mocked(existsReservationByDateSlotRoomId).mockResolvedValue(ok(false));
		vi.mocked(existsReservationByDateRangeUserId).mockResolvedValue(ok(false));
		vi.mocked(createReservation).mockResolvedValue(ok(undefined));

		for (const date of futureDates) {
			const result = await postReservation(dependencies, room_uuid, date, slot, user_id);
			expect(result.isOk()).toBe(true);
		}
	});

	// 平日でなければエラーになることを確認
	it('should return error if the date is not a weekday', async () => {
		const weekendDates = [
			new Date('2023-10-07'), // 土曜日
			new Date('2023-10-08'), // 日曜日
		];

		vi.mocked(existsReservationByDateSlotRoomId).mockResolvedValue(ok(false));
		vi.mocked(existsReservationByDateRangeUserId).mockResolvedValue(ok(false));
		vi.mocked(createReservation).mockResolvedValue(ok(undefined));

		for (const date of weekendDates) {
			const result = await postReservation(dependencies, room_uuid, date, slot, user_id);
			expect(result.isErr()).toBe(true);
			expect(result._unsafeUnwrapErr().message).toBe('平日でない日付です。');
		}
	});

	// 予約が存在するときにエラーになることを確認
	it('should return error if reservation already exists for the date, slot, and room', async () => {
		const date = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1日後

		vi.mocked(existsReservationByDateSlotRoomId).mockResolvedValue(ok(true));
		vi.mocked(existsReservationByDateRangeUserId).mockResolvedValue(ok(false));
		vi.mocked(createReservation).mockResolvedValue(ok(undefined));

		const result = await postReservation(dependencies, room_uuid, date, slot, user_id);
		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().message).toBe('すでに予約が埋まっています。');
	});

	// 自分の予約が一週間以内にあればエラーになることを確認
	it('should return error if user has a reservation within one week', async () => {
		const date = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1日後

		vi.mocked(existsReservationByDateSlotRoomId).mockResolvedValue(ok(false));
		vi.mocked(existsReservationByDateRangeUserId).mockResolvedValue(ok(true));
		vi.mocked(createReservation).mockResolvedValue(ok(undefined));

		const result = await postReservation(dependencies, room_uuid, date, slot, user_id);
		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().message).toBe('一週間以内に予約しています。');
	});

	// すべての条件を満たす正常系のテスト
	it('should successfully create a reservation when all conditions are met', async () => {
		const date = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1日後

		vi.mocked(existsReservationByDateSlotRoomId).mockResolvedValue(ok(false));
		vi.mocked(existsReservationByDateRangeUserId).mockResolvedValue(ok(false));
		vi.mocked(createReservation).mockResolvedValue(ok(undefined));

		const result = await postReservation(dependencies, room_uuid, date, slot, user_id);
		expect(result.isOk()).toBe(true);
		expect(createReservation).toHaveBeenCalled();
	});
});
