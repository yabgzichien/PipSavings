#!/usr/bin/env node
/**
 * Mint unique one-time lifetime Pip Pro promo codes into D1.
 *
 * Usage:
 *   node worker/scripts/mintPromoCodes.js --count 10
 *   node worker/scripts/mintPromoCodes.js --count 5 --prefix PIP --remote
 *
 * Prints SQL (and optionally runs wrangler d1 execute).
 */
const { execSync } = require('child_process');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function parseArgs(argv) {
  const out = { count: 10, prefix: 'PIP', remote: false, apply: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--count') out.count = Math.max(1, Number(argv[++i]) || 10);
    else if (arg === '--prefix') out.prefix = String(argv[++i] || 'PIP').toUpperCase();
    else if (arg === '--remote') out.remote = true;
    else if (arg === '--apply') out.apply = true;
  }
  return out;
}

function randomSegment(len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

function mintCode(prefix) {
  return `${prefix}-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

function main() {
  const opts = parseArgs(process.argv);
  const now = Date.now();
  const codes = [];
  const seen = new Set();
  while (codes.length < opts.count) {
    const code = mintCode(opts.prefix);
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }

  const sql = `INSERT INTO promo_codes (code, grant_kind, duration_days, max_redemptions, redemption_count, disabled, created_at) VALUES ${codes
    .map((code) => `('${code}', 'lifetime', NULL, 1, 0, 0, ${now})`)
    .join(', ')};`;

  console.log(sql);
  console.log('\n# Codes:');
  for (const code of codes) console.log(code);

  if (!opts.apply) {
    console.log('\n# Dry run only. Re-run with --apply to insert via wrangler.');
    return;
  }

  const target = opts.remote ? '--remote' : '--local';
  const cmd = `npx wrangler d1 execute pip-quota-db ${target} --command ${JSON.stringify(sql)}`;
  console.log(`\n# Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: require('path').join(__dirname, '..') });
}

main();
