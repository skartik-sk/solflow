// Minimal 5-field cron parser + next-run calculator (no dependency).
// Supports *, numbers, ranges (a-b), steps (*/n, a-b/n) and lists (a,b).
// Day-of-week 0-7 (0 and 7 = Sunday). When both day-of-month and day-of-week
// are restricted, either may match (standard cron semantics).

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

const FIELDS: Array<{ name: string; min: number; max: number }> = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 7 },
];

function parseField(raw: string, min: number, max: number, name: string): Set<number> {
  const values = new Set<number>();
  for (const part of raw.split(",")) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!match) throw new Error(`Invalid cron ${name} field "${raw}"`);
    const [, range, stepRaw] = match;
    const step = stepRaw ? Number(stepRaw) : 1;
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-").map(Number);
      lo = a;
      hi = b ?? (stepRaw ? max : a);
    }
    if (step < 1 || lo < min || hi > max || lo > hi) {
      throw new Error(`Invalid cron ${name} field "${raw}"`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

export function parseCron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields (got "${expression}")`);
  }
  const [minutes, hours, daysOfMonth, months, dowRaw] = parts.map((part, i) =>
    parseField(part, FIELDS[i].min, FIELDS[i].max, FIELDS[i].name),
  );
  const daysOfWeek = new Set([...dowRaw].map((d) => (d === 7 ? 0 : d)));
  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    domRestricted: parts[2] !== "*",
    dowRestricted: parts[4] !== "*",
  };
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(date: Date, formatter: Intl.DateTimeFormat) {
  const parts: Record<string, string> = {};
  for (const p of formatter.formatToParts(date)) parts[p.type] = p.value;
  return {
    minute: Number(parts.minute),
    hour: Number(parts.hour) % 24,
    day: Number(parts.day),
    month: Number(parts.month),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** Next time (strictly after `from`) the expression fires in `timezone`, or null within a year. */
export function nextCronRun(
  expression: string,
  timezone = "UTC",
  from: Date = new Date(),
): Date | null {
  const cron = parseCron(expression);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    minute: "numeric",
    hour: "numeric",
    day: "numeric",
    month: "numeric",
    weekday: "short",
  });
  const minuteMs = 60_000;
  let t = Math.floor(from.getTime() / minuteMs) * minuteMs + minuteMs;
  const limit = from.getTime() + 366 * 24 * 60 * minuteMs;

  while (t <= limit) {
    const p = localParts(new Date(t), formatter);
    const domMatch = cron.daysOfMonth.has(p.day);
    const dowMatch = cron.daysOfWeek.has(p.weekday);
    const dayMatch =
      cron.domRestricted && cron.dowRestricted
        ? domMatch || dowMatch
        : domMatch && dowMatch;
    if (!cron.months.has(p.month) || !dayMatch) {
      t += ((23 - p.hour) * 60 + (60 - p.minute)) * minuteMs; // next local midnight
      continue;
    }
    if (!cron.hours.has(p.hour)) {
      t += (60 - p.minute) * minuteMs; // next local hour
      continue;
    }
    if (!cron.minutes.has(p.minute)) {
      t += minuteMs;
      continue;
    }
    return new Date(t);
  }
  return null;
}
