#!/usr/bin/env node
/**
 * Sprint 9 (D-027): the once-a-day catch-up, as a launchd job on a Mac or a systemd user timer on Linux (the BC250).
 *
 *   node tools/updater/install-daily.mjs                 shows the job it would install and changes nothing
 *   node tools/updater/install-daily.mjs --install       installs and starts it (every day at 07:15, or --hour=7 --minute=15)
 *   node tools/updater/install-daily.mjs --uninstall     stops and removes it
 *   --platform=linux|darwin                              render the other platform's files (default: this machine; nothing is installed from a foreign platform)
 *   --pull                                               (Linux) `git pull --ff-only` before each run, so the box runs what was pushed (off by default)
 *
 * It runs `npm run prod -- --yes-production ingest:updater:catch-up --persist --trigger=schedule` in this folder, with the PATH of the shell
 * that installed it (so node, npm and gh are found). A machine that was off at 07:15 runs the job when it is back (launchd on wake, systemd
 * `Persistent=true`). Logs: macOS ~/Library/Logs/cumvoteaza-updater.log; Linux ~/.local/state/cumvoteaza/updater.log and
 * `journalctl --user -u cumvoteaza-updater`. Run the catch-up by hand for a week first.
 *
 * The catch-up reads the saved official pages in data/coverage/raw (the coverage numbers it publishes are computed from them), so the machine that
 * runs it must hold that folder: copy it before the first run and run the catch-up only there (a second machine's older copy would publish lower numbers).
 * Linux also needs `loginctl enable-linger <user>` (once, with sudo) so a user timer runs without a login session.
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
const platform = args.find((item) => item.startsWith("--platform="))?.split("=")[1] ?? process.platform;
const hour = option("hour", 7);
const minute = option("minute", 15);

if (platform === "linux") {
  const name = "cumvoteaza-updater";
  const unitDir = path.join(os.homedir(), ".config", "systemd", "user");
  const stateDir = path.join(os.homedir(), ".local", "state", "cumvoteaza");
  const logFile = path.join(stateDir, "updater.log");
  const run = `npm run prod -- --yes-production ingest:updater:catch-up --persist --trigger=schedule`;
  const command = `cd "${repo}" && ${args.includes("--pull") ? "git pull --ff-only && " : ""}${run}`;
  const service = `[Unit]
Description=cumvoteaza: daily catch-up of the official sources (D-027)

[Service]
Type=oneshot
Environment="PATH=${process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin"}"
ExecStart=/bin/sh -c '${command.replace(/'/g, "'\\''")}'
StandardOutput=append:${logFile}
StandardError=append:${logFile}
TimeoutStartSec=3h
Nice=10
IOSchedulingClass=idle
`;
  const timer = `[Unit]
Description=cumvoteaza: the daily catch-up at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}

[Timer]
OnCalendar=*-*-* ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00
Persistent=true
Unit=${name}.service

[Install]
WantedBy=timers.target
`;
  if (args.includes("--uninstall")) {
    if (process.platform !== "linux") { console.error("--uninstall removes files on this machine; run it on the Linux box."); process.exit(1); }
    try { execFileSync("systemctl", ["--user", "disable", "--now", `${name}.timer`], { stdio: "inherit" }); } catch { /* not installed */ }
    for (const file of [`${name}.service`, `${name}.timer`]) if (existsSync(path.join(unitDir, file))) rmSync(path.join(unitDir, file));
    try { execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" }); } catch { /* ignore */ }
    console.log(`Removed the ${name} timer and service from ${unitDir}`);
    process.exit(0);
  }
  if (!args.includes("--install")) {
    console.log(`Would write ${path.join(unitDir, `${name}.service`)}:\n\n${service}\nand ${path.join(unitDir, `${name}.timer`)}:\n\n${timer}\nRun again with --install to install it, --uninstall to remove it.`);
    process.exit(0);
  }
  if (process.platform !== "linux") { console.error("Installing a systemd timer only works on Linux; this machine is " + process.platform + ". Use it without --install to see the files."); process.exit(1); }
  mkdirSync(unitDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(path.join(unitDir, `${name}.service`), service);
  writeFileSync(path.join(unitDir, `${name}.timer`), timer);
  execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
  execFileSync("systemctl", ["--user", "enable", "--now", `${name}.timer`], { stdio: "inherit" });
  console.log(`Installed the ${name} timer (every day at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}); the log is ${logFile}.\nTo run it once now: systemctl --user start ${name}.service\nNext run: systemctl --user list-timers ${name}.timer\nIf the timer should run with nobody logged in: sudo loginctl enable-linger ${os.userInfo().username}`);
  process.exit(0);
}

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
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
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
console.log(`Installed ${plistPath}. It runs every day at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}; the log is ${logPath}.\nTo run it once now: launchctl kickstart gui/${uid}/${label}`);
