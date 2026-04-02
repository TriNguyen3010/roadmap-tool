export function formatWorkdayDuration(workdays: number): string {
  if (workdays <= 0) return '0d';

  const weeks = Math.floor(workdays / 5);
  const days = workdays % 5;

  if (weeks === 0) return `${days}d`;
  if (days === 0) return `${weeks}w`;
  return `${weeks}w ${days}d`;
}
