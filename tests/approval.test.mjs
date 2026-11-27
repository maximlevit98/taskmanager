import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import ts from "typescript";

assert.ok(process.env.DATABASE_URL, "Set DATABASE_URL to a PostgreSQL test database");
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
const schema = "approval_" + randomUUID().replaceAll("-", "");
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("application_name", schema);
url.searchParams.set("options", [url.searchParams.get("options"), "-c search_path=" + schema].filter(Boolean).join(" "));
const project = randomUUID();
const actor = randomUUID();
const account = randomUUID();
let api;
let query;

before(async () => {
  await admin.connect();
  await admin.query("create schema " + schema);
  process.env.DATABASE_URL = url.href;

  // Load the actual server modules with the project's TypeScript dependency.
  const require = createRequire(import.meta.url);
  require.extensions[".ts"] = (mod, file) => {
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    mod._compile(outputText, file);
  };
  api = require("../src/lib/content.ts");
  ({ query } = require("../src/lib/db.ts"));
  delete require.extensions[".ts"];

  await query("insert into projects(id, name) values ($1, 'Test')", [project]);
  await query("insert into users(id, name, email, password_hash) values ($1, 'Test', 'test@example.org', 'fixture')", [actor]);
  await query("insert into project_members(project_id,user_id,role) values ($1,$2,'approver')", [project, actor]);
  await query("insert into accounts(id,project_id,platform,handle) values ($1,$2,'instagram','fixture')", [account, project]);
});
after(async () => {
  try {
    await admin.query("drop schema if exists " + schema + " cascade");
  } finally {
    await admin.end();
  }
});

async function pending() {
  const id = randomUUID();
  await query(
    `insert into units(id,project_id,title,account_id,content_type,slot_at,created_by,status,gate)
     values ($1,$2,'Test',$3,'ig-post',now(),$4,'review','pending')`,
    [id, project, account, actor],
  );
  return id;
}
const decide = (id, version, yes, round = 1) => api.decide(project, actor, id, version, round, yes, yes ? "" : "Исправить");
const publish = (id, version, outcome = "out", attempt = 1) => api.markOutcome(project, actor, id, version, attempt, outcome, "Ошибка");
const edit = (id) => api.saveCompose(project, actor, id, { body: "Исправленный текст" });
async function state(id) {
  return (await query("select version,gate,status,outcome,approved_version from units where id=$1", [id])).rows[0];
}
async function events(id) {
  return (await query("select kind,version from unit_events where unit_id=$1 order by created_at,id", [id])).rows;
}

// Queue both operations behind a third transaction. Only release the row after
// PostgreSQL confirms each worker is waiting, so both execution orders are reproducible.
async function contend(id, first, second) {
  const operations = [];
  await admin.query("begin");
  try {
    await admin.query("select id from " + schema + ".units where id=$1 for update", [id]);
    for (const start of [first, second]) {
      operations.push(start());
      const deadline = Date.now() + 5000;
      for (;;) {
        const { rows } = await query(
          `select count(*)::int as waiting from pg_stat_activity
           where application_name=$1 and cardinality(pg_blocking_pids(pid)) > 0`, [schema],
        );
        if (rows[0].waiting === operations.length) break;
        assert.ok(Date.now() < deadline, "timed out waiting for concurrent transactions");
        await delay(10);
      }
    }
  } finally {
    await admin.query("rollback");
    await Promise.allSettled(operations);
  }
  return Promise.all(operations);
}

test("simultaneous approval and return record only the winning decision", async () => {
  for (const yes of [true, false]) {
    const id = await pending();
    const [winner, loser] = await contend(id, () => decide(id, 1, yes), () => decide(id, 1, !yes));
    assert.equal(winner, null);
    assert.match(loser, /Обновите страницу/);
    const row = await state(id);
    assert.equal(row.gate, yes ? "yes" : "returned");
    assert.equal(row.approved_version, yes ? 1 : null);
    assert.deepEqual(await events(id), [{ kind: yes ? "approved" : "returned", version: 1 }]);
  }
});

