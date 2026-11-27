import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import pg from "pg";
import { require as loadTs } from "tsx/cjs/api";

assert.ok(process.env.DATABASE_URL, "Set DATABASE_URL to a PostgreSQL test database");
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
const schema = "resources_" + randomUUID().replaceAll("-", "");
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("options", [url.searchParams.get("options"), "-c search_path=" + schema].filter(Boolean).join(" "));
let api, query;

before(async () => {
  await admin.connect();
  await admin.query("create schema " + schema);
  process.env.DATABASE_URL = url.href;
  api = loadTs("../src/lib/project-resources.ts", import.meta.url);
  ({ query } = loadTs("../src/lib/db.ts", import.meta.url));
});
after(async () => {
  try {
    await admin.query("drop schema if exists " + schema + " cascade");
  } finally {
    await admin.end();
  }
});

async function fixture() {
  const project = randomUUID(), owner = randomUUID(), member = randomUUID(), account = randomUUID();
  await query("insert into projects(id, name) values ($1,'Test project')", [project]);
  for (const [id, role] of [[owner, "owner"], [member, "member"]]) {
    await query("insert into users(id, name, email, password_hash) values ($1,'Test',$2,'fixture')", [id, id + "@example.test"]);
    await query("insert into project_members(project_id,user_id,role) values ($1,$2,$3)", [project, id, role]);
  }
  await query("insert into accounts(id,project_id,platform,handle,owner_user_id,connected) values ($1,$2,'telegram','@test',$3,true)", [account, project, member]);
  return { project, owner, member, account };
}

async function material({ project, account, member }) {
  const unit = randomUUID();
  await query(`insert into units(id,project_id,title,account_id,slot_at,created_by,approved_by,gate,approved_version)
               values ($1,$2,'Test slot',$3,now(),$4,$4,'yes',1)`, [unit, project, account, member]);
  await query("insert into unit_people(unit_id,user_id,task) values ($1,$2,'Test task')", [unit, member]);
  await query("insert into unit_events(id,unit_id,user_id,kind,version) values ($1,$2,$3,'approved',1)", [randomUUID(), unit, member]);
  return unit;
}

const fields = { platform: "telegram", handle: "@test", kind: "канал", ownerUserId: "", connected: false };

test("only the owner can manage existing resources, within the selected project", async () => {
  const a = await fixture(), b = await fixture();
  for (const actor of [a.member, b.owner]) {
    assert.ok(await api.renameProject(a.project, actor, "Changed"));
    assert.ok(await api.deleteProject(a.project, actor, "Test project"));
    assert.ok(await api.saveAccount(a.project, actor, a.account, fields));
    assert.ok(await api.deleteAccount(a.project, actor, a.account));
    assert.ok(await api.updateMember(a.project, actor, a.member, "publisher"));
    assert.ok(await api.updateMember(a.project, actor, a.member, null));
  }
  assert.ok(await api.saveAccount(a.project, a.owner, b.account, fields));
  assert.ok(await api.deleteAccount(a.project, a.owner, b.account));
  assert.ok(await api.saveAccount(a.project, a.owner, a.account, { ...fields, ownerUserId: b.member }));
  assert.ok(await api.updateMember(a.project, a.owner, b.member, null));
  assert.ok(await api.deleteAccount("invalid", a.owner, a.account));
  assert.equal((await query("select name from projects where id=$1", [a.project])).rows[0].name, "Test project");
  assert.equal((await query("select connected from accounts where id=$1", [b.account])).rows[0].connected, true);
});

