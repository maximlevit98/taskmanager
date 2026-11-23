import { UnitPanel } from "@/components/UnitPanel";
import type { Role } from "@/lib/auth";
import { chipFor, personColor, platformLabel, toneLabel, typeLabel } from "@/lib/catalog";
import { latestComment, type Account, type Unit } from "@/lib/content";
import {
  addDays,
  dayNumber,
  formatSlot,
  mondayOf,
  monthGrid,
  monthKey,
  monthTitle,
  moscowDay,
  moscowToday,
  shiftMonth,
  weekdayName,
} from "@/lib/dates";

function href(projectId: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return `/projects/${projectId}${text ? `?${text}` : ""}`;
}

export function CalendarBoard({
  projectId,
  units,
  accounts,
  approverName,
  role,
  view,
  from,
  month,
  selectedId,
  error,
}: {
  projectId: string;
  units: Unit[];
  accounts: Account[];
  approverName?: string;
  role: Role;
  view: "large" | "month" | "list";
  from: string;
  month: string;
  selectedId?: string;
  error?: string;
}) {
  const slotted = units.filter((unit) => unit.slot_at && unit.status !== "idea" && unit.status !== "pulled");
  const selected = units.find((unit) => unit.id === selectedId && unit.status !== "pulled");
  const today = moscowToday();
  const here = href(projectId, {
    view: view === "large" ? undefined : view,
    from: view === "large" ? from : undefined,
    month: view === "large" ? undefined : month,
    unit: selected?.id,
  });

  return (
    <div className="workspace">
      <div>
        <div className="cal-head">
          <h1>Календарь</h1>
          <div className="tabs">
            <a className={view === "large" ? "on" : ""} href={href(projectId, { from, unit: selected?.id })}>
              Крупно
            </a>
            <a className={view === "month" ? "on" : ""} href={href(projectId, { view: "month", month, unit: selected?.id })}>
              Месяц
            </a>
            <a className={view === "list" ? "on" : ""} href={href(projectId, { view: "list", month, unit: selected?.id })}>
              Список
            </a>
          </div>
          {view === "large" ? <WeekPager projectId={projectId} from={from} unit={selected?.id} /> : null}
          {view !== "large" ? <MonthPager projectId={projectId} month={month} view={view} unit={selected?.id} /> : null}
        </div>
        {error ? <div className="error">{error}</div> : null}
        {!approverName ? (
          <div className="note">
            Назначьте одного согласующего в участниках. Без его «да» слот не публикуется.{" "}
            <a href={`/projects/${projectId}/members`}>К участникам</a>
          </div>
        ) : null}
        {view === "large" ? <LargeWeek projectId={projectId} from={from} today={today} units={slotted} selectedId={selected?.id} /> : null}
        {view === "month" ? <MonthGrid projectId={projectId} month={month} today={today} units={slotted} selectedId={selected?.id} /> : null}
        {view === "list" ? <ListView projectId={projectId} month={month} units={slotted} selectedId={selected?.id} /> : null}
        {slotted.length === 0 ? (
          <p className="lead">
            В календаре пока пусто. Единица без слота лежит в идеях.{" "}
            <a href={`/projects/${projectId}/new`}>Новая единица</a>
          </p>
        ) : null}
      </div>
      {selected ? (
        <UnitPanel
          projectId={projectId}
          unit={selected}
          accounts={accounts}
          approverName={approverName}
          role={role}
          returnTo={here}
        />
      ) : (
        <div className="panel quiet">
          <h2>Карточка</h2>
          <p className="muted">Выберите плашку. Здесь текст, ссылка на файл, комментарии, «да» и ручная отметка выхода.</p>
        </div>
      )}
    </div>
  );
}

function WeekPager({ projectId, from, unit }: { projectId: string; from: string; unit?: string }) {
  const start = addDays(from, -14);
  const weeks = Array.from({ length: 5 }, (_, index) => {
    const monday = addDays(start, index * 7);
    return { monday, label: `${dayNumber(monday)}–${dayNumber(addDays(monday, 6))}` };
  });
  return (
    <div className="weeks">
      <a href={href(projectId, { from: addDays(from, -7), unit })}>←</a>
      {weeks.map((week) => (
        <a key={week.monday} className={week.monday === from ? "on" : ""} href={href(projectId, { from: week.monday, unit })}>
          {week.label}
        </a>
      ))}
      <a href={href(projectId, { from: addDays(from, 7), unit })}>→</a>
    </div>
  );
}

function MonthPager({
  projectId,
  month,
  view,
  unit,
}: {
  projectId: string;
  month: string;
  view: "month" | "list";
  unit?: string;
}) {
  return (
    <div className="weeks">
      <a href={href(projectId, { view, month: shiftMonth(month, -1), unit })}>←</a>
      <span>{monthTitle(month)}</span>
      <a href={href(projectId, { view, month: shiftMonth(month, 1), unit })}>→</a>
    </div>
  );
}

