// 平日かどうかを判定する関数
export function isWeekday(date: Date): boolean {
	const day = date.getDay();
	return day !== 0 && day !== 6;
}