test("old review and publication forms cannot act on a resubmitted version", async () => {
  const id = await pending();
  assert.equal(await decide(id, 1, true), null);
  assert.equal(await api.saveLink(project, actor, id, "https://example.org/revision", ""), null);
  assert.equal(await api.sendForApproval(project, actor, id), null);
  assert.match(await decide(id, 1, true, 2), /Обновите страницу/);
  assert.match(await decide(id, 1, false, 2), /Обновите страницу/);
  assert.equal(await decide(id, 2, true, 2), null);
  assert.match(await publish(id, 1), /Обновите страницу/);
  assert.equal(await publish(id, 2, "failed"), null);
  assert.match(await publish(id, 2), /Обновите страницу/);
  assert.deepEqual(await events(id), [
    { kind: "approved", version: 1 }, { kind: "edited", version: 2 },
    { kind: "sent", version: 2 }, { kind: "approved", version: 2 }, { kind: "failed", version: 2 },
  ]);
});

test("edit and publication in either order never publish the edited version", async () => {
  for (const editFirst of [true, false]) {
    const id = await pending();
    assert.equal(await decide(id, 1, true), null);
    const change = () => edit(id);
    const mark = () => publish(id, 1);
    const [first, second] = editFirst ? await contend(id, change, mark) : await contend(id, mark, change);
    assert.equal(first, null);
    if (editFirst) assert.match(second, /Обновите страницу/);
    else assert.equal(second, null);
    const row = await state(id);
    assert.equal(row.version, 2);
    assert.equal(row.status, "work");
    assert.equal(row.gate, "none");
    assert.equal(row.approved_version, null);
    assert.equal(row.outcome, null);
    assert.deepEqual(await events(id), [
      { kind: "approved", version: 1 },
      ...(editFirst ? [] : [{ kind: "published", version: 1 }]),
      { kind: "edited", version: 2 },
    ]);
  }
});

test("publication requires a waiting, approved, scheduled version and a valid outcome", async () => {
  const id = await pending();
  assert.match(await publish(id, 1), /Обновите страницу/);
  assert.equal(await decide(id, 1, true), null);
  assert.match(await publish(id, 1, "unknown"), /Выберите результат/);
  assert.match(await api.markOutcome(project, actor, id, 1, 1, "failed", ""), /почему/);
  for (const invalid of ["status='review'", "gate='none'", "approved_version=0", "slot_at=null"]) {
    await query("update units set status='waiting',gate='yes',approved_version=1,slot_at=now() where id=$1", [id]);
    await query("update units set " + invalid + " where id=$1", [id]);
    assert.match(await publish(id, 1), /Обновите страницу/);
  }
  assert.deepEqual(await events(id), [{ kind: "approved", version: 1 }]);
});

test("competing publication outcomes record exactly one event", async () => {
  const id = await pending();
  assert.equal(await decide(id, 1, true), null);
  const [winner, loser] = await contend(id, () => publish(id, 1), () => publish(id, 1, "failed"));
  assert.equal(winner, null);
  assert.match(loser, /Обновите страницу/);
  assert.equal((await state(id)).outcome, "out");
  assert.deepEqual(await events(id), [{ kind: "approved", version: 1 }, { kind: "published", version: 1 }]);
});

test("each submission rejects decisions from earlier rounds even when the content is unchanged", async () => {
  const id = await pending();
  for (const round of [1, 2]) {
    assert.equal(await decide(id, 1, false, round), null);
    assert.equal(await api.sendForApproval(project, actor, id), null);
    for (let stale = 1; stale <= round; stale++) {
      assert.match(await decide(id, 1, true, stale), /Обновите страницу/);
      assert.match(await decide(id, 1, false, stale), /Обновите страницу/);
    }
  }
  assert.equal(await decide(id, 1, true, 3), null);
  assert.deepEqual((await events(id)).map(e => e.kind), ["returned", "sent", "returned", "sent", "approved"]);
  assert.equal((await state(id)).approved_version, 1);
});

