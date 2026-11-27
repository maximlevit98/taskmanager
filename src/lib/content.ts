import type { Role } from "./auth";
import { isContentType, isTone } from "./catalog";
import { query, transaction, type Sql } from "./db";

export type Person = { user_id: string; name: string; task: string };
export type Comment = { id: string; user_id: string; name: string; body: string; created_at: string };
export type AssetLink = { id: string; url: string; label: string };
export type UnitEvent = {
  id: string;
  kind: string;
  note: string;
  version: number;
  name: string | null;
  created_at: string;
};

export type Unit = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  content_type: string | null;
  account_id: string | null;
  platform: string | null;
  handle: string | null;
  kind: string | null;
  connected: boolean | null;
  slot_at: string | null;
  tone: string;
  status: string;
  gate: string;
  version: number;
  review_round: number;
  publication_attempt: number;
  approved_version: number | null;
  approved_by: string | null;
  approved_at: string | null;
  return_reason: string | null;
  outcome: "out" | "failed" | null;
  outcome_reason: string | null;
  created_by: string;
  created_at: string;
  people: Person[];
  comments: Comment[];
  links: AssetLink[];
  events: UnitEvent[];
};

export type Account = {
  id: string;
  platform: string;
  handle: string;
  kind: string;
  owner_user_id: string | null;
  owner_name: string | null;
  connected: boolean;
};

type UnitRow = Omit<Unit, "people" | "comments" | "links" | "events" | "slot_at" | "approved_at" | "created_at" | "outcome"> & {
  slot_at: Date | string | null;
  approved_at: Date | string | null;
  created_at: Date | string;
  outcome: string | null;
};

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function asOutcome(value: string | null): "out" | "failed" | null {
  return value === "out" || value === "failed" ? value : null;
}

export async function listAccounts(projectId: string) {
  const result = await query<Account & { connected: boolean }>(
    `select a.id, a.platform, a.handle, a.kind, a.owner_user_id, u.name as owner_name, a.connected
     from accounts a
     left join users u on u.id = a.owner_user_id
     where a.project_id = $1
     order by a.platform, a.created_at`,
    [projectId],
  );
  return result.rows;
}

export async function listUnits(projectId: string): Promise<Unit[]> {
  const units = await query<UnitRow>(
    `select u.id, u.project_id, u.title, u.body, u.content_type, u.account_id,
            a.platform, a.handle, a.kind, a.connected,
            u.slot_at, u.tone, u.status, u.gate, u.version, u.review_round, u.publication_attempt, u.approved_version,
            u.approved_by, u.approved_at, u.return_reason, u.outcome, u.outcome_reason,
            u.created_by, u.created_at
     from units u
     left join accounts a on a.id = u.account_id
     where u.project_id = $1
     order by u.created_at desc`,
    [projectId],
  );
  const people = await query<Person & { unit_id: string }>(
    `select up.unit_id, up.user_id, up.task, usr.name
     from unit_people up
     join users usr on usr.id = up.user_id
     join units u on u.id = up.unit_id
     where u.project_id = $1
     order by usr.name`,
    [projectId],
  );
  const comments = await query<Comment & { unit_id: string; created_at: Date | string }>(
    `select c.id, c.unit_id, c.user_id, usr.name, c.body, c.created_at
     from unit_comments c
     join users usr on usr.id = c.user_id
     join units u on u.id = c.unit_id
     where u.project_id = $1
     order by c.created_at`,
    [projectId],
  );
  const links = await query<AssetLink & { unit_id: string }>(
    `select l.id, l.unit_id, l.url, l.label
     from unit_links l
     join units u on u.id = l.unit_id
     where u.project_id = $1
     order by l.created_at`,
    [projectId],
  );
  const events = await query<UnitEvent & { unit_id: string; created_at: Date | string }>(
    `select e.id, e.unit_id, e.kind, e.note, e.version, usr.name, e.created_at
     from unit_events e
     left join users usr on usr.id = e.user_id
     join units u on u.id = e.unit_id
     where u.project_id = $1
     order by e.created_at`,
    [projectId],
  );

  return units.rows.map((row) => ({
    ...row,
    slot_at: iso(row.slot_at),
    approved_at: iso(row.approved_at),
    created_at: iso(row.created_at) || new Date().toISOString(),
    outcome: asOutcome(row.outcome),
    people: people.rows
      .filter((person) => person.unit_id === row.id)
      .map(({ user_id, name, task }) => ({ user_id, name, task })),
    comments: comments.rows
      .filter((comment) => comment.unit_id === row.id)
      .map((comment) => ({ ...comment, created_at: iso(comment.created_at) || "" })),
    links: links.rows
      .filter((link) => link.unit_id === row.id)
      .map(({ id, url, label }) => ({ id, url, label })),
    events: events.rows
      .filter((event) => event.unit_id === row.id)
      .map((event) => ({ ...event, created_at: iso(event.created_at) || "" })),
  }));
}

