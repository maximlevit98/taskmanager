export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sessionConfig } = await import("./lib/session-config");
    sessionConfig();
    const { ensureDb } = await import("./lib/db");
    await ensureDb();
  }
}
