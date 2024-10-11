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
import { newUserIdValue } from './domain/UserIdValue';

// ユーティリティのimport
import { isWeekday } from './utils/isWeekday';
import { getPreviousMonday } from './utils/getPreviousMonday';
import { convertToDate } from './utils/convertToDate';
import { convertFromDate } from './utils/convertFromDate';

// DTOのimport
import { RoomResponse } from './types/dto/RoomResponse';
import { ReservationResponse } from './types/dto/ReservationResponse';
import { existsReservationByDateSlotRoomId } from './repositories/reservation_or_disabled/existsReservationByDateSlotRoomId';
import { existsReservationByDateRangeUserId } from './repositories/reservation_or_disabled/existsReservationByDateRangeUserId';
import { createReservation } from './repositories/reservation_or_disabled/createReservation';
import { getRooms } from './usecase/room/getRooms';
import { getAvailableRooms } from './usecase/room/getAvailableRooms';
import { toDisable } from './usecase/reservation_or_disabled/toDisable';
import { getReservationsByDateRange } from './usecase/reservation_or_disabled/getReservationsByDateRange';
import { getReservationsByDateRangeUserId } from './usecase/reservation_or_disabled/getReservationsByDateRangeUserId';
import { deleteReservation } from './usecase/reservation_or_disabled/deleteReservation';
import { postReservation } from './usecase/reservation_or_disabled/postReservation';

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

	// ユースケース呼び出し
	const result = await getRooms({ pool });
	if (result.isErr()) {
		return ctx.json({ message: result.error.message }, 500);
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

		// ユースケース呼び出し
		const result = await getAvailableRooms({ pool }, date, slot_result.value);
		if (result.isErr()) {
			return ctx.json({ message: result.error.message }, 500);
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

		// ユースケース呼び出し
		const result = await toDisable({ pool }, room_uuid_result.value, date_result.value, slot_result.value);
		if (result.isErr()) {
			return ctx.json({ message: result.error.message }, 400);
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

		const result = await getReservationsByDateRange({ pool, clerkClient }, start_date, end_date);
		if (result.isErr()) {
			return ctx.json({ message: result.error.message }, 500);
		}

		const response: ReservationResponse[] = [];

		const { reservations, users } = result.value;

		for (const reservation of reservations) {
			if (reservation.user_id === null) {
				response.push({
					rord_uuid: reservation.rord_uuid.uuid,
					room: {
						room_uuid: reservation.room_uuid.uuid,
						name: reservation.room_name.name,
					},
					slot: reservation.slot.slot,
					date: convertFromDate(reservation.date),
					user: null,
				});
				continue;
			}

			const user_id = reservation.user_id.user_id;
			const user = users.find((user) => user.user_id.user_id === user_id);

			if (!user) {
				return ctx.json({ message: 'Error on fetching user' }, 500);
			}

			response.push({
				rord_uuid: reservation.rord_uuid.uuid,
				room: {
					room_uuid: reservation.room_uuid.uuid,
					name: reservation.room_name.name,
				},
				slot: reservation.slot.slot,
				date: convertFromDate(reservation.date),
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

		const clerkClient = createClerkClient({
			secretKey: ctx.env.CLERK_SECRET_KEY,
			publishableKey: ctx.env.CLERK_PUBLISHABLE_KEY,
		});

		const result = await getReservationsByDateRangeUserId({ pool, clerkClient }, clerk_user_id_result.value, start_date, end_date);
		if (result.isErr()) {
			return ctx.json({ message: result.error.message }, 500);
		}

		const response: ReservationResponse[] = [];

		for (const row of result.value.reservations) {
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
			const user = result.value.users.find((user) => user.user_id.user_id === user_id);
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
		const clerkClient = createClerkClient({
			secretKey: ctx.env.CLERK_SECRET_KEY,
			publishableKey: ctx.env.CLERK_PUBLISHABLE_KEY,
		});

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

		const clerk_user = getAuth(ctx);
		if (!clerk_user || !clerk_user.userId) {
			return ctx.json({ message: 'ログインしていません。' }, 401);
		}
		const clerk_user_id_result = newUserIdValue(clerk_user.userId);
		if (clerk_user_id_result.isErr()) {
			return ctx.json({ message: 'Invalid user_id' }, 400);
		}

		const result = await postReservation(
			{ pool, clerkClient },
			room_uuid_result.value,
			date,
			slot_result.value,
			clerk_user_id_result.value
		);
		if (result.isErr()) {
			return ctx.json({ message: result.error.message }, 400);
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

		const clerk_user = getAuth(ctx);
		if (!clerk_user || !clerk_user.userId) {
			return ctx.json({ message: 'ログインしていません。' }, 401);
		}
		const clerk_user_id_result = newUserIdValue(clerk_user.userId);
		if (clerk_user_id_result.isErr()) {
			return ctx.json({ message: 'Invalid user_id' }, 400);
		}

		const rord_uuid_result = newUuidValue(ctx.req.valid('param').rord_uuid);
		if (rord_uuid_result.isErr()) {
			return ctx.json({ message: 'Invalid rord_uuid' }, 400);
		}

		const result = await deleteReservation({ pool }, clerk_user_id_result.value, rord_uuid_result.value);
		if (result.isErr()) {
			return ctx.json({ message: result.error.message }, 400);
		}

		return ctx.json({ message: '予約をキャンセルしました。' });
	}
);

export default {
	fetch: app.fetch,
};
