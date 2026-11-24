#!/usr/bin/env node
// Bundle-size budget check for `next build` output.
//
// Next 16/Turbopack no longer prints a route-size table to stdout, but it
// still writes real per-route byte counts to
// `.next/diagnostics/route-bundle-stats.json` on every build. This script
// reads that file and fails (exit 1) if any route's first-load JS exceeds
// its budget, so a regression ships as a red CI check instead of silently.
//
// Budgets are in *uncompressed* first-load JS bytes (the metric the
// diagnostics file reports). They are deliberately generous ceilings, not
// targets — the point is to catch a heavy dependency or an accidental
// eager import, not to police every kilobyte.
//
// `/pay/[linkId]` gets the tightest budget: it's the highest-traffic route
// (every payment link a customer opens) and the one most sensitive to
// first-load weight on mobile connections.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATS_PATH = join(ROOT, '.next', 'diagnostics', 'route-bundle-stats.json');

// Per-route budgets, keyed by the route path as it appears in the
// diagnostics file. `*` is the fallback for any route not listed here.
const BUDGETS = {
  '/pay/[linkId]': 350 * 1024,
  '*': 500 * 1024,
};

function budgetFor(route) {
  return BUDGETS[route] ?? BUDGETS['*'];
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

let stats;
try {
  stats = JSON.parse(readFileSync(STATS_PATH, 'utf8'));
} catch (err) {
  console.error(
    `check-bundle-size: could not read ${STATS_PATH}\n` +
      `Run \`next build\` first. (${err.message})`,
  );
  process.exit(1);
}

// The diagnostics file is an array of route entries; tolerate either a bare
// array or an object with a `routes` array so a shape tweak doesn't silently
// turn this check into a no-op.
const routes = Array.isArray(stats) ? stats : stats.routes;
if (!Array.isArray(routes) || routes.length === 0) {
  console.error(
    'check-bundle-size: no route entries found in diagnostics file — ' +
      'refusing to pass silently.',
  );
  process.exit(1);
}

const failures = [];
for (const entry of routes) {
  const route = entry.route ?? entry.path;
  const bytes = entry.firstLoadUncompressedJsBytes;
  if (typeof route !== 'string' || typeof bytes !== 'number') continue;

  const budget = budgetFor(route);
  if (bytes > budget) {
    failures.push({ route, bytes, budget });
  }
}

if (failures.length > 0) {
  console.error('check-bundle-size: route(s) over budget:\n');
  for (const { route, bytes, budget } of failures) {
    console.error(
      `  ${route}: ${formatBytes(bytes)} > ${formatBytes(budget)} budget ` +
        `(+${formatBytes(bytes - budget)})`,
    );
  }
  console.error(
    '\nReduce first-load JS (lazy-load heavy deps, drop eager imports) or, ' +
      'if the increase is intentional, raise the budget in ' +
      'scripts/check-bundle-size.mjs.',
  );
  process.exit(1);
}

console.log(
  `check-bundle-size: all ${routes.length} routes within budget ` +
    `(/pay/[linkId] ≤ ${formatBytes(BUDGETS['/pay/[linkId]'])}).`,
);