test("project deletion requires the current name and cascades only inside the project", async () => {
  const a = await fixture(), b = await fixture();
  const unit = await material(a);
  await query("insert into project_invites(id,project_id,email,role) values ($1,$2,'test@example.test','member')", [randomUUID(), a.project]);
  assert.deepEqual(await api.deletionImpact(a.project), { materials: 1, accounts: 1, members: 2, invites: 1 });
  assert.ok(await api.renameProject(a.project, a.owner, " "));
  assert.equal(await api.renameProject(a.project, a.owner, "  Renamed  "), null);
  assert.ok(await api.deleteProject(a.project, a.owner, "Test project"));
  assert.equal(await api.deleteProject(a.project, a.owner, "Renamed"), null);
  assert.equal((await query("select 1 from projects where id=$1", [a.project])).rowCount, 0);
  assert.deepEqual(await api.deletionImpact(a.project), { materials: 0, accounts: 0, members: 0, invites: 0 });
  assert.equal((await query("select 1 from unit_events where unit_id=$1", [unit])).rowCount, 0);
  assert.equal((await query("select 1 from users where id in ($1,$2)", [a.owner, a.member])).rowCount, 2);
  assert.equal((await api.deletionImpact(b.project)).accounts, 1);
});

test("disconnecting an account keeps its slots and approvals, deletion requires no links", async () => {
  const a = await fixture();
  const unit = await material(a);
  assert.equal((await api.accountMaterialCounts(a.project)).get(a.account), 1);
  assert.ok(await api.saveAccount(a.project, a.owner, a.account, { ...fields, handle: "@other" }));
  assert.ok(await api.saveAccount(a.project, a.owner, a.account, { ...fields, platform: "vk" }));
  assert.equal(await api.saveAccount(a.project, a.owner, a.account, fields), null);
  assert.ok(await api.deleteAccount(a.project, a.owner, a.account));
  assert.deepEqual((await query("select account_id, approved_version, slot_at is not null as slotted from units where id=$1", [unit])).rows[0],
    { account_id: a.account, approved_version: 1, slotted: true });
  assert.deepEqual((await query("select handle, kind, connected from accounts where id=$1", [a.account])).rows[0],
    { handle: "@test", kind: "канал", connected: false });
  // An unused account can be edited in full and then removed.
  assert.equal(await api.saveAccount(a.project, a.member, null, { ...fields, handle: "@new" }), null);
  const created = (await query("select id from accounts where project_id=$1 and handle='@new'", [a.project])).rows[0].id;
  assert.equal(await api.saveAccount(a.project, a.owner, created, { ...fields, platform: "vk", handle: "@edited" }), null);
  assert.equal(await api.deleteAccount(a.project, a.owner, created), null);
  assert.equal((await query("select 1 from accounts where id=$1", [created])).rowCount, 0);
});

test("member management protects the owner, other memberships and the original author of work", async () => {
  const a = await fixture(), b = await fixture();
  const unit = await material(a);
  await query("insert into project_members(project_id,user_id,role) values ($1,$2,'member'), ($3,$4,'approver')", [b.project,a.member,a.project,b.member]);
  assert.ok(await api.updateMember(a.project, a.owner, a.owner, null));
  assert.ok(await api.updateMember(a.project, a.owner, a.owner, "member"));
  assert.ok(await api.updateMember(a.project, a.owner, a.member, "owner"));
  assert.ok(await api.updateMember(a.project, a.owner, a.member, "approver"));
  assert.equal(await api.updateMember(a.project, a.owner, a.member, "publisher"), null);
  assert.equal((await query("select role from project_members where project_id=$1 and user_id=$2", [a.project,a.member])).rows[0].role, "publisher");
  assert.equal(await api.updateMember(a.project, a.owner, a.member, null), null);
  assert.deepEqual((await query("select project_id,role from project_members where user_id=$1", [a.member])).rows,
    [{ project_id: b.project, role: "member" }]);
  assert.equal((await query("select owner_user_id from accounts where id=$1", [a.account])).rows[0].owner_user_id, null);
  assert.equal((await query("select approved_by from units where id=$1", [unit])).rows[0].approved_by, a.member);
  assert.equal((await query("select user_id from unit_events where unit_id=$1", [unit])).rows[0].user_id, a.member);
  assert.equal((await query("select task from unit_people where unit_id=$1 and user_id=$2", [unit,a.member])).rows[0].task, "Test task");
  assert.equal((await query("select 1 from users where id=$1", [a.member])).rowCount, 1);
});

