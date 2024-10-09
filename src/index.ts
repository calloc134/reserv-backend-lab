import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { createClerkClient } from '@clerk/backend';
import { vValidator } from '@hono/valibot-validator';
import { Pool } from '@neondatabase/serverless';
import { Hono } from 'hono';
import { object, string } from 'valibot';
import { cors } from 'hono/cors';

// 値オブジェクトのimport
import { newUuidValue, createUuidValue } from './domain/UuidValue';
import { type slot, newSlotValue } from './domain/SlotValue';
import { newUserIdValue, UserIdValue } from './domain/UserIdValue';

// ユーティリティのimport
import { isWeekday } from './utils/isWeekday';
import { getPreviousMonday } from './utils/getPreviousMonday';
import { convertToDate } from './utils/convertToDate';
import { convertFromDate } from './utils/convertFromDate';

// DTOのimport
import { RoomResponse } from './types/dto/RoomResponse';
import { ReservationResponse } from './types/dto/ReservationResponse';
import { findByUserId } from './repositories/user/findByUserId';
import { findByUserIds } from './repositories/user/findByUserIds';
import { findRooms } from './repositories/room/findRooms';
import { findAvailableRooms } from './repositories/room/findAvailableRooms';
import { existsRoomByUuid } from './repositories/room/existsRoomByUuid';
import { createDisabled } from './repositories/reservation_or_disabled/createDisabled';
import { findReservationByDateRange } from './repositories/reservation_or_disabled/findReservationByDateRange';
import { findReservationByDateRangeUserId } from './repositories/reservation_or_disabled/findReservationByDateRangeUserId';
import { existsReservationByDateSlotRoomId } from './repositories/reservation_or_disabled/existsReservationByDateSlotRoomId';
import { existsReservationByDateRangeUserId } from './repositories/reservation_or_disabled/existsReservationByDateRangeUserId';
import { createReservation } from './repositories/reservation_or_disabled/createReservation';
import { findReservationByRordIdForDelete } from './repositories/reservation_or_disabled/findReservationByRordIdForDelete';
import { deleteReservationByRordId } from './repositories/reservation_or_disabled/deleteReservationByRordId';

// 予約システム
// ユーザは一週間に一回予約が可能
// 予約は平日のみ 1,2,3,4限まで
// 予約は
// - 予約が埋まっていれば不可
// - 自分が一週間以内に予約していれば不可
// 予約解除は
// - 予約が三日以上先であれば可能

type Variables = {
	pool: Pool;
};

type Bindings = {
	DATABASE_URL: string;
	CLERK_SECRET_KEY: string;
	CLERK_PUBLISHABLE_KEY: string;
};

const app = new Hono<{
	Bindings: Bindings;
	Variables: Variables;
}>();

app.use(
	'*',
	cors({
		origin: ['http://localhost:5173', 'https://silver-monstera-ea5373.netlify.app'],
		allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		exposeHeaders: ['Content-Type', 'Authorization'],
		maxAge: 86400,
	})
);

app.use('*', async (ctx, next) => {
	const { CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY } = ctx.env;

	await clerkMiddleware({
		secretKey: CLERK_SECRET_KEY,
		publishableKey: CLERK_PUBLISHABLE_KEY,
	})(ctx, async () => {});

	const clerk_user = getAuth(ctx);
	if (!clerk_user || !clerk_user.userId) {
		console.debug('Unauthorized');
		return ctx.json({ message: 'ログインしていません。' }, 401);
	}

	await next();
});

app.use('*', async (ctx, next) => {
	const pool = new Pool({
		connectionString: ctx.env.DATABASE_URL,
	});

	ctx.set('pool', pool);
	await next();
});

app.get('/', (ctx) => {
	return ctx.json({ message: 'Hello, World!' });
});

app.get('/rooms/', async (ctx) => {
	const pool = ctx.get('pool');

	const result = await findRooms({ pool });
	if (result.isErr()) {
		return ctx.json({ message: 'Failed to fetch rooms' }, 500);
	}

	const response: RoomResponse[] = result.value.map((room) => {
		return {
			room_uuid: room.room_uuid.uuid,
			name: room.name,
		};
	});

	return ctx.json(response);
});

