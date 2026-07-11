import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "src", "app", "api");
const apiParked = path.join(root, "src", "app", "_api.parked");

// A static export can't include server route handlers (the optional OpenAI
// summary API). Park it during the desktop build so the export succeeds; the
// desktop app falls back to the built-in offline schedule summary. The web /
// Vercel build is unaffected — it never runs this script.
const parked = existsSync(apiDir);
try {
  if (parked) renameSync(apiDir, apiParked);
  // Start from a clean .next so no stale generated types reference the parked
  // API route (Next regenerates route types from the current file tree).
  rmSync(path.join(root, ".next"), { recursive: true, force: true });
  execSync("next build", {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, BUILD_TARGET: "desktop" },
  });
} finally {
  if (parked && existsSync(apiParked)) {
    if (existsSync(apiDir)) rmSync(apiDir, { recursive: true, force: true });
    renameSync(apiParked, apiDir);
  }
}