export async function getUnit(projectId: string, unitId: string) {
  const units = await listUnits(projectId);
  return units.find((unit) => unit.id === unitId) ?? null;
}

export type WorkItem = { unitId: string; title: string; kind: string; text: string; href: string };

export function workFor(unit: Unit, role: Role, projectId: string): WorkItem[] {
  if (unit.status === "idea" || unit.status === "pulled") return [];
  const open = `/projects/${projectId}?unit=${unit.id}`;
  const items: WorkItem[] = [];
  if (unit.gate === "pending" && role === "approver") {
    items.push({
      unitId: unit.id,
      title: unit.title,
      kind: "approve",
      text: "Сказать «да» или вернуть с причиной",
      href: `/projects/${projectId}/approve`,
    });
  }
  const missed =
    unit.slot_at &&
    new Date(unit.slot_at).getTime() < Date.now() &&
    (unit.gate === "pending" || unit.gate === "returned") &&
    !unit.outcome;
  if (role !== "approver" && missed) {
    items.push({
      unitId: unit.id,
      title: unit.title,
      kind: "reschedule",
      text: "Слот прошёл без «да». Поставить новое время. Сеть не вызывается.",
      href: open,
    });
  }
  if ((role === "owner" || role === "publisher") && unit.gate === "yes" && unit.approved_version === unit.version && !unit.outcome && unit.slot_at) {
    items.push({
      unitId: unit.id,
      title: unit.title,
      kind: "publish",
      text: "Опубликовать вручную и отметить «вышло» или «не вышло»",
      href: open,
    });
  }
  if ((role === "owner" || role === "publisher") && unit.outcome === "failed") {
    items.push({
      unitId: unit.id,
      title: unit.title,
      kind: "failed",
      text: unit.outcome_reason
        ? `Не вышло: ${unit.outcome_reason}`
        : "Не вышло. Запланируйте повторную попытку.",
      href: open,
    });
  }
  return items;
}

async function addEvent(sql: Sql, unitId: string, userId: string, kind: string, note: string, version: number) {
  await sql(
    "insert into unit_events (id, unit_id, user_id, kind, note, version) values ($1, $2, $3, $4, $5, $6)",
    [crypto.randomUUID(), unitId, userId, kind, note, version],
  );
}

function cleanPeople(people: { userId: string; task: string }[]) {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (seen.has(person.userId)) return false;
    seen.add(person.userId);
    return true;
  });
}

