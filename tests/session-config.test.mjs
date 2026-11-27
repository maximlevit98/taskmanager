import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionConfig } from "../src/lib/session-config.mjs";

test("HTTPS sessions require an explicit key, including behind a TLS proxy", () => {
  for (const secret of [undefined, "", "short", "local-dev-session-secret"]) {
    assert.throws(() => sessionConfig({ SESSION_SECRET: secret }), /SESSION_SECRET/);
  }
  const key = "ab".repeat(32);
  assert.throws(() => sessionConfig({ SESSION_SECRET: key, SESSION_MODE: "http" }), /SESSION_MODE/);
  assert.equal(sessionConfig({ SESSION_SECRET: key }).cookie.secure, true);
});
