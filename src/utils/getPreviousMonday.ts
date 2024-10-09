// 直前の月曜日を取得する関数
// 平日であることが前提
export function getPreviousMonday(date: Date): Date {
	const day = date.getDay();
	const previousMonday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - day + 1);
	return previousMonday;
}
