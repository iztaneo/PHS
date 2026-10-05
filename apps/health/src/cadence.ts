// Review calendar (D03). Pure date arithmetic on ISO dates (YYYY-MM-DD), no time zones involved:
// the caller decides what "today" is for the project.
export type Cadence = 'weekly' | 'fortnightly' | 'monthly';

const DAY = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return iso(utc(date) + days * DAY);
}

// Calendar months, keeping the anchor's day and falling back to the last day of a shorter month:
// 31 Jan -> 28 Feb (29 in a leap year) -> 31 Mar.
function addMonths(anchor: string, months: number): string {
  const [year, month, day] = anchor.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last)));
}

// The k-th due date of a schedule anchored on `anchor` (k = 0 is the anchor itself).
export function dueDate(anchor: string, cadence: Cadence, k: number): string {
  if (cadence === 'monthly') return addMonths(anchor, k);
  return addDays(anchor, k * (cadence === 'weekly' ? 7 : 14));
}

// First due date of the schedule that is on or after `from`. A late review does not move the
// schedule: the cut-off day stays the same and missed dates are skipped, not piled up.
export function firstDueOnOrAfter(anchor: string, cadence: Cadence, from: string): string {
  let k = 0;
  if (cadence === 'monthly') {
    const [ay, am] = anchor.split('-').map(Number) as [number, number];
    const [fy, fm] = from.split('-').map(Number) as [number, number];
    k = Math.max(0, (fy - ay) * 12 + (fm - am) - 1);
  } else {
    const period = cadence === 'weekly' ? 7 : 14;
    k = Math.max(0, Math.ceil((utc(from) - utc(anchor)) / (period * DAY)));
  }
  while (dueDate(anchor, cadence, k) < from) k += 1;
  return dueDate(anchor, cadence, k);
}

// A review is never due on a non-working day: Saturdays, Sundays and holidays move it to the next
// working day. Only the due date moves; the schedule stays anchored where it was, so the following
// cycles keep their cut-off day.
export function skipHolidays(date: string, holidays: ReadonlySet<string>): string {
  let day = date;
  while (holidays.has(day) || [0, 6].includes(new Date(utc(day)).getUTCDay())) day = addDays(day, 1);
  return day;
}
