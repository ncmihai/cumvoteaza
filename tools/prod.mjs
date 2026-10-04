#!/usr/bin/env node
/**
 * Runs an npm script against the PRODUCTION database, deliberately.
 *
 *   npm run prod -- ingest:governments:skeleton
 *   npm run prod -- ingest:motions:import --persist
 *   npm run prod -- db:migrate
 *
 * Production credentials live in .env.production (never committed). The normal .env points at the dev branch, and
 * command-line tools refuse the production database unless this wrapper sets ALLOW_PRODUCTION=1 (packages/db/src/production-guard.ts).
 * It shows the target and the command and asks you to type "production". `--yes-production` skips the question for unattended runs.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const skipQuestion = args[0] === "--yes-production";
if (skipQuestion) args.shift();

if (args.length === 0 || args[0] === "--help") {
  console.log("Usage: npm run prod -- <npm script> [arguments]\n  e.g. npm run prod -- ingest:integrity:check\nProduction credentials are read from .env.production.");
  process.exit(args.length === 0 ? 1 : 0);
}

const envFile = path.join(root, ".env.production");
if (!existsSync(envFile)) {
  console.error("Missing .env.production (the production DATABASE_URL and keys). Create it from your production .env.");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envFile, "utf8").split("\n").map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")]; })
);
if (!env.DATABASE_URL) {
  console.error(".env.production has no DATABASE_URL.");
  process.exit(1);
}
const host = new URL(env.DATABASE_URL).hostname;
console.log(`\n  PRODUCTION database: ${host}\n  Command: npm run ${args.join(" ")}\n`);

async function confirmed() {
  if (skipQuestion) return true;
  if (!process.stdin.isTTY) {
    console.error("Not an interactive terminal: pass --yes-production to run without the question.");
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question('  Type "production" to continue: ', resolve));
  rl.close();
  return String(answer).trim() === "production";
}

if (!(await confirmed())) {
  console.error("Cancelled.");
  process.exit(1);
}

const [script, ...rest] = args;
const child = spawn("npm", ["run", script, ...(rest.length ? ["--", ...rest] : [])], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ...env, ALLOW_PRODUCTION: "1" }
});
child.on("exit", (code) => process.exit(code ?? 1));