// 特定の時間・時限に利用できる部屋を取得
app.get(
	'/rooms/available/date/:date/slot/:slot/',
	vValidator(
		'param',
		object({
			date: string(),
			slot: string(),
		}),
		(result, ctx) => {
			if (!result.success) {
				return ctx.json({ message: 'Invalid request' }, 400);
			}
		}
	),

	async (ctx) => {
		const pool = ctx.get('pool');
		const { date: raw_date, slot: raw_slot } = ctx.req.valid('param');

		const date_result = convertToDate(raw_date);
		if (date_result.isErr()) {
			return ctx.json({ message: 'Invalid date' }, 400);
		}
		const date = date_result.value;

		const slot_result = newSlotValue(raw_slot as slot);
		if (slot_result.isErr()) {
			return ctx.json({ message: 'Invalid slot' }, 400);
		}

		const result = await findAvailableRooms({ pool }, date, slot_result.value);

		if (result.isErr()) {
			return ctx.json({ message: 'Failed to fetch rooms' }, 500);
		}

		const response: RoomResponse[] = result.value.map((room) => {
			return {
				room_uuid: room.room_uuid.uuid,
				name: room.name,
			};
		});

		return ctx.json(response);
	}
);

// 無効にする日時と部屋を指定
app.post(
	'/rooms/to-disable/',
	vValidator(
		'json',
		object({
			room_uuid: string(),
			date: string(),
			slot: string(),
		}),
		(result, ctx) => {
			if (!result.success) {
				return ctx.json({ message: 'Invalid request' }, 400);
			}
		}
	),
	async (ctx) => {
		const pool = ctx.get('pool');
		const { date: raw_date, slot: raw_slot } = ctx.req.valid('json');

		// 形式はYYYY/MM/DD
		const date_result = convertToDate(raw_date);
		if (date_result.isErr()) {
			return ctx.json({ message: 'Invalid date' }, 400);
		}

		const slot_result = newSlotValue(raw_slot as slot);
		if (slot_result.isErr()) {
			return ctx.json({ message: 'Invalid slot' }, 400);
		}

		const room_uuid_result = newUuidValue(ctx.req.valid('json').room_uuid);
		if (room_uuid_result.isErr()) {
			return ctx.json({ message: 'Invalid room_uuid' }, 400);
		}

		// 部屋が存在しているか確認
		const room_result = await existsRoomByUuid({ pool }, room_uuid_result.value);
		if (room_result.isErr()) {
			return ctx.json({ message: 'Failed to fetch room' }, 500);
		}

		// 予約が存在しないかを確認
		const result_1 = await existsReservationByDateSlotRoomId({ pool }, room_uuid_result.value, date_result.value, slot_result.value);
		if (result_1.isErr()) {
			return ctx.json({ message: 'Failed to fetch reservation' }, 500);
		}
		if (result_1.value) {
			return ctx.json({ message: 'すでに予約が埋まっています。' }, 400);
		}

		// uuidを作成
		const uuid = createUuidValue();

		const result_2 = await createDisabled({ pool }, uuid, slot_result.value, date_result.value, room_uuid_result.value);
		if (result_2.isErr()) {
			return ctx.json({ message: 'Failed to create' }, 500);
		}

		return ctx.json({ message: `利用禁止の日時を設定しました: ${convertFromDate(date_result.value)} ${slot_result.value.slot}` });
	}
);

// 開始日時から終了日時までのすべての予約を取得
app.get(
	'/reservations/start_date/:start_date/end_date/:end_date/',
	vValidator('param', object({ start_date: string(), end_date: string() }), (result, ctx) => {
		if (!result.success) {
			return ctx.json({ message: 'Invalid request' }, 400);
		}
	}),

	async (ctx) => {
		const pool = ctx.get('pool');
		const clerkClient = createClerkClient({
			secretKey: ctx.env.CLERK_SECRET_KEY,
			publishableKey: ctx.env.CLERK_PUBLISHABLE_KEY,
		});

		const start_date_result = convertToDate(ctx.req.valid('param').start_date);
		const end_date_result = convertToDate(ctx.req.valid('param').end_date);
		if (start_date_result.isErr() || end_date_result.isErr()) {
			return ctx.json({ message: 'Invalid date' }, 400);
		}
		const start_date = start_date_result.value;
		const end_date = end_date_result.value;

		const result_1 = await findReservationByDateRange({ pool }, start_date, end_date);
		if (result_1.isErr()) {
			return ctx.json({ message: 'Failed to fetch reservations' }, 500);
		}

		// とりあえずここで詰め替えを行う 将来的にリポジトリで行う
		const user_ids: UserIdValue[] = [];
		for (const row of result_1.value) {
			if (row.status === 'reserved' && row.user_id) {
				user_ids.push(row.user_id);
			}
		}

		const users_result = await findByUserIds({ clerkClient }, user_ids);
		if (users_result.isErr()) {
			return ctx.json({ message: 'Error on fetching users' }, 500);
		}

		const response: ReservationResponse[] = [];

		for (const row of result_1.value) {
			if (!row.user_id) {
				response.push({
					rord_uuid: row.rord_uuid.uuid,
					room: {
						room_uuid: row.room_uuid.uuid,
						name: row.room_name.name,
					},
					slot: row.slot.slot,
					date: convertFromDate(row.date),
					user: null,
				});
				continue;
			}

			const user_id = row.user_id.user_id;
			const user = users_result.value.find((user) => user.user_id.user_id === user_id);
			if (!user) {
				return ctx.json({ message: 'Error on fetching user' }, 500);
			}

			response.push({
				rord_uuid: row.rord_uuid.uuid,
				room: {
					room_uuid: row.room_uuid.uuid,
					name: row.room_name.name,
				},
				slot: row.slot.slot,
				date: convertFromDate(row.date),
				user: { user_id: user.user_id.user_id, name: `${user.firstName} ${user.lastName}` },
			});
		}

		return ctx.json({ start_date: convertFromDate(start_date), end_date: convertFromDate(end_date), reservations: response });
	}
);

