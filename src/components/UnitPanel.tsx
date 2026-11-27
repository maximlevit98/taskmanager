import {
  addCommentAction,
  changeSlotAction,
  markOutcomeAction,
  saveComposeAction,
  saveLinkAction,
  sendForApprovalAction,
} from "@/app/content-actions";
import type { Role } from "@/lib/auth";
import { contentTypes, personColor, platformLabel, typeLabel } from "@/lib/catalog";
import type { Account, Unit } from "@/lib/content";
import { canPublish } from "@/lib/content";
import { formatSlot, slotInputValue } from "@/lib/dates";

export function UnitPanel({
  projectId,
  unit,
  accounts,
  approverName,
  role,
  returnTo,
}: {
  projectId: string;
  unit: Unit;
  accounts: Account[];
  approverName?: string;
  role: Role;
  returnTo: string;
}) {
  const hidden = (
    <>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="unitId" value={unit.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
  const accountLine = unit.handle
    ? `${platformLabel(unit.platform)} · ${unit.handle}`
    : "аккаунт не выбран";
  const when = unit.slot_at ? formatSlot(unit.slot_at) : null;

  return (
    <div className="panel">
      <div className="panel-kicker">
        {when ? `Слот ${when.label}` : "Без слота"}
        <span>версия {unit.version}</span>
      </div>
      <h2>{unit.title}</h2>
      <p className="meta">
        {typeLabel(unit.content_type) || "вид не выбран"} · {accountLine}
      </p>
      <p className="manual">Напоминание, вручную. Сеть не вызывается.</p>

      <section>
        <h3>Кто участвует</h3>
        {unit.people.length === 0 ? <p className="muted">Пока никого.</p> : null}
        <ul className="people">
          {unit.people.map((person) => (
            <li key={person.user_id}>
              <span className="av" style={{ background: personColor(person.name) }}>
                {person.name.trim()[0]?.toUpperCase()}
              </span>
              <span>
                {person.name}
                {person.task ? <em> · {person.task}</em> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {role === "approver" ? null : (
        <form className="stack tight" action={saveComposeAction}>
          {hidden}
          <label>
            Название
            <input name="title" defaultValue={unit.title} required />
          </label>
          <label>
            Текст
            <textarea name="body" rows={4} defaultValue={unit.body} />
          </label>
          <label>
            Вид
            <select name="contentType" defaultValue={unit.content_type ?? ""}>
              {contentTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Аккаунт
            <select name="accountId" defaultValue={unit.account_id ?? ""}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {platformLabel(account.platform)} · {account.handle}
                </option>
              ))}
            </select>
          </label>
          <button className="sec" type="submit">
            Сохранить содержание
          </button>
          <p className="muted">Правка текста, вида, аккаунта или ссылки снимает «да».</p>
        </form>
      )}

      <section>
        <h3>Комментарии</h3>
        {unit.comments.length === 0 ? <p className="muted">Текстовых комментариев ещё нет.</p> : null}
        <ul className="comments">
          {unit.comments.map((comment) => (
            <li key={comment.id}>
              <b>{comment.name}</b> {comment.body}
            </li>
          ))}
        </ul>
        {role === "approver" ? null : (
          <form className="stack tight" action={addCommentAction}>
            {hidden}
            <input name="body" placeholder="Комментарий" required />
            <button className="sec" type="submit">
              Написать
            </button>
          </form>
        )}
      </section>

      <section>
        <h3>Файл</h3>
        {unit.links[0] ? (
          <p>
            <a href={unit.links[0].url} target="_blank" rel="noreferrer">
              {unit.links[0].label || unit.links[0].url}
            </a>
          </p>
        ) : (
          <p className="muted">Внешней ссылки нет. Файл в продукт не загружается.</p>
        )}
        {role === "approver" ? null : (
          <form className="stack tight" action={saveLinkAction}>
            {hidden}
            <input name="url" type="url" placeholder="https://..." defaultValue={unit.links[0]?.url ?? ""} required />
            <input name="label" placeholder="что по ссылке" defaultValue={unit.links[0]?.label ?? ""} />
            <button className="sec" type="submit">
              Сохранить ссылку
            </button>
          </form>
        )}
      </section>

      <section className="gate">
        <h3>Ворота</h3>
        <p>{gateCopy(unit, approverName)}</p>
        {role !== "approver" && unit.gate !== "pending" && unit.gate !== "yes" ? (
          <form action={sendForApprovalAction}>
            {hidden}
            <button className="pri" type="submit">
              {approverName ? `Отправить ${approverName}` : "Отправить на «да»"}
            </button>
          </form>
        ) : null}
        {role !== "approver" ? (
          <form className="inline wrap" action={changeSlotAction}>
            {hidden}
            <input name="slot" type="datetime-local" defaultValue={unit.slot_at ? slotInputValue(unit.slot_at) : ""} required />
            <button className="sec" type="submit">
              Сменить время
            </button>
          </form>
        ) : null}
        <p className="muted">Смена часа «да» не снимает.</p>
      </section>

      <section>
        <h3>Выход</h3>
        {unit.outcome === "out" ? <p>Вышло. Это отметка человека, не ответ сети.</p> : null}
        {unit.outcome === "failed" ? <p>Не вышло. {unit.outcome_reason}</p> : null}
        {canPublish(unit) && (role === "owner" || role === "publisher") ? (
          <div className="stack tight">
            <form action={markOutcomeAction}>
              {hidden}
              <input type="hidden" name="expectedVersion" value={unit.version} />
              <input type="hidden" name="expectedPublicationAttempt" value={unit.publication_attempt} />
              <input type="hidden" name="outcome" value="out" />
              <button className="pri" type="submit">
                Вышло
              </button>
            </form>
            <form className="stack tight" action={markOutcomeAction}>
              {hidden}
              <input type="hidden" name="expectedVersion" value={unit.version} />
              <input type="hidden" name="expectedPublicationAttempt" value={unit.publication_attempt} />
              <input type="hidden" name="outcome" value="failed" />
              <input name="reason" placeholder="Почему не вышло" required />
              <button className="sec" type="submit">
                Не вышло
              </button>
            </form>
          </div>
        ) : null}
        {canPublish(unit) && role !== "owner" && role !== "publisher" ? (
          <p className="muted">«Да» уже есть. Отметку «вышло» или «не вышло» ставит владелец или публикатор.</p>
        ) : null}
        {!canPublish(unit) && !unit.outcome ? (
          <p className="muted">Без «да» согласующего слот не публикуется.</p>
        ) : null}
      </section>

      {unit.events.length > 0 ? (
        <section>
          <h3>История</h3>
          <ul className="comments">
            {unit.events.slice(-6).map((event) => (
              <li key={event.id}>
                <b>{event.name || "Система"}</b> {eventLabel(event.kind)}
                {event.note ? ` — ${event.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function gateCopy(unit: Unit, approverName?: string) {
  if (!approverName) return "Согласующий не назначен. Без его «да» слот не публикуется.";
  if (unit.gate === "yes") return `Да · ${approverName} · версия ${unit.approved_version}. Само ничего не уходит в сеть.`;
  if (unit.gate === "pending") return `Ждёт «да» · ${approverName}. Слот на календаре есть, выпуска нет.`;
  if (unit.gate === "returned") return `Возврат: ${unit.return_reason}`;
  return `Без «да». ${approverName} эту версию ещё не смотрел.`;
}

function eventLabel(kind: string) {
  const labels: Record<string, string> = {
    idea: "оставил идеей",
    created: "поставил в календарь",
    promoted: "сделал единицей",
    edited: "поменял содержание",
    rescheduled: "сменил время",
    withdrawn: "снял",
    sent: "отправил на «да»",
    approved: "сказал «да»",
    returned: "вернул",
    published: "отметил «вышло»",
    failed: "отметил «не вышло»",
  };
  return labels[kind] || kind;
}
