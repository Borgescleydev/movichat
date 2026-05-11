export async function register() {
  // Only run in Node.js runtime (not Edge), and only in server context
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./lib/migrations");
    await runMigrations();
  }
}