// 開始日時から終了日時までの自分の予約を取得
app.get(
	'/reservations/start_date/:start_date/end_date/:end_date/my-reservations/',
	vValidator('param', object({ start_date: string(), end_date: string() }), (result, ctx) => {
		if (!result.success) {
			return ctx.json({ message: 'Invalid request' }, 400);
		}
	}),
	async (ctx) => {
		const pool = ctx.get('pool');
		const clerk_user = getAuth(ctx);

		if (!clerk_user || !clerk_user.userId) {
			return ctx.json({ message: 'ログインしていません。' }, 401);
		}

		const start_date_result = convertToDate(ctx.req.valid('param').start_date);
		const end_date_result = convertToDate(ctx.req.valid('param').end_date);
		if (start_date_result.isErr() || end_date_result.isErr()) {
			return ctx.json({ message: 'Invalid date' }, 400);
		}
		const start_date = start_date_result.value;
		const end_date = end_date_result.value;

		const clerk_user_id_result = newUserIdValue(clerk_user.userId);
		if (clerk_user_id_result.isErr()) {
			return ctx.json({ message: 'Invalid user_id' }, 400);
		}

		const result = await findReservationByDateRangeUserId({ pool }, clerk_user_id_result.value, start_date, end_date);
		if (result.isErr()) {
			return ctx.json({ message: 'Failed to fetch reservations' }, 500);
		}

		const clerkClient = createClerkClient({
			secretKey: ctx.env.CLERK_SECRET_KEY,
			publishableKey: ctx.env.CLERK_PUBLISHABLE_KEY,
		});

		const user_id_result = newUserIdValue(clerk_user.userId);
		if (user_id_result.isErr()) {
			return ctx.json({ message: 'Invalid user_id' }, 400);
		}

		const user = await findByUserId({ clerkClient }, user_id_result.value);
		if (user.isErr()) {
			return ctx.json({ message: 'User not found' }, 404);
		}

		const response: ReservationResponse[] = [];
		for (const row of result.value) {
			response.push({
				rord_uuid: row.rord_uuid.uuid,
				room: {
					room_uuid: row.room_uuid.uuid,
					name: row.room_name.name,
				},
				slot: row.slot.slot,
				date: convertFromDate(row.date),
				user: { user_id: user_id_result.value.user_id, name: `${user.value.firstName} ${user.value.lastName}` },
			});
		}

		return ctx.json({ start_date: convertFromDate(start_date), end_date: convertFromDate(end_date), reservations: response });
	}
);

