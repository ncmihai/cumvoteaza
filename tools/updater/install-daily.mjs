#!/usr/bin/env node
/**
 * Sprint 9 (D-027): the once-a-day catch-up on this Mac, as a launchd job.
 *
 *   node tools/updater/install-daily.mjs                 shows the job it would install and changes nothing
 *   node tools/updater/install-daily.mjs --install       installs and starts it (every day at 07:15, or --hour=7 --minute=15)
 *   node tools/updater/install-daily.mjs --uninstall     stops and removes it
 *
 * It runs `npm run prod -- --yes-production ingest:updater:catch-up --persist --trigger=schedule` in this folder, with the PATH of the shell
 * that installed it (so node, npm and gh are found). A Mac that was asleep at 07:15 runs the job when it wakes. Output goes to
 * ~/Library/Logs/cumvoteaza-updater.log. Run the catch-up by hand for a week first.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const label = "ro.cumvoteaza.updater";
const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const logPath = path.join(os.homedir(), "Library", "Logs", "cumvoteaza-updater.log");
const args = process.argv.slice(2);
const option = (name, fallback) => Number(args.find((item) => item.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const uid = os.userInfo().uid;

if (args.includes("--uninstall")) {
  try { execFileSync("launchctl", ["bootout", `gui/${uid}/${label}`], { stdio: "inherit" }); } catch { /* not loaded */ }
  if (existsSync(plistPath)) rmSync(plistPath);
  console.log(`Removed ${plistPath}`);
  process.exit(0);
}

const command = `cd "${repo}" && npm run prod -- --yes-production ingest:updater:catch-up --persist --trigger=schedule`;
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>-c</string><string>${escape(command)}</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${escape(process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin")}</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${option("hour", 7)}</integer><key>Minute</key><integer>${option("minute", 15)}</integer></dict>
  <key>StandardOutPath</key><string>${escape(logPath)}</string>
  <key>StandardErrorPath</key><string>${escape(logPath)}</string>
</dict>
</plist>
`;

if (!args.includes("--install")) {
  console.log(`Would write ${plistPath}:\n\n${plist}\nRun again with --install to install it, --uninstall to remove it.`);
  process.exit(0);
}

mkdirSync(path.dirname(plistPath), { recursive: true });
writeFileSync(plistPath, plist);
try { execFileSync("launchctl", ["bootout", `gui/${uid}/${label}`], { stdio: "ignore" }); } catch { /* not loaded yet */ }
execFileSync("launchctl", ["bootstrap", `gui/${uid}`, plistPath], { stdio: "inherit" });
console.log(`Installed ${plistPath}. It runs every day at ${String(option("hour", 7)).padStart(2, "0")}:${String(option("minute", 15)).padStart(2, "0")}; the log is ${logPath}.\nTo run it once now: launchctl kickstart gui/${uid}/${label}`);
