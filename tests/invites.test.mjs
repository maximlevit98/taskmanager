import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import pg from "pg";
import { require as load } from "tsx/cjs/api";

assert.ok(process.env.DATABASE_URL, "Set DATABASE_URL to a PostgreSQL test database");
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
const schema = "invites_" + randomUUID().replaceAll("-", "");
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("options", [url.searchParams.get("options"), "-c search_path=" + schema].filter(Boolean).join(" "));
const project = randomUUID();
const legacyId = randomUUID();
let api, query, smtpUrl;
const messages = [];

// This loopback sink accepts SMTP into memory. It never forwards mail.
const mailbox = createServer(socket => {
  let buffer = "", data = false, lines = [], recipient = "";
  socket.setEncoding("utf8");
  socket.write("220 localhost SMTP\r\n");
  socket.on("data", chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (data) {
        if (line !== ".") { lines.push(line); continue; }
        messages.push({ recipient, raw: lines.join("\n") });
        data = false;
        lines = [];
      } else if (line.startsWith("RCPT TO:")) {
        recipient = line.slice(8).trim().replace(/^<|>$/g, "");
      } else if (line === "DATA") {
        data = true;
        socket.write("354 Send message\r\n");
        continue;
      } else if (line === "QUIT") { socket.end("221 Bye\r\n"); continue; }
      socket.write("250 OK\r\n");
    }
  });
});
function codeFor(email) {
  const raw = messages.filter(message => message.recipient === email).at(-1)?.raw;
  assert.ok(raw, "expected SMTP delivery");
  const [headers, ...sections] = raw.split("\n\n");
  const body = sections.join("\n\n");
  const text = /Content-Transfer-Encoding: base64/i.test(headers) ? Buffer.from(body, "base64").toString() : body;
  assert.match(text, /http:\/\/localhost:3010\/invites/);
  const match = text.match(/^([\w-]{32})\s*$/m);
  assert.ok(match, "expected a single-use code in the body");
  return match[1];
}
async function account(email) {
  const id = randomUUID();
  await query("insert into users(id,email,name,password_hash) values ($1,$2,'test','test')", [id,email]);
  return { id,email };
}
async function roleOf(user) {
  return (await query("select role from project_members where project_id=$1 and user_id=$2", [project,user.id])).rows[0]?.role;
}
const invites = () => api.listInvites(project);

before(async () => {
  await new Promise(resolve => mailbox.listen(0, "127.0.0.1", resolve));
  smtpUrl = "smtp://127.0.0.1:" + mailbox.address().port;
  Object.assign(process.env, { DATABASE_URL: url.href, INVITE_SMTP_URL: smtpUrl, INVITE_FROM: "test@example.invalid", APP_PUBLIC_URL: "http://localhost:3010" });
  await admin.connect();
  await admin.query("create schema " + schema);
  await admin.query("set search_path to " + schema);
  // Start with an unconfirmed invitation in the pre-upgrade table.
  await admin.query(`create table project_invites(id uuid primary key, project_id uuid not null,
    email text not null, role text not null, created_at timestamptz not null default now(), unique(project_id,email))`);
  await admin.query("insert into project_invites(id,project_id,email,role) values ($1,$2,'legacy@example.invalid','publisher')", [legacyId,project]);
  api = load("../src/lib/invites.ts", import.meta.url);
  ({ query } = load("../src/lib/db.ts", import.meta.url));
  await query("insert into projects(id,name) values ($1,'Test')", [project]);
});
after(async () => {
  try { await admin.query("drop schema if exists " + schema + " cascade"); }
  finally { await admin.end(); await new Promise(resolve => mailbox.close(resolve)); }
});

test("old invitations remain unverified until the owner sends a fresh code", async () => {
  const person = await account("legacy@example.invalid");
  assert.equal((await invites()).find(i => i.id === legacyId).state, "unsent");
  assert.equal(await roleOf(person), undefined);
  assert.match(await api.resolveInvite(project, legacyId, "publisher"), /не найдено/);
  assert.equal(await api.resendInvite(project, legacyId), null);
  assert.deepEqual(await api.confirmInvite(person, codeFor(person.email)), { projectId: project });
  assert.equal(await roleOf(person), "publisher");
});

