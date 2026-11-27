import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";

const origin = new URL(process.argv[2]);
const secure = origin.protocol === "https:";

async function submit(path, form, values, cookie) {
  const data = new FormData();
  for (const input of form.querySelectorAll("input[name]")) {
    data.set(input.name, values[input.name] ?? input.value);
  }
  return fetch(new URL(path, origin), {
    method: "POST", body: data, redirect: "manual",
    headers: cookie ? { cookie, origin: origin.origin } : { origin: origin.origin },
  });
}

function checkCookie(response, clearing) {
  assert.equal(response.status, 303);
  const header = response.headers.getSetCookie().find(value => value.startsWith("session="));
  assert.ok(header, "missing session cookie");
  const [pair, ...fields] = header.split(/;\s*/);
  const attrs = new Set(fields.map(field => field.toLowerCase()));
  for (const attr of ["httponly", "samesite=lax", "path=/"]) assert.ok(attrs.has(attr), attr);
  assert.equal(attrs.has("secure"), secure);
  assert.ok(attrs.has(clearing ? "max-age=0" : "max-age=1209600"));
  assert.equal(pair === "session=", clearing);
  return pair;
}

const registration = await fetch(new URL("/register", origin));
assert.equal(registration.status, 200);
const form = new JSDOM(await registration.text()).window.document.querySelector("form");
const email = `session-${randomUUID()}@example.test`;
const password = randomUUID();
const created = await submit("/register", form, { email, password, again: password, name: "CI Session" });
const cookie = checkCookie(created, false);
const projects = await fetch(new URL("/projects", origin), { headers: { cookie }, redirect: "manual" });
assert.equal(projects.status, 200);
const document = new JSDOM(await projects.text()).window.document;
assert.ok(document.body.textContent.includes(email));
const logout = [...document.forms].find(item => item.textContent.includes("Выйти"));
assert.ok(logout, "missing logout form");
checkCookie(await submit("/projects", logout, {}, cookie), true);