test("archived assignments survive stale idea submissions and promotion", async () => {
  const a = await fixture(), stranger = randomUUID();
  const { saveUnit } = loadTs("../src/lib/content.ts", import.meta.url);
  const draft = {
    projectId: a.project, userId: a.owner, intent: "idea", title: "Test idea", body: "", initialPeople: [],
    contentType: "ig-post", accountId: a.account, slotAt: null, tone: "mint",
    people: [{ userId: a.member, task: "Former task" }, { userId: a.owner, task: "Original" }],
  };
  const { id } = await saveUnit(draft);
  assert.ok(id);
  assert.equal(await api.updateMember(a.project, a.owner, a.member, null), null);
  const stalePeople = [{ userId: a.member, task: "Overwrite" }, { userId: stranger, task: "Inject" }];
  const assignments = async () => Object.fromEntries((await query(
    "select user_id, task from unit_people where unit_id = $1", [id],
  )).rows.map((person) => [person.user_id, person.task]));
  assert.deepEqual(await saveUnit({ ...draft, ideaId: id, people: [...stalePeople, { userId: a.owner, task: "Edited" }] }), { id });
  assert.deepEqual(await assignments(), { [a.owner]: "Edited", [a.member]: "Former task" });
  assert.deepEqual(await saveUnit({ ...draft, ideaId: id, intent: "slot", slotAt: "2026-12-01T10:00:00Z", initialPeople: [a.owner], people: [] }), { id });
  assert.deepEqual(await assignments(), { [a.member]: "Former task" });
  assert.equal((await query("select status from units where id = $1", [id])).rows[0].status, "work");
});

test("published account identity is protected and disconnecting preserves the publication", async () => {
  const a = await fixture();
  const unit = await material(a);
  await query("update units set status='out', outcome='out' where id=$1", [unit]);
  assert.match(await api.deleteAccount(a.project, a.owner, a.account), /Отключите/);
  assert.match(await api.saveAccount(a.project, a.owner, a.account, { ...fields, handle: "@new" }), /Отключите/);
  assert.equal(await api.saveAccount(a.project, a.owner, a.account, fields), null);
  assert.deepEqual((await query(
    "select account_id, approved_version, status, outcome from units where id=$1", [unit],
  )).rows[0], { account_id: a.account, approved_version: 1, status: "out", outcome: "out" });
});

test("a title-only edit from before a member rejoined preserves their task until explicitly unchecked", async () => {
  const a = await fixture();
  const { getUnit, saveUnit } = loadTs("../src/lib/content.ts", import.meta.url);
  const { ideaFormValues } = loadTs("../src/lib/idea-form.ts", import.meta.url);
  const draft = {
    projectId: a.project, userId: a.owner, intent: "idea", title: "Original title", body: "",
    contentType: "", accountId: "", slotAt: null, tone: "mint", initialPeople: [],
    people: [{ userId: a.member, task: "Keep my assignment" }, { userId: a.owner, task: "Owner task" }],
  };
  const { id } = await saveUnit(draft);
  assert.equal(await api.updateMember(a.project, a.owner, a.member, null), null);
  const original = await getUnit(a.project, id);
  const stale = ideaFormValues(original, [{ user_id: a.owner }]);
  assert.deepEqual(stale.archived.map((person) => person.user_id), [a.member]);

  await query("insert into project_members(project_id,user_id,role) values ($1,$2,'member')", [a.project,a.member]);
  const edit = { ...draft, ideaId: id, title: "New title", initialPeople: stale.people,
    people: stale.people.map((userId) => ({ userId, task: stale.tasks[userId] })),
  };
  assert.deepEqual(await saveUnit(edit), { id });
  const saved = await getUnit(a.project, id);
  assert.equal(saved.title, "New title");
  const fresh = ideaFormValues(saved, [{ user_id: a.owner }, { user_id: a.member }]);
  assert.equal(fresh.tasks[a.member], "Keep my assignment");
  assert.deepEqual(await saveUnit({ ...edit, initialPeople: fresh.people }), { id });
  const afterRemoval = await getUnit(a.project, id);
  assert.deepEqual(afterRemoval.people.map(({user_id, task}) => [user_id, task]), [[a.owner, "Owner task"]]);
});