export async function saveUnit(input: {
  projectId: string;
  userId: string;
  ideaId?: string;
  initialPeople: string[];
  intent: "idea" | "slot";
  title: string;
  body: string;
  contentType: string;
  accountId: string;
  slotAt: string | null;
  tone: string;
  people: { userId: string; task: string }[];
}): Promise<{ error: string } | { id: string }> {
  const title = input.title.trim();
  if (title.length < 2) return { error: "Назовите единицу" };
  const tone = isTone(input.tone) ? input.tone : "sand";
  const body = input.body.trim();

  if (input.intent === "slot") {
    if (!isContentType(input.contentType)) return { error: "Выберите вид контента" };
    if (!input.accountId) return { error: "Выберите аккаунт" };
    if (!input.slotAt) return { error: "Поставьте время слота" };
    const account = await query("select 1 from accounts where id = $1 and project_id = $2", [
      input.accountId,
      input.projectId,
    ]);
    if (!account.rowCount) return { error: "Аккаунт не из этого проекта" };
  }

  const id = await transaction(async (sql) => {
    // Membership changes lock this same project. Keep the roster stable while applying assignment edits.
    await sql("select id from projects where id = $1 for key share", [input.projectId]);
    const members = await sql<{ user_id: string }>("select user_id from project_members where project_id = $1", [input.projectId]);
    const memberIds = new Set(members.rows.map((member) => member.user_id));
    const people = cleanPeople(input.people).filter((person) => memberIds.has(person.userId));
    let unitId = input.ideaId || "";
    if (unitId) {
      const existing = await sql<{ status: string }>(
        "select status from units where id = $1 and project_id = $2 for update",
        [unitId, input.projectId],
      );
      if (!existing.rows[0] || existing.rows[0].status !== "idea") return "";
      if (input.intent === "idea") {
        await sql("update units set title = $2, body = $3, tone = $4 where id = $1", [unitId, title, body, tone]);
      } else {
        await sql(
          `update units set title = $2, body = $3, content_type = $4, account_id = $5, slot_at = $6,
                  tone = $7, status = 'work', gate = 'none'
           where id = $1`,
          [unitId, title, body, input.contentType, input.accountId, input.slotAt, tone],
        );
      }
      // Only a previously editable assignment can be unchecked on this form.
      const selected = new Set(people.map((person) => person.userId));
      const removed = input.initialPeople.filter((id) => memberIds.has(id) && !selected.has(id));
      await sql("delete from unit_people where unit_id = $1 and user_id = any($2::uuid[])", [unitId, removed]);
    } else {
      unitId = crypto.randomUUID();
      if (input.intent === "idea") {
        await sql(
          `insert into units (id, project_id, title, body, tone, status, gate, created_by)
           values ($1, $2, $3, $4, $5, 'idea', 'none', $6)`,
          [unitId, input.projectId, title, body, tone, input.userId],
        );
      } else {
        await sql(
          `insert into units (id, project_id, title, body, content_type, account_id, slot_at, tone, status, gate, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'work', 'none', $9)`,
          [unitId, input.projectId, title, body, input.contentType, input.accountId, input.slotAt, tone, input.userId],
        );
      }
      await addEvent(sql, unitId, input.userId, input.intent === "idea" ? "idea" : "created", "", 1);
    }
    for (const person of people) {
      await sql(`insert into unit_people (unit_id, user_id, task) values ($1, $2, $3)
                 on conflict (unit_id, user_id) do update set task = excluded.task`, [
        unitId,
        person.userId,
        person.task.trim(),
      ]);
    }
    if (input.ideaId && input.intent === "slot") {
      await addEvent(sql, unitId, input.userId, "promoted", "", 1);
    }
    return unitId;
  });

  if (!id) return { error: "Идея уже не идея" };
  return { id };
}

async function editorUnit(projectId: string, unitId: string) {
  const unit = await getUnit(projectId, unitId);
  return unit && unit.status !== "pulled" ? unit : null;
}

const transitionConflict = "Версия или состояние материала изменились. Обновите страницу.";

type LockedUnit = Pick<Unit,
  "title" | "body" | "content_type" | "account_id" | "version" | "gate" |
  "status" | "outcome" | "approved_version" | "slot_at" | "review_round" | "publication_attempt"
>;

async function lockUnit(sql: Sql, projectId: string, unitId: string) {
  const result = await sql<LockedUnit>(
    `select title, body, content_type, account_id, version, gate, status, outcome,
            approved_version, slot_at::text, review_round, publication_attempt
     from units where project_id = $1 and id = $2 for update`,
    [projectId, unitId],
  );
  return result.rows[0];
}

