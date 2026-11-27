import assert from "node:assert/strict";
import { test } from "node:test";
import { require as loadTsx } from "tsx/cjs/api";

const { sessionConfig } = loadTsx("../src/lib/session-config.ts", import.meta.url);

test("HTTPS sessions require an explicit key, including behind a TLS proxy", () => {
  for (const secret of [undefined, "", "short", "local-dev-session-secret"]) {
    assert.throws(() => sessionConfig({ SESSION_SECRET: secret }), /SESSION_SECRET/);
  }
  const key = "ab".repeat(32);
  assert.throws(() => sessionConfig({ SESSION_SECRET: key, SESSION_MODE: "http" }), /SESSION_MODE/);
  assert.equal(sessionConfig({ SESSION_SECRET: key }).cookie.secure, true);
});
