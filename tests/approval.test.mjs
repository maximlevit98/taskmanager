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
const decide = (id, version, yes) => api.decide(project, actor, id, version, yes, yes ? "" : "Исправить");
const publish = (id, version, outcome = "out") => api.markOutcome(project, actor, id, version, outcome, "Ошибка");
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
  assert.match(await decide(id, 1, true), /Обновите страницу/);
  assert.match(await decide(id, 1, false), /Обновите страницу/);
  assert.equal(await decide(id, 2, true), null);
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
  assert.match(await api.markOutcome(project, actor, id, 1, "failed", ""), /почему/);
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