// 予約の作成
app.post(
	'/reservations/',
	vValidator(
		'json',
		object({
			room_uuid: string(),
			slot: string(),
			date: string(),
			// user_id: string(),
		}),
		(result, ctx) => {
			if (!result.success) {
				return ctx.json({ message: 'Invalid request' }, 400);
			}
		}
	),

	async (ctx) => {
		const pool = ctx.get('pool');
		const { room_uuid: raw_room_uuid, slot: raw_slot, date: raw_date } = ctx.req.valid('json');

		const room_uuid_result = newUuidValue(raw_room_uuid);
		if (room_uuid_result.isErr()) {
			return ctx.json({ message: 'Invalid room_uuid' }, 400);
		}

		const slot_result = newSlotValue(raw_slot as slot);
		if (slot_result.isErr()) {
			return ctx.json({ message: 'Invalid slot' }, 400);
		}

		// 該当する日にちの一週間について取得
		// const date = new Date(raw_date);
		const date_result = convertToDate(raw_date);
		if (date_result.isErr()) {
			return ctx.json({ message: 'Invalid date' }, 400);
		}
		const date = date_result.value;

		// まず、本日より前の日付であればエラー
		if (date < new Date()) {
			return ctx.json({ message: '過去・当日の日付は予約できません。' }, 400);
		}

		// 念の為、平日であることを確認
		if (!isWeekday(date)) {
			return ctx.json({ message: 'Invalid date' }, 400);
		}

		const start_date = getPreviousMonday(date);
		const end_date = new Date(start_date.getFullYear(), start_date.getMonth(), start_date.getDate() + 4);

		// 予約が埋まっているか確認
		const result = await existsReservationByDateSlotRoomId({ pool }, room_uuid_result.value, date, slot_result.value);
		if (result.isErr()) {
			return ctx.json({ message: 'Failed to fetch reservation' }, 500);
		}
		if (result.value) {
			return ctx.json({ message: 'すでに予約が埋まっています。' }, 400);
		}

		// 自分が一週間以内に予約しているか確認
		const clerk_user = getAuth(ctx);
		if (!clerk_user || !clerk_user.userId) {
			return ctx.json({ message: 'ログインしていません。' }, 401);
		}

		const user_id_result = newUserIdValue(clerk_user.userId);
		if (user_id_result.isErr()) {
			return ctx.json({ message: 'Invalid user_id' }, 400);
		}

		const result_2 = await existsReservationByDateRangeUserId({ pool }, user_id_result.value, start_date, end_date);
		if (result_2.isErr()) {
			return ctx.json({ message: 'Failed to fetch reservation' }, 500);
		}
		if (result_2.value) {
			return ctx.json({ message: '一週間以内に予約しています。' }, 400);
		}

		const reservation_or_disabled_uuid = createUuidValue();
		const reservation_uuid = createUuidValue();

		const result_3 = await createReservation(
			{ pool },
			reservation_or_disabled_uuid,
			reservation_uuid,
			user_id_result.value,
			room_uuid_result.value,
			date,
			slot_result.value
		);
		if (result_3.isErr()) {
			return ctx.json({ message: 'Failed to insert' }, 500);
		}

		return ctx.json({ message: '予約が完了しました。' });
	}
);

// 予約をキャンセル
app.delete(
	'/reservations/:rord_uuid/',
	vValidator('param', object({ rord_uuid: string() }), (result, ctx) => {
		if (!result.success) {
			return ctx.json({ message: 'Invalid request' }, 400);
		}
	}),

	async (ctx) => {
		const pool = ctx.get('pool');

		const rord_uuid_result = newUuidValue(ctx.req.valid('param').rord_uuid);
		if (rord_uuid_result.isErr()) {
			return ctx.json({ message: 'Invalid rord_uuid' }, 400);
		}

		const result = await findReservationByRordIdForDelete({ pool }, rord_uuid_result.value);
		if (result.isErr()) {
			return ctx.json({ message: 'Failed to fetch reservation' }, 500);
		}

		if (result.value.status !== 'reserved' || result.value.user_id === null) {
			return ctx.json({ message: '予約ではなく、利用禁止の日時です。' }, 400);
		}

		const clerk_user = getAuth(ctx);
		if (!clerk_user || !clerk_user.userId) {
			return ctx.json({ message: 'ログインしていません。' }, 401);
		}

		const clerk_user_id_result = newUserIdValue(clerk_user.userId);
		if (clerk_user_id_result.isErr()) {
			return ctx.json({ message: 'Invalid user_id' }, 400);
		}

		if (result.value.user_id.user_id !== clerk_user_id_result.value.user_id) {
			return ctx.json({ message: '他のユーザの予約はキャンセルできません。' }, 403);
		}

		const date = result.value.date;
		const now = new Date();

		// 3日以上先でなければキャンセル不可
		if (date.getTime() - now.getTime() < 3 * 24 * 60 * 60 * 1000) {
			return ctx.json({ message: 'キャンセルは3日以上先の予約のみ可能です。' }, 400);
		}

		const result_2 = await deleteReservationByRordId({ pool }, rord_uuid_result.value);
		if (result_2.isErr()) {
			return ctx.json({ message: 'Failed to delete reservation' }, 500);
		}

		return ctx.json({ message: '予約をキャンセルしました。' });
	}
);

export default {
	fetch: app.fetch,
};
