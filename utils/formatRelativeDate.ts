import { format } from 'date-fns';

// "Today" / "Yesterday" / "N days ago" for the last week, then a calendar date
// ("Aug 20", or "Aug 20, 2025" when it isn't the current year).
export function formatRelativeDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    const dateDay = new Date(y, m - 1, d);
    const today = new Date();
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((todayDay.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    return format(dateDay, dateDay.getFullYear() === today.getFullYear() ? 'MMM d' : 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}
