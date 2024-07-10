import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { createClerkClient } from '@clerk/backend';
import { vValidator } from '@hono/valibot-validator';
import { Pool } from '@neondatabase/serverless';
import { sql } from '@ts-safeql/sql-tag';
import { Hono } from 'hono';
// sql呼び出しでエラーが出たら素直にthrowする
import { ok, err, Result } from 'neverthrow';
import { uuidv7 } from 'uuidv7';
import { object, string } from 'valibot';
import { cors } from 'hono/cors';

// 予約システム
// ユーザは一週間に一回予約が可能
// 予約は平日のみ 1,2,3,4限まで
// 予約は
// - 予約が埋まっていれば不可
// - 自分が一週間以内に予約していれば不可
// 予約解除は
// - 予約が三日以上先であれば可能

type NameValue = {
	name: string;
};

function newNameValue(name: string): Result<NameValue, Error> {
	if (name.length < 3) {
		return err(new Error('Name must be at least 3 characters long'));
	}

	if (name.length > 20) {
		return err(new Error('Name must be at most 20 characters long'));
	}

	return ok({ name });
}

type UserIdValue = {
	user_id: string;
};

function newUserIdValue(user_id: string): Result<UserIdValue, Error> {
	const userIdRegex = new RegExp(/^user_[A-Za-z0-9]+$/);
	if (!userIdRegex.test(user_id)) {
		return err(new Error('Invalid user id'));
	}
	return ok({ user_id });
}

type UuidValue = {
	uuid: string;
};

function createUuidValue(): UuidValue {
	const id = uuidv7();
	return { uuid: id };
}

function newUuidValue(uuid: string): Result<UuidValue, Error> {
	const uuidRegex = new RegExp(/^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	if (!uuidRegex.test(uuid)) {
		return err(new Error('Invalid UUID'));
	}
	return ok({ uuid });
}

function convertToDate(date: string): Result<Date, Error> {
	// YYYY/MM/DD
	const [year, month, day] = date.split('-').map((x) => parseInt(x, 10));
	if (isNaN(year) || isNaN(month) || isNaN(day)) {
		return err(new Error('Invalid date'));
	}
	return ok(new Date(year, month - 1, day));
}

function convertFromDate(date: Date): string {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	return `${year}-${month}-${day}`;
}

type slot = 'first' | 'second' | 'third' | 'fourth';

type SlotValue = {
	slot: slot;
};

// DateはDate型でなければエラーになるので一旦定義しないことに

function newSlotValue(slot: slot): Result<SlotValue, Error> {
	if (slot !== 'first' && slot !== 'second' && slot !== 'third' && slot !== 'fourth') {
		return err(new Error('Slot must be first, second, third or fourth'));
	}
	return ok({ slot });
}

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

function getMondayOfThisWeek(today: Date = new Date()): Date {
	// まず本日の曜日を取得
	// 今日が平日であれば、前の月曜日から次の金曜日までの予約を取得
	// 今日が休日であれば、次の月曜日から金曜日までの予約を取得
	// 月曜さえ取得できれば、あとは+4日すれば金曜日になる

	const day = today.getDay();

	let start_date: Date;

	if (day === 0) {
		// 日曜日
		start_date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
	} else if (day === 6) {
		// 土曜日
		start_date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
	} else {
		// 平日であるため、月曜日を取得
		start_date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - day + 1);
	}

	return start_date;
}