test("reschedules invalidate old publication forms even after failure or a return to the original slot", async () => {
  const id = await pending();
  const original = "2030-01-03T12:00:00Z";
  const later = "2030-01-04T12:00:00Z";
  await query("update units set slot_at=$2 where id=$1", [id, original]);
  assert.equal(await decide(id, 1, true), null);

  assert.equal(await api.changeSlot(project, actor, id, later, 1, 1, "reschedule"), null);
  assert.match(await publish(id, 1, "out", 1), /Обновите страницу/);
  assert.equal(await publish(id, 1, "failed", 2), null);
  assert.equal(await api.changeSlot(project, actor, id, original, 1, 2, "retry"), null);

  for (const stale of [1, 2]) {
    for (const outcome of ["out", "failed"]) {
      assert.match(await publish(id, 1, outcome, stale), /Обновите страницу/);
    }
  }
  const row = await state(id);
  assert.equal(row.version, 1);
  assert.equal(row.approved_version, 1);
  assert.equal(row.outcome, null);
  assert.equal(await publish(id, 1, "out", 3), null);
  assert.deepEqual((await events(id)).map(e => e.kind), ["approved", "rescheduled", "failed", "rescheduled", "published"]);
});

async function slotState(id) {
  return (await query(
    `select slot_at, status, outcome, outcome_reason, version, approved_version, publication_attempt
     from units where id = $1`, [id],
  )).rows[0];
}

test("publication winning a race freezes the slot and rejects the queued reschedule", async () => {
  const id = await pending();
  assert.equal(await decide(id, 1, true), null);
  const original = await slotState(id);
  const move = () => api.changeSlot(project, actor, id, "2030-01-03T12:00:00Z", 1, 1, "reschedule");
  const [published, rejected] = await contend(id, () => publish(id, 1), move);
  assert.equal(published, null);
  assert.match(rejected, /Обновите страницу/);
  const closed = await slotState(id);
  assert.deepEqual(closed, { ...original, status: "out", outcome: "out" });
  assert.equal(api.rescheduleIntent(closed), null);
  assert.deepEqual((await events(id)).map(e => e.kind), ["approved", "published"]);
});

test("only a fresh retry can reopen a failed attempt, and old reschedules cannot move it again", async () => {
  const id = await pending();
  const firstSlot = "2030-01-03T12:00:00Z";
  const secondSlot = "2030-01-04T12:00:00Z";
  const move = (slot, attempt, intent) => api.changeSlot(project, actor, id, slot, 1, attempt, intent);
  assert.equal(await decide(id, 1, true), null);
  assert.equal(await publish(id, 1, "failed"), null);
  const failed = await slotState(id);
  assert.equal(api.rescheduleIntent(failed), "retry");
  assert.match(await move(firstSlot, 1, "reschedule"), /Обновите страницу/);
  assert.deepEqual(await slotState(id), failed);
  assert.equal(await move(firstSlot, 1, "retry"), null);
  const reopened = await slotState(id);
  assert.equal(reopened.publication_attempt, 2);
  assert.equal(reopened.outcome, null);
  assert.equal(reopened.outcome_reason, null);
  assert.equal(reopened.approved_version, 1);
  assert.equal(api.rescheduleIntent(reopened), "reschedule");

  assert.equal(await move(secondSlot, 2, "reschedule"), null);
  assert.equal(await move(firstSlot, 3, "reschedule"), null);
  const current = await slotState(id);
  assert.equal(current.publication_attempt, 4);
  assert.deepEqual(current.slot_at, reopened.slot_at);
  assert.match(await move(secondSlot, 2, "reschedule"), /Обновите страницу/);
  assert.equal(await publish(id, 1, "failed", 4), null);
  const failedAgain = await slotState(id);
  assert.match(await move(secondSlot, 1, "retry"), /Обновите страницу/);
  assert.deepEqual(await slotState(id), failedAgain);
  assert.deepEqual((await events(id)).map(e => e.kind),
    ["approved", "failed", "rescheduled", "rescheduled", "rescheduled", "failed"]);
});
