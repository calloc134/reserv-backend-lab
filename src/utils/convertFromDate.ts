export function convertFromDate(date: Date): string {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	// yyyy-MM-dd形式に変換
	// return `${year}-${month}-${day}`;
	return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}