app.use(
	'*',
	cors({
		origin: ['http://localhost:5173', 'https://reserv-frontend-lab.pages.dev'],
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

type RoomResponse = {
	room_uuid: string;
	name: string;
};

type ReservationResponse = {
	reservation_uuid: string;
	user: {
		user_id: string;
		name: string;
	} | null;
	room: {
		room_uuid: string;
		name: string;
	};
	slot: slot;
	date: string;
};

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

app.patch(
	'/rooms/',
	vValidator(
		'json',
		object({
			room_uuid: string(),
			name: string(),
		}),
		(result, ctx) => {
			if (!result.success) {
				return ctx.json({ message: 'Invalid request' }, 400);
			}
		}
	),
	async (ctx) => {
		const pool = ctx.get('pool');

		const room_uuid_result = newUuidValue(ctx.req.valid('json').room_uuid);

		if (room_uuid_result.isErr()) {
			return ctx.json({ message: 'Invalid room_uuid' }, 400);
		}

		const name_result = newNameValue(ctx.req.valid('json').name);

		if (name_result.isErr()) {
			return ctx.json({ message: 'Invalid name' }, 400);
		}

		const result = await pool.query<{ room_uuid: string }>(
			sql`
				UPDATE room SET name = ${name_result.value.name} WHERE room_uuid = ${room_uuid_result.value.uuid}::uuid RETURNING room_uuid;
			`
		);

		if (result.rows.length !== 1) {
			return ctx.json({ message: 'Room not found' }, 404);
		}

		return ctx.json({ message: '名前の変更が完了しました。' });
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
		}),
		(result, ctx) => {
			if (!result.success) {
				return ctx.json({ message: 'Invalid request' }, 400);
			}
		}
	),
	async (ctx) => {
		const pool = ctx.get('pool');
		const { date: raw_date } = ctx.req.valid('json');

		// 形式はYYYY/MM/DD
		const date_result = convertToDate(raw_date);

		if (date_result.isErr()) {
			return ctx.json({ message: 'Invalid date' }, 400);
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

		// uuidを4個作成
		const uuids = [createUuidValue(), createUuidValue(), createUuidValue(), createUuidValue()];

		const result_2 = await pool.query<{ rord_uuid: string }>(sql`
			INSERT INTO reservation_or_disabled (rord_uuid, slot, date, room_uuid, status) VALUES
				(${uuids[0].uuid}::uuid, 'first', ${date_result.value}, ${room_uuid_result.value.uuid}::uuid, 'disabled'),
				(${uuids[1].uuid}::uuid, 'second', ${date_result.value}, ${room_uuid_result.value.uuid}::uuid, 'disabled'),
				(${uuids[2].uuid}::uuid, 'third', ${date_result.value}, ${room_uuid_result.value.uuid}::uuid, 'disabled'),
				(${uuids[3].uuid}::uuid, 'fourth', ${date_result.value}, ${room_uuid_result.value.uuid}::uuid, 'disabled')
				RETURNING rord_uuid;
		`);

		if (result_2.rows.length !== 4) {
			return ctx.json({ message: 'Failed to insert' }, 500);
		}

		return ctx.json({ message: '利用禁止の日時を設定しました。' });
	}
);

app.get(
	'/rooms/:room_uuid/reservations/',
	vValidator('param', object({ room_uuid: string() }), (result, ctx) => {
		if (!result.success) {
			return ctx.json({ message: 'Invalid request' }, 400);
		}
	}),
	async (ctx) => {
		const pool = ctx.get('pool');

		const room_uuid_result = newUuidValue(ctx.req.valid('param').room_uuid);

		const clerkClient = createClerkClient({
			secretKey: ctx.env.CLERK_SECRET_KEY,
			publishableKey: ctx.env.CLERK_PUBLISHABLE_KEY,
		});

		if (room_uuid_result.isErr()) {
			return ctx.json({ message: 'Invalid room_uuid' }, 400);
		}

		// もしステータスがdisabledであれば、user_idはnullになる
		const result = await pool.query<{
			rord_uuid: string;
			room_uuid: string;
			room_name: string | null;
			status: 'reserved' | 'disabled';
			date: Date;
			slot: 'first' | 'second' | 'third' | 'fourth';
			user_id: string | null;
		}>(
			sql`
				SELECT 
					rod.rord_uuid,
					rod.room_uuid,
					room.name as room_name,
					rod.status,
					rod.date,
					rod.slot,
					CASE 
						WHEN rod.status = 'reserved' THEN res.user_id
						ELSE NULL
					END AS user_id
				FROM 
					reservation_or_disabled rod
				LEFT JOIN
					room
				ON
					rod.room_uuid = room.room_uuid
				LEFT JOIN 
					reservation res 
				ON 
					rod.reservation_uuid = res.reservation_uuid
				ORDER BY 
					rod.date, 
					rod.slot;
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
			const reservation_uuid_result = newUuidValue(row.rord_uuid);
			if (reservation_uuid_result.isErr()) {
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
				reservation_uuid: reservation_uuid_result.value.uuid,
				room: {
					room_uuid: room_uuid_result.value.uuid,
					name: row.room_name ?? '',
				},
				slot: slot_result.value.slot,
				date: convertFromDate(date),
				user: row.user_id === null ? null : { user_id: user?.id ?? '', name: user?.username ?? '' },
			});
		}

		return ctx.json({ reservations: response });
	}
);

app.get(
	'/rooms/:room_uuid/reservations/start_date/:start_date/end_date/:end_date/',
	vValidator('param', object({ room_uuid: string(), start_date: string(), end_date: string() }), (result, ctx) => {
		if (!result.success) {
			return ctx.json({ message: 'Invalid request' }, 400);
		}
	}),
	async (ctx) => {
		const pool = ctx.get('pool');

		const room_uuid_result = newUuidValue(ctx.req.valid('param').room_uuid);

		const clerkClient = createClerkClient({
			secretKey: ctx.env.CLERK_SECRET_KEY,
			publishableKey: ctx.env.CLERK_PUBLISHABLE_KEY,
		});

		if (room_uuid_result.isErr()) {
			return ctx.json({ message: 'Invalid room_uuid' }, 400);
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
			room_name: string | null;
			status: 'reserved' | 'disabled';
			date: Date;
			slot: 'first' | 'second' | 'third' | 'fourth';
			user_id: string | null;
		}>(
			sql`
			SELECT 
				rod.rord_uuid,
				rod.room_uuid,
				room.name as room_name,
				rod.status,
				rod.date,
				rod.slot,
				CASE 
					WHEN rod.status = 'reserved' THEN res.user_id
					ELSE NULL
				END AS user_id
			FROM 
				reservation_or_disabled rod
			LEFT JOIN
				room
			ON
				rod.room_uuid = room.room_uuid
			LEFT JOIN 
				reservation res 
			ON 
				rod.reservation_uuid = res.reservation_uuid
			WHERE 
				rod.date >= ${start_date} AND rod.date <= ${end_date}
			ORDER BY 
				rod.date, 
				rod.slot;
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
			const reservation_uuid_result = newUuidValue(row.rord_uuid);
			if (reservation_uuid_result.isErr()) {
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
				reservation_uuid: reservation_uuid_result.value.uuid,
				room: {
					room_uuid: room_uuid_result.value.uuid,
					name: row.room_name ?? '',
				},
				slot: slot_result.value.slot,
				date: convertFromDate(date),
				user: user === null ? null : { user_id: user?.id ?? '', name: user?.username ?? '' },
			});
		}
		return ctx.json({ start_date: convertFromDate(start_date), end_date: convertFromDate(end_date), reservations: response });
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
			room_name: string | null;
			status: 'reserved' | 'disabled';
			date: Date;
			slot: 'first' | 'second' | 'third' | 'fourth';
			user_id: string | null;
		}>(
			sql`
			SELECT 
				rod.rord_uuid,
				rod.room_uuid,
				room.name as room_name,
				rod.status,
				rod.date,
				rod.slot,
				CASE 
					WHEN rod.status = 'reserved' THEN res.user_id
					ELSE NULL
				END AS user_id
			FROM 
				reservation_or_disabled rod
			LEFT JOIN
				room
			ON
				rod.room_uuid = room.room_uuid
			LEFT JOIN 
				reservation res 
			ON 
				rod.reservation_uuid = res.reservation_uuid
			WHERE 
				rod.date >= ${start_date} AND rod.date <= ${end_date}
			ORDER BY 
				rod.date, 
				rod.slot;
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
			const reservation_uuid_result = newUuidValue(row.rord_uuid);
			if (reservation_uuid_result.isErr()) {
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
				reservation_uuid: reservation_uuid_result.value.uuid,
				room: {
					room_uuid: room_uuid_result.value.uuid,
					name: row.room_name ?? '',
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
			room_name: string | null;
			status: 'reserved' | 'disabled';
			date: Date;
			slot: 'first' | 'second' | 'third' | 'fourth';
			user_id: string | null;
		}>(
			sql`
			SELECT 
				rod.rord_uuid,
				rod.room_uuid,
				room.name as room_name,
				rod.status,
				rod.date,
				rod.slot,
				CASE 
					WHEN rod.status = 'reserved' THEN res.user_id
					ELSE NULL
				END AS user_id
			FROM 
				reservation_or_disabled rod
			LEFT JOIN
				room
			ON
				rod.room_uuid = room.room_uuid
			LEFT JOIN 
				reservation res 
			ON 
				rod.reservation_uuid = res.reservation_uuid
			WHERE 
				(rod.status = 'disabled' OR res.user_id = ${clerk_user_id_result.value.user_id}::text) AND rod.date >= ${start_date} AND rod.date <= ${end_date}
			ORDER BY 
				rod.date, 
				rod.slot;
	`
		);

		const clerkClient = createClerkClient({
			secretKey: ctx.env.CLERK_SECRET_KEY,
			publishableKey: ctx.env.CLERK_PUBLISHABLE_KEY,
		});

		const user = await clerkClient.users.getUser(clerk_user.userId);

		// if (result.rows.length === 0) {
		// 	return ctx.json({ message: 'No reservations' }, 404);
		// }

		const response: ReservationResponse[] = [];

		for (const row of result.rows) {
			const reservation_uuid_result = newUuidValue(row.rord_uuid);
			if (reservation_uuid_result.isErr()) {
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
				reservation_uuid: reservation_uuid_result.value.uuid,
				room: {
					room_uuid: room_uuid_result.value.uuid,
					name: row.room_name ?? '',
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

		// 念の為、平日であることを確認
		if (date.getDay() === 0 || date.getDay() === 6) {
			return ctx.json({ message: 'Invalid date' }, 400);
		}

		const start_date = getMondayOfThisWeek(date);
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
				SELECT count(*)::int FROM reservation_or_disabled rod
				LEFT JOIN reservation res ON rod.reservation_uuid = res.reservation_uuid
				WHERE res.user_id = ${user_id_result.value.user_id}::text AND rod.date >= ${start_date} AND rod.date <= ${end_date};
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
	'/reservations/:reservation_uuid/',
	vValidator('param', object({ reservation_uuid: string() }), (result, ctx) => {
		if (!result.success) {
			return ctx.json({ message: 'Invalid request' }, 400);
		}
	}),

	async (ctx) => {
		const pool = ctx.get('pool');

		const reservation_uuid_result = newUuidValue(ctx.req.valid('param').reservation_uuid);

		if (reservation_uuid_result.isErr()) {
			return ctx.json({ message: 'Invalid reservation_uuid' }, 400);
		}

		const result = await pool.query<{ status: 'reserved' | 'disabled'; date: Date; user_id: string | null }>(
			sql`
				SELECT rod.status, rod.date, res.user_id FROM reservation_or_disabled rod LEFT JOIN reservation res ON rod.reservation_uuid = res.reservation_uuid WHERE rod.reservation_uuid = ${reservation_uuid_result.value.uuid}::uuid;
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
			sql`
				DELETE FROM reservation_or_disabled WHERE reservation_uuid = ${reservation_uuid_result.value.uuid}::uuid RETURNING rord_uuid;
			`
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
