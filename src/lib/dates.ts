const TZ = "Europe/Moscow";

export function moscowToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(ymd: string, days: number) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function weekdayIndex(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (weekday + 6) % 7;
}

export function mondayOf(ymd: string) {
  return addDays(ymd, -weekdayIndex(ymd));
}

export function dayNumber(ymd: string) {
  return Number(ymd.slice(8, 10));
}

export function monthKey(ymd: string) {
  return ymd.slice(0, 7);
}

export function shiftMonth(ym: string, delta: number) {
  const [year, month] = ym.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthGrid(ym: string) {
  const first = `${ym}-01`;
  const start = addDays(first, -weekdayIndex(first));
  const [year, month] = ym.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const last = addDays(next, -1);
  const end = addDays(last, 6 - weekdayIndex(last));
  const days: { ymd: string; inMonth: boolean }[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.push({ ymd: cursor, inMonth: cursor.slice(0, 7) === ym });
  }
  return days;
}

export function moscowDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function formatSlot(iso: string) {
  const date = new Date(iso);
  const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, weekday: "short" })
    .format(date)
    .replace(".", "");
  const day = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return { weekday, day, time, label: `${weekday} ${day}, ${time}` };
}

export function monthTitle(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

export function parseSlot(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+03:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function slotInputValue(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}

export function defaultSlotInput() {
  const tomorrow = addDays(moscowToday(), 1);
  return `${tomorrow}T12:00`;
}

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function weekdayName(ymd: string) {
  return WEEKDAYS[weekdayIndex(ymd)];
}