export async function saveCompose(
  projectId: string,
  userId: string,
  unitId: string,
  patch: { title?: string; body?: string; contentType?: string; accountId?: string },
) {
  return transaction(async (sql) => {
    const unit = await lockUnit(sql, projectId, unitId);
    if (!unit || unit.status === "idea" || unit.status === "pulled") return "Единица не найдена";
    const title = (patch.title ?? unit.title).trim();
    const body = (patch.body ?? unit.body).trim();
    const contentType = patch.contentType ?? unit.content_type ?? "";
    const accountId = patch.accountId ?? unit.account_id ?? "";
    if (title.length < 2) return "Назовите единицу";
    if (contentType && !isContentType(contentType)) return "Выберите вид контента";
    if (accountId) {
      const account = await sql("select 1 from accounts where id = $1 and project_id = $2", [accountId, projectId]);
      if (!account.rowCount) return "Аккаунт не из этого проекта";
    }
    const changed =
      title !== unit.title ||
      body !== unit.body ||
      contentType !== (unit.content_type ?? "") ||
      accountId !== (unit.account_id ?? "");
    const version = changed && (unit.gate !== "none" || unit.outcome) ? unit.version + 1 : unit.version;
    const reset = version !== unit.version;
    await sql(
      `update units set title = $2, body = $3, content_type = $4, account_id = $5,
              version = $6,
              approved_version = case when $7 then null else approved_version end,
              approved_by = case when $7 then null else approved_by end,
              approved_at = case when $7 then null else approved_at end,
              gate = case when $7 then 'none' else gate end,
              status = case when $7 then 'work' else status end,
              outcome = case when $7 then null else outcome end,
              outcome_reason = case when $7 then null else outcome_reason end,
              return_reason = case when $7 then null else return_reason end
       where id = $1`,
      [unitId, title, body, contentType || null, accountId || null, version, reset],
    );
    if (reset) await addEvent(sql, unitId, userId, "edited", "Текст, вид или аккаунт изменились. «Да» снято.", version);
    return null;
  });
}

export async function saveLink(projectId: string, userId: string, unitId: string, url: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return "Нужна ссылка http или https";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "Нужна ссылка http или https";
  const href = parsed.toString();
  const caption = label.trim();
  return transaction(async (sql) => {
    const unit = await lockUnit(sql, projectId, unitId);
    if (!unit || unit.status === "idea" || unit.status === "pulled") return "Единица не найдена";
    const links = await sql<Pick<AssetLink, "id" | "url">>(
      "select id, url from unit_links where unit_id = $1 order by created_at, id limit 1", [unitId],
    );
    const link = links.rows[0];
    const changed = link?.url !== href;
    if (link) {
      await sql("update unit_links set url = $2, label = $3 where id = $1", [link.id, href, caption]);
    } else {
      await sql("insert into unit_links (id, unit_id, url, label) values ($1, $2, $3, $4)", [
        crypto.randomUUID(),
        unitId,
        href,
        caption,
      ]);
    }
    if (changed && (unit.gate !== "none" || unit.outcome)) {
      const version = unit.version + 1;
      await sql(
        `update units set version = $2, gate = 'none', status = 'work', approved_version = null,
               approved_by = null, approved_at = null, outcome = null, outcome_reason = null, return_reason = null
         where id = $1`,
        [unitId, version],
      );
      await addEvent(sql, unitId, userId, "edited", "Ссылка на файл изменилась. «Да» снято.", version);
    }
    return null;
  });
}

export async function addComment(projectId: string, userId: string, unitId: string, body: string) {
  const unit = await editorUnit(projectId, unitId);
  if (!unit) return "Единица не найдена";
  const text = body.trim();
  if (text.length < 1) return "Напишите комментарий";
  await query("insert into unit_comments (id, unit_id, user_id, body) values ($1, $2, $3, $4)", [
    crypto.randomUUID(),
    unitId,
    userId,
    text,
  ]);
  return null;
}

export function rescheduleIntent(unit: Pick<Unit, "status" | "outcome" | "slot_at">) {
  if (!unit.slot_at || unit.status === "idea" || unit.status === "pulled" || unit.status === "out") return null;
  if (unit.status === "failed" && unit.outcome === "failed") return "retry";
  return unit.outcome === null && unit.status !== "failed" ? "reschedule" : null;
}

export async function changeSlot(
  projectId: string,
  userId: string,
  unitId: string,
  slotAt: string,
  expectedVersion: number,
  expectedAttempt: number,
  intent: "reschedule" | "retry",
) {
  return transaction(async (sql) => {
    const unit = await lockUnit(sql, projectId, unitId);
    const currentIntent = unit && rescheduleIntent(unit);
    if (!currentIntent || currentIntent !== intent || unit.version !== expectedVersion || unit.publication_attempt !== expectedAttempt) {
      return transitionConflict;
    }
    const failed = intent === "retry";
    const nextStatus = unit.gate === "yes" ? "waiting" : unit.status;
    await sql(
      `update units set slot_at = $2, publication_attempt = publication_attempt + 1,
              outcome = case when $3 then null else outcome end,
              outcome_reason = case when $3 then null else outcome_reason end,
              status = case when $3 then $4 else status end
       where id = $1`,
      [unitId, slotAt, failed, nextStatus],
    );
    await addEvent(sql, unitId, userId, "rescheduled", "Время слота изменилось. «Да» на месте.", unit.version);
    return null;
  });
}

