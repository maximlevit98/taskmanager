"use client";

import { createUnitAction } from "@/app/content-actions";
import { contentTypes, personColor, platformLabel, tones, typeLabel } from "@/lib/catalog";
import { useState } from "react";

type Member = { user_id: string; name: string };
type Account = { id: string; platform: string; handle: string; kind: string };

export function NewUnitForm({
  projectId,
  members,
  accounts,
  idea,
  defaultSlot,
}: {
  projectId: string;
  members: Member[];
  accounts: Account[];
  idea?: { id: string; title: string; body: string; people: string[] };
  defaultSlot: string;
}) {
  const [title, setTitle] = useState(idea?.title ?? "");
  const [body, setBody] = useState(idea?.body ?? "");
  const [type, setType] = useState<string>(contentTypes[0].id);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [people, setPeople] = useState<string[]>(idea?.people ?? []);
  const [tasks, setTasks] = useState<Record<string, string>>({});
  const [tone, setTone] = useState("sand");
  const account = accounts.find((item) => item.id === accountId);
  const names = members.filter((member) => people.includes(member.user_id)).map((member) => member.name);

  function toggle(id: string) {
    setPeople((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <form className="composer" action={createUnitAction}>
      <input type="hidden" name="projectId" value={projectId} />
      {idea ? <input type="hidden" name="ideaId" value={idea.id} /> : null}
      <section>
        <h2>1 · Название</h2>
        <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="О чём единица" required />
      </section>
      <section>
        <h2>2 · Вид контента</h2>
        <div className="chips">
          {contentTypes.map((item) => (
            <label key={item.id} className={type === item.id ? "chip-btn on" : "chip-btn"}>
              <input type="radio" name="contentType" value={item.id} checked={type === item.id} onChange={() => setType(item.id)} />
              {item.label}
            </label>
          ))}
        </div>
      </section>
      <section>
        <h2>3 · На какой аккаунт</h2>
        {accounts.length === 0 ? (
          <p className="muted">
            Аккаунтов ещё нет. <a href={`/projects/${projectId}/connections`}>Добавьте подключение</a>, иначе в календарь не поставить.
          </p>
        ) : (
          <div className="chips">
            {accounts.map((item) => (
              <label key={item.id} className={accountId === item.id ? "chip-btn on" : "chip-btn"}>
                <input
                  type="radio"
                  name="accountId"
                  value={item.id}
                  checked={accountId === item.id}
                  onChange={() => setAccountId(item.id)}
                />
                <b>
                  {platformLabel(item.platform)} · {item.handle}
                </b>
                {item.kind ? <small>{item.kind}</small> : null}
              </label>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2>4 · Кто участвует</h2>
        <div className="chips">
          {members.map((member) => {
            const on = people.includes(member.user_id);
            return (
              <label key={member.user_id} className={on ? "chip-btn on" : "chip-btn"}>
                <input type="checkbox" name="person" value={member.user_id} checked={on} onChange={() => toggle(member.user_id)} />
                <i className="av" style={{ background: personColor(member.name) }}>
                  {member.name.trim()[0]?.toUpperCase()}
                </i>
                {member.name}
              </label>
            );
          })}
        </div>
        {people.map((id) => (
          <label key={id} className="task-line">
            Задача · {members.find((member) => member.user_id === id)?.name}
            <input
              name={`task-${id}`}
              value={tasks[id] ?? ""}
              placeholder="текст, ролик, выложить"
              onChange={(event) => setTasks((current) => ({ ...current, [id]: event.target.value }))}
            />
          </label>
        ))}
      </section>
      <section>
        <h2>Фон ячейки</h2>
        <div className="swatches">
          {tones.map((item) => (
            <label key={item.id} className={tone === item.id ? "on" : ""}>
              <input type="radio" name="tone" value={item.id} checked={tone === item.id} onChange={() => setTone(item.id)} />
              <i style={{ background: item.swatch }} />
            </label>
          ))}
        </div>
      </section>
      <label>
        Текст
        <textarea name="body" rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Что публикуем" />
      </label>
      <label>
        Слот, московское время
        <input name="slot" type="datetime-local" defaultValue={defaultSlot} />
      </label>
      <div className={`preview tone-${tone}`}>
        <b>{title || "Без названия"}</b>
        <div>
          {typeLabel(type)}
          {account ? ` · ${platformLabel(account.platform)} · ${account.handle}` : ""}
          {names.length ? ` · ${names.join(", ")}` : ""}
        </div>
      </div>
      <div className="actions">
        <button className="pri" name="intent" value="slot" type="submit" disabled={accounts.length === 0}>
          Поставить в календарь
        </button>
        <button className="sec" name="intent" value="idea" type="submit">
          Оставить идеей
        </button>
      </div>
      <p className="muted">Идея живёт без вида, аккаунта и слота. В календарь она не попадает, пока её не поставят.</p>
    </form>
  );
}
