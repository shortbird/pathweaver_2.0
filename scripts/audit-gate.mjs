#!/usr/bin/env node
/**
 * npm audit gate with a narrow, expiring allowlist.
 *
 * `npm audit --audit-level=high` is all-or-nothing: the moment one high
 * advisory has no published fix, the only way to get a green build is to waive
 * every high. That is what happened on 2026-08-08 — image-size shipped two DoS
 * advisories covering <=2.0.2 with 2.0.2 being the newest release, arriving
 * through metro, and the whole production OTA pipeline stopped. Dropping the
 * job to --audit-level=critical would have unblocked it and quietly waived
 * every other high in the mobile app at the same time.
 *
 * So this fails on any high/critical advisory EXCEPT the ones named in an
 * allowlist file, and each allowlist entry carries a reason and a date. Past
 * that date the entry stops working and the gate fails, which is the point:
 * an accepted risk that nobody looks at again is just an unaccepted one with
 * better paperwork.
 *
 *   node scripts/audit-gate.mjs --dir frontend-v2
 *
 * Options:
 *   --dir <path>        package directory to audit (default: cwd)
 *   --allowlist <path>  default: <dir>/audit-allowlist.json (absent = none)
 *   --level <sev>       minimum severity to fail on (default: high)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const dir = resolve(arg('dir', process.cwd()));
const allowlistPath = resolve(arg('allowlist', join(dir, 'audit-allowlist.json')));
const minRank = RANK[arg('level', 'high')];

if (minRank === undefined) {
  console.error(`Unknown --level "${arg('level')}". Use one of: ${Object.keys(RANK).join(', ')}`);
  process.exit(2);
}

// npm audit exits non-zero whenever it finds anything, so the exit code says
// nothing useful here — the report is the output. A crash (npm missing, no
// lockfile, unparseable JSON) is different and must not read as "clean".
let report;
try {
  const stdout = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  report = JSON.parse(stdout);
} catch (err) {
  if (err.stdout) {
    try {
      report = JSON.parse(err.stdout);
    } catch {
      console.error('npm audit produced output that is not JSON:\n', err.stdout.slice(0, 2000));
      process.exit(2);
    }
  } else {
    console.error('Could not run npm audit:', err.message);
    process.exit(2);
  }
}

// Each vulnerability's `via` holds either advisory objects (the real findings)
// or plain strings naming the dependency that drags it in. Only the objects
// are distinct advisories; the string chains are the same finding retold, so
// allowlisting an advisory covers everything downstream of it.
const findings = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || RANK[via.severity] < minRank) continue;
    const ghsa = (via.url ?? '').split('/').pop() || `npm-${via.source}`;
    if (!findings.has(ghsa)) {
      findings.set(ghsa, { ghsa, package: via.name, title: via.title,
                           severity: via.severity, url: via.url, range: via.range });
    }
  }
}

let allowlist = {};
if (existsSync(allowlistPath)) {
  try {
    allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  } catch (err) {
    console.error(`Allowlist at ${allowlistPath} is not valid JSON: ${err.message}`);
    process.exit(2);
  }
}
// Comparing ISO dates as strings is only sound because both are zero-padded
// YYYY-MM-DD; `today` is UTC, matching the runner.
const today = new Date().toISOString().slice(0, 10);

const blocking = [];
const accepted = [];
const expired = [];
for (const finding of findings.values()) {
  const entry = allowlist[finding.ghsa];
  if (!entry) blocking.push(finding);
  else if (!entry.recheck_after || entry.recheck_after < today) expired.push({ finding, entry });
  else accepted.push({ finding, entry });
}

const line = (f) => `  ${f.severity.padEnd(8)} ${f.package} ${f.range ?? ''}\n    ${f.title}\n    ${f.url}`;

if (accepted.length) {
  console.log(`Accepted (allowlisted, still in date) — ${accepted.length}:`);
  for (const { finding, entry } of accepted) {
    console.log(line(finding));
    console.log(`    accepted: ${entry.reason}`);
    console.log(`    recheck after: ${entry.recheck_after}`);
  }
  console.log('');
}

if (expired.length) {
  console.log(`EXPIRED allowlist entries — ${expired.length}:`);
  for (const { finding, entry } of expired) {
    console.log(line(finding));
    console.log(`    accepted on ${entry.recheck_after ?? '(no date)'} — time to look again.`);
    console.log(`    Check for a fixed release; if there still is not one and the reasoning`);
    console.log(`    holds, push out recheck_after in ${allowlistPath}.`);
  }
  console.log('');
}

if (blocking.length) {
  console.log(`Blocking — ${blocking.length} advisory/advisories at ${arg('level', 'high')} or above:`);
  for (const f of blocking) console.log(line(f));
  console.log('');
  console.log('Fix them, or — only if no fixed release exists — add the GHSA id to');
  console.log(`${allowlistPath} with a reason and a recheck_after date.`);
}

// Stale entries are a warning, not a failure: an allowlist that fails the build
// for being too cautious teaches people to delete entries rather than read them.
const stale = Object.keys(allowlist).filter((id) => !findings.has(id));
if (stale.length) {
  console.log(`Note: ${stale.join(', ')} no longer appear in the audit — remove them from the allowlist.`);
}

if (blocking.length || expired.length) process.exit(1);
console.log(`No unaccepted advisories at ${arg('level', 'high')} or above.`);
