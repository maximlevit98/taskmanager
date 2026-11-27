import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";

// Exercise the application and its SMTP configuration through the same origin
// that issues the user's session. The mailbox exists only in CI.
export async function checkInviteDelivery({ origin, cookie, submit, checkCookie }) {
  async function page(path, session) {
    const response = await fetch(new URL(path, origin), {
      headers: session ? { cookie: session } : {}, redirect: "manual",
    });
    assert.equal(response.status, 200);
    return new JSDOM(await response.text()).window.document;
  }

  const create = await page("/projects/new", cookie);
  const created = await submit("/projects/new", create.querySelector('input[name="name"]').form,
    { name: "CI invitations" }, cookie);
  assert.equal(created.status, 303);
  const members = new URL(created.headers.get("location"), origin).pathname;
  assert.match(members, /^\/projects\/[\w-]+\/members$/);

  const invitee = `invite-${randomUUID()}@example.test`;
  const roster = await page(members, cookie);
  const inviteForm = roster.querySelector('input[name="email"]').form;
  const sent = await submit(members, inviteForm, { email: invitee, role: "publisher" }, cookie);
  assert.equal(sent.status, 303);
  const target = new URL(sent.headers.get("location"), origin);
  assert.equal(target.pathname, members);
  assert.equal(target.search, "");

  const mailbox = "http://127.0.0.1:8025/api/v1";
  const list = await (await fetch(mailbox + "/messages")).json();
  const mail = list.messages.find(item => item.To.some(to => to.Address === invitee));
  assert.ok(mail, "SMTP recipient has no invitation");
  const message = await (await fetch(mailbox + "/message/" + mail.ID)).json();
  assert.ok(message.Text.includes(new URL("/invites", origin).href));
  const code = message.Text.trim().split(/\s+/).pop();
  assert.match(code, /^[A-Za-z0-9_-]{32}$/);

  const register = await page("/register?next=invites");
  const password = randomUUID();
  const registered = await submit("/register?next=invites", register.querySelector("form"),
    { email: invitee, name: "CI Invitee", password, again: password });
  const session = checkCookie(registered, false);
  const confirm = await page("/invites", session);
  const accepted = await submit("/invites", confirm.querySelector("form"), { code }, session);
  assert.equal(accepted.status, 303);
  assert.equal(new URL(accepted.headers.get("location"), origin).pathname, members.replace(/\/members$/, ""));
  const updated = await page(members, cookie);
  const row = [...updated.querySelectorAll("tr")].find(tr => tr.textContent.includes(invitee));
  assert.equal(row?.querySelector('select[name="role"]')?.value, "publisher");
  console.log("Verified SMTP invitation and confirmed publisher membership on " + origin.origin);
}
