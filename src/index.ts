import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { createClerkClient } from '@clerk/backend';
import { vValidator } from '@hono/valibot-validator';
import { Pool } from '@neondatabase/serverless';
import { sql } from '@ts-safeql/sql-tag';
import { Hono } from 'hono';
// sql呼び出しでエラーが出たら素直にthrowする
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
import { RoomResponse } from './handler/dto/RoomResponse';
import { ReservationResponse } from './handler/dto/ReservationResponse';

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

	const result = await pool.query<{ room_uuid: string; name: string }>(sql`
		SELECT * FROM room ORDER BY room_uuid;
	`);

	const response: RoomResponse[] = result.rows.map((row) => {
		return {
			room_uuid: row.room_uuid,
			name: row.name,
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

		const slot_result = newSlotValue(raw_slot as slot);

		if (slot_result.isErr()) {
			return ctx.json({ message: 'Invalid slot' }, 400);
		}

		const date = date_result.value;

		// 特定の時間・時限で予約・利用禁止になっていない部屋を取得
		const result = await pool.query<{ room_uuid: string; name: string }>(sql`
			SELECT room_uuid, name FROM room WHERE room_uuid NOT IN (
				SELECT room_uuid FROM reservation_or_disabled WHERE date = ${date} AND slot = ${slot_result.value.slot}::slot 
			) ORDER BY room_uuid;
		`);

		const response: RoomResponse[] = result.rows.map((row) => {
			return {
				room_uuid: row.room_uuid,
				name: row.name,
			};
		});

		return ctx.json(response);
	}
);

// 無効にする日時の設定
// disabled予定を4つ挿入している
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
		const room_result = await pool.query<{ room_uuid: string }>(sql`
			SELECT room_uuid FROM room WHERE room_uuid = ${room_uuid_result.value.uuid}::uuid;
		`);

		if (room_result.rows.length !== 1) {
			return ctx.json({ message: 'Room not found' }, 404);
		}

		// uuidを作成
		const uuid = createUuidValue();

		const result_2 = await pool.query<{
			rord_uuid: string;
			slot: 'first' | 'second' | 'third' | 'fourth';
			date: Date;
			room_uuid: string;
		}>(sql`
			INSERT INTO reservation_or_disabled (rord_uuid, slot, date, room_uuid, status) VALUES
				(${uuid.uuid}::uuid, ${slot_result.value.slot}::slot, ${date_result.value}, ${room_uuid_result.value.uuid}::uuid, 'disabled')
				RETURNING rord_uuid, slot, date, room_uuid;
		`);

		if (result_2.rows.length !== 1) {
			return ctx.json({ message: 'Failed to insert' }, 500);
		}

		return ctx.json({ message: `利用禁止の日時を設定しました: ${convertFromDate(date_result.value)} ${slot_result.value.slot}` });
	}
);

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

		// room_nameがnullになる場合があるのなんでだろう
		const result = await pool.query<{
			rord_uuid: string;
			room_uuid: string;
			room_name: string;
			status: 'reserved' | 'disabled';
			date: Date;
			slot: 'first' | 'second' | 'third' | 'fourth';
			user_id: string | null;
		}>(
			sql`
			SELECT 
				rord.rord_uuid,
				rord.room_uuid,
				room.name as room_name,
				rord.status,
				rord.date,
				rord.slot,
				CASE 
					WHEN rord.status = 'reserved' THEN res.user_id
					ELSE NULL
				END AS user_id
			FROM 
				reservation_or_disabled rord
			INNER JOIN
				room
			ON
				rord.room_uuid = room.room_uuid
			LEFT JOIN 
				reservation res 
			ON 
				rord.reservation_uuid = res.reservation_uuid
			WHERE 
				rord.date >= ${start_date} AND rord.date <= ${end_date}
			ORDER BY 
				rord.date, 
				rord.slot;
	`
		);

		// if (result.rows.length === 0) {
		// 	return ctx.json({ message: 'No reservations' }, 404);
		// }

		const response: ReservationResponse[] = [];

		const users = await clerkClient.users.getUserList({
			userId: result.rows.map((row) => row.user_id).filter((x): x is string => x !== null),
		});

		for (const row of result.rows) {
			const rord_uuid_result = newUuidValue(row.rord_uuid);
			if (rord_uuid_result.isErr()) {
				throw new Error('Invalid UUID');
			}

			const room_uuid_result = newUuidValue(row.room_uuid);
			if (room_uuid_result.isErr()) {
				throw new Error('Invalid UUID');
			}

			const slot_result = newSlotValue(row.slot as slot);
			if (slot_result.isErr()) {
				throw new Error('Invalid slot');
			}

			const date = row.date;

			const user = row.user_id === null ? null : users.data.find((user) => user.id === row.user_id);

			response.push({
				rord_uuid: rord_uuid_result.value.uuid,
				room: {
					room_uuid: room_uuid_result.value.uuid,
					name: row.room_name,
				},
				slot: slot_result.value.slot,
				date: convertFromDate(date),
				user:
					user === null
						? null
						: { user_id: user?.id ?? '', name: user?.firstName || user?.lastName ? `${user?.firstName} ${user?.lastName}` : '' },
			});
		}
		return ctx.json({ start_date: convertFromDate(start_date), end_date: convertFromDate(end_date), reservations: response });
	}
);

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

		const clerk_user_id_result = newUserIdValue(clerk_user.userId);

		if (clerk_user_id_result.isErr()) {
			return ctx.json({ message: 'Invalid user_id' }, 400);
		}

		const start_date_result = convertToDate(ctx.req.valid('param').start_date);
		const end_date_result = convertToDate(ctx.req.valid('param').end_date);

		if (start_date_result.isErr() || end_date_result.isErr()) {
			return ctx.json({ message: 'Invalid date' }, 400);
		}

		const start_date = start_date_result.value;
		const end_date = end_date_result.value;

		const result = await pool.query<{
			rord_uuid: string;
			room_uuid: string;
			room_name: string;
			status: 'reserved' | 'disabled';
			date: Date;
			slot: 'first' | 'second' | 'third' | 'fourth';
			user_id: string | null;
		}>(
			sql`
			SELECT 
				rord.rord_uuid,
				rord.room_uuid,
				room.name as room_name,
				rord.status,
				rord.date,
				rord.slot,
				CASE 
					WHEN rord.status = 'reserved' THEN res.user_id
					ELSE NULL
				END AS user_id
			FROM 
				reservation_or_disabled rord
			INNER JOIN
				room
			ON
				rord.room_uuid = room.room_uuid
			LEFT JOIN 
				reservation res 
			ON 
				rord.reservation_uuid = res.reservation_uuid
			WHERE 
				(rord.status = 'disabled' OR res.user_id = ${clerk_user_id_result.value.user_id}::text) AND rord.date >= ${start_date} AND rord.date <= ${end_date}
			ORDER BY 
				rord.date, 
				rord.slot;
	`
		);

		const clerkClient = createClerkClient({
			secretKey: ctx.env.CLERK_SECRET_KEY,
			publishableKey: ctx.env.CLERK_PUBLISHABLE_KEY,
		});

		const user = await clerkClient.users.getUser(clerk_user.userId);

		const response: ReservationResponse[] = [];

		for (const row of result.rows) {
			const rord_uuid_result = newUuidValue(row.rord_uuid);
			if (rord_uuid_result.isErr()) {
				throw new Error('Invalid UUID');
			}

			const room_uuid_result = newUuidValue(row.room_uuid);
			if (room_uuid_result.isErr()) {
				throw new Error('Invalid UUID');
			}

			const slot_result = newSlotValue(row.slot as slot);
			if (slot_result.isErr()) {
				throw new Error('Invalid slot');
			}

			const date = row.date;

			response.push({
				rord_uuid: rord_uuid_result.value.uuid,
				room: {
					room_uuid: room_uuid_result.value.uuid,
					name: row.room_name,
				},
				slot: slot_result.value.slot,
				date: convertFromDate(date),
				user: row.status === 'disabled' ? null : { user_id: user.id, name: `${user.firstName} ${user.lastName}` },
			});
		}
		return ctx.json({ start_date: convertFromDate(start_date), end_date: convertFromDate(end_date), reservations: response });
	}
);

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
		const date = new Date(raw_date);

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
		const result = await pool.query<{ count: number }>(
			sql`
				SELECT count(*)::int FROM reservation_or_disabled WHERE room_uuid = ${room_uuid_result.value.uuid}::uuid AND date = ${date} AND slot = ${slot_result.value.slot}::slot;
			`
		);

		if (result.rows[0].count !== 0) {
			return ctx.json({ message: 'すでに予約が埋まっています。' }, 400);
		}

		// 自分が一週間以内に予約しているか確認
		// const user_id = 'user_2cSSCzV7948rhPJMsY601tXsEU4';
		const clerk_user = getAuth(ctx);

		if (!clerk_user || !clerk_user.userId) {
			return ctx.json({ message: 'ログインしていません。' }, 401);
		}

		const user_id_result = newUserIdValue(clerk_user.userId);

		if (user_id_result.isErr()) {
			return ctx.json({ message: 'Invalid user_id' }, 400);
		}

		const result_2 = await pool.query<{ count: number }>(
			sql`
				SELECT count(*)::int FROM reservation_or_disabled rord
				LEFT JOIN reservation res ON rord.reservation_uuid = res.reservation_uuid
				WHERE res.user_id = ${user_id_result.value.user_id}::text AND rord.date >= ${start_date} AND rord.date <= ${end_date};
			`
		);

		if (result_2.rows[0].count !== 0) {
			return ctx.json({ message: '一週間以内に予約しています。' }, 400);
		}

		const reservation_or_disabled_uuid = createUuidValue();
		const reservation_uuid = createUuidValue();

		const result_3 = await pool.query<{ reservation_uuid: string }>(
			sql`
				INSERT INTO reservation (reservation_uuid, user_id) VALUES (${reservation_uuid.uuid}::uuid, ${user_id_result.value.user_id}::text) RETURNING reservation_uuid;
			`
		);

		if (result_3.rows.length !== 1) {
			return ctx.json({ message: 'Failed to insert' }, 500);
		}

		const result_4 = await pool.query<{ rord_uuid: string }>(
			sql`
				INSERT INTO reservation_or_disabled (rord_uuid, room_uuid, date, slot, status, reservation_uuid) VALUES
				(${reservation_or_disabled_uuid.uuid}::uuid, ${room_uuid_result.value.uuid}::uuid, ${date}, ${slot_result.value.slot}::slot, 'reserved', ${reservation_uuid.uuid}::uuid) RETURNING rord_uuid;
			`
		);

		if (result_4.rows.length !== 1) {
			return ctx.json({ message: 'Failed to insert' }, 500);
		}

		return ctx.json({ message: '予約が完了しました。' });
	}
);

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

		const result = await pool.query<{ status: 'reserved' | 'disabled'; date: Date; user_id: string | null }>(
			sql`
				SELECT rord.status, rord.date, res.user_id FROM reservation_or_disabled rord LEFT JOIN reservation res ON rord.reservation_uuid = res.reservation_uuid WHERE rord.rord_uuid = ${rord_uuid_result.value.uuid}::uuid;
			`
		);

		if (result.rows.length !== 1) {
			return ctx.json({ message: '対応する予約が見つかりません。' }, 404);
		}

		if (result.rows[0].status !== 'reserved' || result.rows[0].user_id === null) {
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

		if (result.rows[0].user_id !== clerk_user_id_result.value.user_id) {
			return ctx.json({ message: '他のユーザの予約はキャンセルできません。' }, 403);
		}

		if (result.rows[0].date === null) {
			return ctx.json({ message: 'Invalid date' }, 400);
		}

		const date = result.rows[0].date;

		const now = new Date();

		if (date.getTime() - now.getTime() < 3 * 24 * 60 * 60 * 1000) {
			return ctx.json({ message: 'キャンセルは3日以上先の予約のみ可能です。' }, 400);
		}

		const result_2 = await pool.query<{ rord_uuid: string }>(
			sql` DELETE FROM reservation USING reservation_or_disabled WHERE reservation.reservation_uuid = reservation_or_disabled.reservation_uuid AND reservation_or_disabled.rord_uuid = ${rord_uuid_result.value.uuid}::uuid RETURNING rord_uuid;`
		);

		// cascadeなのでreservationも消える
		// このやり方が好ましいかはわからない。ビジネスロジックがRDBMSに依存しているということになるが、そもそもこういう需要があるために追加された機能である気もする。

		if (result_2.rows.length !== 1) {
			return ctx.json({ message: 'Failed to delete' }, 500);
		}

		return ctx.json({ message: '予約をキャンセルしました。' });
	}
);

export default {
	fetch: app.fetch,
};