export async function withdrawIdea(projectId: string, userId: string, unitId: string) {
  return transaction(async (sql) => {
    const unit = await lockUnit(sql, projectId, unitId);
    if (!unit || unit.status !== "idea") return "Это уже не идея";
    await sql("update units set status = 'pulled', slot_at = null where id = $1", [unitId]);
    await addEvent(sql, unitId, userId, "withdrawn", "", unit.version);
    return null;
  });
}

export async function sendForApproval(projectId: string, userId: string, unitId: string) {
  return transaction(async (sql) => {
    const unit = await lockUnit(sql, projectId, unitId);
    if (!unit || unit.status === "idea" || unit.status === "pulled") return "Идею сначала делают единицей со слотом";
    const ready = (unit.status === "work" && unit.gate === "none") ||
      (unit.status === "fixes" && unit.gate === "returned");
    if (!ready || !unit.slot_at || unit.outcome !== null) return transitionConflict;
    if (!unit.content_type || !unit.account_id) return "Нужны вид контента и аккаунт";
    const approver = await sql("select 1 from project_members where project_id = $1 and role = 'approver'", [projectId]);
    if (!approver.rowCount) return "Назначьте одного согласующего";
    await sql(
      `update units set status = 'review', gate = 'pending', return_reason = null,
              review_round = review_round + 1 where id = $1`,
      [unitId],
    );
    await addEvent(sql, unitId, userId, "sent", `Версия ${unit.version}`, unit.version);
    return null;
  });
}

export async function decide(
  projectId: string,
  userId: string,
  unitId: string,
  expectedVersion: number,
  expectedReviewRound: number,
  yes: boolean,
  reason: string,
) {
  if (!yes && reason.trim().length < 2) return "Напишите, что вернуть";
  return transaction(async (sql) => {
    const unit = await lockUnit(sql, projectId, unitId);
    if (!unit || unit.version !== expectedVersion || unit.review_round !== expectedReviewRound ||
        unit.status !== "review" || unit.gate !== "pending" || unit.outcome !== null) {
      return transitionConflict;
    }
    if (yes) {
      await sql(
        `update units set gate = 'yes', status = 'waiting', approved_version = version, approved_by = $2,
                approved_at = now(), return_reason = null
         where id = $1`,
        [unitId, userId],
      );
      await addEvent(sql, unitId, userId, "approved", `Да, версия ${unit.version}`, unit.version);
    } else {
      await sql("update units set gate = 'returned', status = 'fixes', return_reason = $2 where id = $1", [
        unitId,
        reason.trim(),
      ]);
      await addEvent(sql, unitId, userId, "returned", reason.trim(), unit.version);
    }
    return null;
  });
}

export async function markOutcome(
  projectId: string,
  userId: string,
  unitId: string,
  expectedVersion: number,
  expectedPublicationAttempt: number,
  outcome: "out" | "failed",
  reason: string,
) {
  if (outcome !== "out" && outcome !== "failed") return "Выберите результат публикации";
  if (outcome === "failed" && reason.trim().length < 2) return "Напишите, почему не вышло";
  return transaction(async (sql) => {
    const unit = await lockUnit(sql, projectId, unitId);
    if (!unit || unit.version !== expectedVersion || unit.publication_attempt !== expectedPublicationAttempt || !canPublish(unit)) {
      return transitionConflict;
    }
    await sql(
      "update units set outcome = $2, outcome_reason = $3, status = $4 where id = $1",
      [unitId, outcome, outcome === "failed" ? reason.trim() : null, outcome === "out" ? "out" : "failed"],
    );
    await addEvent(
      sql,
      unitId,
      userId,
      outcome === "out" ? "published" : "failed",
      outcome === "failed" ? reason.trim() : "Отмечено вручную",
      unit.version,
    );
    return null;
  });
}

export function latestComment(unit: Unit) {
  return unit.comments[unit.comments.length - 1]?.body ?? "";
}

export function canPublish(unit: Pick<Unit, "status" | "gate" | "approved_version" | "version" | "slot_at" | "outcome">) {
  return unit.status === "waiting" && unit.gate === "yes" && unit.approved_version === unit.version && Boolean(unit.slot_at) && unit.outcome === null;
}
