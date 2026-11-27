const localSecret = "local-dev-session-secret";

export function sessionConfig(env: NodeJS.ProcessEnv = process.env) {
  const local = env.SESSION_MODE === "local-http";
  if (env.SESSION_MODE !== undefined && !local && env.SESSION_MODE !== "https") {
    throw new Error("SESSION_MODE must be https or local-http");
  }
  const secret = env.SESSION_SECRET;
  if (!secret || (!(local && secret === localSecret) && !/^[0-9a-f]{64}$/i.test(secret))) {
    throw new Error("SESSION_SECRET must be a 32-byte hex key (openssl rand -hex 32)");
  }
  return {
    secret,
    cookie: { httpOnly: true, secure: !local, sameSite: "lax" as const, path: "/" },
  };
}