function LargeWeek({
  projectId,
  from,
  today,
  units,
  selectedId,
}: {
  projectId: string;
  from: string;
  today: string;
  units: Unit[];
  selectedId?: string;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(from, index));
  return (
    <div className="week">
      {days.map((day) => {
        const cards = units
          .filter((unit) => unit.slot_at && moscowDay(unit.slot_at) === day)
          .sort((a, b) => (a.slot_at || "").localeCompare(b.slot_at || ""));
        return (
          <div className={day === today ? "day today" : "day"} key={day}>
            <div className="dow">
              <span>{weekdayName(day)}</span>
              <b>{dayNumber(day)}</b>
              {day === today ? <em>сегодня</em> : null}
            </div>
            <div className={cards.length > 1 ? "day-cards" : "day-cards one"}>
              {cards.length === 0 ? <div className="empty">пусто</div> : null}
              {cards.map((unit) => (
                <UnitCard key={unit.id} projectId={projectId} from={from} unit={unit} selected={unit.id === selectedId} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UnitCard({
  projectId,
  from,
  unit,
  selected,
}: {
  projectId: string;
  from: string;
  unit: Unit;
  selected: boolean;
}) {
  const chip = chipFor(unit);
  const line = unit.body || latestComment(unit) || "Без текста";
  const when = unit.slot_at ? formatSlot(unit.slot_at) : null;
  return (
    <a className={`ucard tone-${unit.tone}${selected ? " on" : ""}`} href={href(projectId, { from, unit: unit.id })}>
      <div className="ucard-top">
        <h3>{unit.title}</h3>
        <span className={`chip chip-${chip.kind}`}>{chip.label}</span>
      </div>
      <div className="meta">
        {typeLabel(unit.content_type)}
        {unit.handle ? ` · ${platformLabel(unit.platform)} · ${unit.handle}` : ""}
        {when ? ` · ${when.time}` : ""}
        {" · вручную"}
      </div>
      <div className="ucard-mid">
        <span className="avatars">
          {unit.people.map((person) => (
            <i key={person.user_id} className="av" style={{ background: personColor(person.name) }}>
              {person.name.trim()[0]?.toUpperCase()}
            </i>
          ))}
        </span>
      </div>
      <div className="line">{line}</div>
    </a>
  );
}

function MonthGrid({
  projectId,
  month,
  today,
  units,
  selectedId,
}: {
  projectId: string;
  month: string;
  today: string;
  units: Unit[];
  selectedId?: string;
}) {
  const days = monthGrid(month);
  return (
    <>
      <div className="month-names">
        {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className="month">
        {days.map((day) => {
          const cards = units.filter((unit) => unit.slot_at && moscowDay(unit.slot_at) === day.ymd);
          return (
            <div key={day.ymd} className={`cell${day.inMonth ? "" : " out"}${day.ymd === today ? " today" : ""}`}>
              <div className="n">{dayNumber(day.ymd)}</div>
              {cards.slice(0, 3).map((unit) => {
                const chip = chipFor(unit);
                const when = unit.slot_at ? formatSlot(unit.slot_at) : null;
                return (
                  <a
                    key={unit.id}
                    className={`pill tone-${unit.tone}${unit.id === selectedId ? " on" : ""}`}
                    href={href(projectId, { view: "month", month, unit: unit.id })}
                  >
                    {when?.time} {unit.title} · {chip.label}
                  </a>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ListView({
  projectId,
  month,
  units,
  selectedId,
}: {
  projectId: string;
  month: string;
  units: Unit[];
  selectedId?: string;
}) {
  const rows = units
    .filter((unit) => unit.slot_at && monthKey(moscowDay(unit.slot_at)) === month)
    .sort((a, b) => (a.slot_at || "").localeCompare(b.slot_at || ""));
  return (
    <table className="sheet">
      <thead>
        <tr>
          <th>Название</th>
          <th>Вид</th>
          <th>Аккаунт</th>
          <th>Кто</th>
          <th>Когда</th>
          <th>Статус</th>
          <th>Комментарий</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((unit) => {
          const chip = chipFor(unit);
          const when = unit.slot_at ? formatSlot(unit.slot_at) : null;
          return (
            <tr key={unit.id} className={unit.id === selectedId ? "on" : ""}>
              <td>
                <a href={href(projectId, { view: "list", month, unit: unit.id })}>
                  <b>{unit.title}</b>
                </a>
              </td>
              <td>
                {typeLabel(unit.content_type)}
                <div className="muted">{toneLabel(unit.tone)}</div>
              </td>
              <td>
                {unit.handle ? (
                  <>
                    {platformLabel(unit.platform)} · {unit.handle}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <span className="avatars">
                  {unit.people.map((person) => (
                    <i key={person.user_id} className="av" style={{ background: personColor(person.name) }}>
                      {person.name.trim()[0]?.toUpperCase()}
                    </i>
                  ))}
                </span>
              </td>
              <td>
                {when?.label}
                <div className="muted">вручную</div>
              </td>
              <td>
                <span className={`chip chip-${chip.kind}`}>{chip.label}</span>
              </td>
              <td>{latestComment(unit) || unit.body || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function calendarQuery(search: { view?: string; from?: string; month?: string }) {
  const today = moscowToday();
  const view = search.view === "month" || search.view === "list" ? search.view : "large";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(search.from || "") ? mondayOf(search.from || today) : mondayOf(today);
  const month = /^\d{4}-\d{2}$/.test(search.month || "") ? search.month || monthKey(today) : monthKey(today);
  return { view, from, month } as const;
}