test("new and registered accounts receive a role only after matching mailbox proof", async () => {
  for (const existing of [false, true]) {
    const email = (existing ? "existing" : "new") + "@example.invalid";
    let person = existing ? await account(email) : null;
    assert.equal(await api.addParticipant(project, email.toUpperCase(), "member"), null);
    const code = codeFor(email);
    person ??= await account(email);
    const other = await account("other-" + email);
    assert.ok((await api.confirmInvite(other, code)).message);
    assert.equal(await roleOf(person), undefined);
    assert.equal(await roleOf(other), undefined);
    const replies = await Promise.all([api.confirmInvite(person, code), api.confirmInvite(person, code)]);
    assert.equal(replies.filter(r => r.projectId === project).length, 1);
    assert.equal(replies.filter(r => r.message).length, 1);
    assert.equal(await roleOf(person), "member");
    assert.ok((await api.confirmInvite(person, code)).message);
  }
});

test("expiry, resend, cancellation and SMTP failure never grant membership", async () => {
  const person = await account("expiry@example.invalid");
  delete process.env.INVITE_SMTP_URL;
  try { assert.match(await api.addParticipant(project, person.email, "member"), /не отправлено/); }
  finally { process.env.INVITE_SMTP_URL = smtpUrl; }
  const invite = (await invites()).find(i => i.email === person.email);
  assert.equal(invite.state, "unsent");
  assert.equal(await api.resendInvite(project, invite.id), null);
  const first = codeFor(person.email);
  await query("update project_invites set expires_at=now()-interval '1 second' where id=$1", [invite.id]);
  assert.ok((await api.confirmInvite(person, first)).message);
  assert.equal((await invites()).find(i => i.id === invite.id).state, "expired");
  assert.equal(await api.resendInvite(project, invite.id), null);
  const second = codeFor(person.email);
  assert.equal(await api.resendInvite(project, invite.id), null);
  const third = codeFor(person.email);
  assert.notEqual(second, third);
  assert.ok((await api.confirmInvite(person, second)).message);
  await query("delete from project_invites where project_id=$1 and id=$2", [project,invite.id]);
  assert.ok((await api.confirmInvite(person, third)).message);
  assert.equal(await roleOf(person), undefined);
});


test("legacy approver invitation waits for an explicit current role after verification", async () => {
  const person = await account("legacy-role@example.invalid");
  assert.match(await api.addParticipant(project, person.email, "approver"), /Выберите роль/);
  const id = randomUUID();
  await query("insert into project_invites(id,project_id,email,role) values ($1,$2,$3,'approver')", [id,project,person.email]);
  assert.match(await api.resolveInvite(project, id, "member"), /не найдено/);
  assert.equal(await api.resendInvite(project, id), null);
  const code = codeFor(person.email);
  assert.match((await api.confirmInvite(person, code)).message, /выбрать роль/);
  assert.equal(await roleOf(person), undefined);
  assert.equal((await invites()).find(i => i.id === id).state, "conflict");
  assert.match((await api.confirmInvite(person, code)).message, /недействителен/);
  assert.match(await api.resolveInvite(project, id, "approver"), /Выберите роль/);
  assert.match(await api.resolveInvite(randomUUID(), id, "member"), /не найдено/);
  assert.equal(await api.resolveInvite(project, id, "publisher"), null);
  assert.equal(await roleOf(person), "publisher");
  assert.match(await api.resolveInvite(project, id, "member"), /не найдено/);
});

test("an existing different membership changes only after the owner resolves the conflict", async () => {
  const person = await account("changed@example.invalid");
  assert.equal(await api.addParticipant(project, person.email, "publisher"), null);
  await query("insert into project_members(project_id,user_id,role) values ($1,$2,'member')", [project,person.id]);
  assert.match((await api.confirmInvite(person, codeFor(person.email))).message, /выбрать роль/);
  assert.equal(await roleOf(person), "member");
  const invite = (await invites()).find(i => i.email === person.email);
  assert.equal(await api.resolveInvite(project, invite.id, "publisher"), null);
  assert.equal(await roleOf(person), "publisher");
});
