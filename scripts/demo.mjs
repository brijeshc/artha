#!/usr/bin/env node
// Seed + serve the demo dashboard for development.
//
// Creates `.demo/` (gitignored) - a tiny fake shop repo with cross-module
// imports (so `artha build` mines a reference graph), six `.artha` entries in
// every status, and a git history that gives each module a different churn -
// then builds its index with the local `dist/cli.js` and serves the dashboard.
//
//   npm run demo               # build artha, seed if missing, serve on 4173
//   npm run demo -- --fresh    # throw the seeded repo away and reseed
//   npm run demo -- --port 5000
//
// Curation writes (link/certify/edit) persist in `.demo/` between runs;
// `--fresh` (or deleting the directory) resets them.

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const demoDir = join(repoRoot, '.demo');
const cli = join(repoRoot, 'dist', 'cli.js');

// ── the seeded shop ───────────────────────────────────────────────────────────

/** Base source tree. Imports are deliberately cross-module so the reference
 * graph has edges: checkout→billing/notifications, reports→billing/checkout,
 * auth→billing, billing→notifications. */
const SRC = {
  'src/auth/login.ts': 'export function login() {}\n',
  'src/auth/session.ts':
    "import { Subscription } from '../billing/Subscription';\n\n" +
    'export function session() {\n  return new Subscription();\n}\n',
  'src/billing/Subscription.ts':
    'export class Subscription {\n' +
    "  status: string = 'trialing';\n" +
    '  renew(): void {}\n' +
    '  cancel(): void {}\n' +
    '}\n',
  'src/billing/gateway.ts': 'export class StripeGateway {\n  charge(cents: number): void {}\n}\n',
  'src/billing/refund.ts':
    "import { StripeGateway } from './gateway';\n" +
    "import { sendEmail } from '../notifications/email';\n\n" +
    'export function startRefund(id: string): void {}\n' +
    'export function validateRefund(id: string): boolean {\n  return true;\n}\n' +
    'export function issueRefund(id: string): void {\n' +
    '  new StripeGateway().charge(0);\n  sendEmail();\n}\n',
  // A string-literal union - the inferred layer reads it into an "Order State"
  // state-machine candidate (21a), with no human input.
  'src/checkout/orderState.ts':
    "export type OrderState = 'cart' | 'placed' | 'paid' | 'fulfilled' | 'cancelled';\n",
  'src/checkout/Checkout.ts':
    "import { Subscription } from '../billing/Subscription';\n" +
    "import { StripeGateway } from '../billing/gateway';\n" +
    "import { sendEmail } from '../notifications/email';\n" +
    "import type { OrderState } from './orderState';\n\n" +
    'export class Checkout {\n' +
    "  state: OrderState = 'cart';\n" +
    '  private gateway = new StripeGateway();\n' +
    '  private sub?: Subscription;\n' +
    // The methods that move the OrderState field - cross-file uses of the union
    // declared in orderState.ts, so the 21b-2 usage index grounds its transitions.
    "  place(): void {\n    if (this.state === 'cart') this.state = 'placed';\n  }\n" +
    '  pay(): void {\n' +
    "    if (this.state === 'placed') {\n      this.gateway.charge(0);\n      sendEmail();\n      this.state = 'paid';\n    }\n  }\n" +
    "  fulfill(): void {\n    if (this.state === 'paid') this.state = 'fulfilled';\n  }\n" +
    "  cancel(): void {\n    this.state = 'cancelled';\n  }\n" +
    '}\n',
  // An exported orchestration function - the inferred layer reads it as a "Place
  // Order" flow skeleton (21a), its steps the areas it imports (Billing then
  // Notifications), with the meaning/order left as the human delta.
  'src/checkout/placeOrder.ts':
    "import { StripeGateway } from '../billing/gateway';\n" +
    "import { sendEmail } from '../notifications/email';\n\n" +
    'export function placeOrder(): void {\n' +
    '  new StripeGateway().charge(0);\n  sendEmail();\n}\n',
  // A TS enum - inferred into a "Channel" state set (a second module lit purely
  // by the machine layer, in a module with no certified concept).
  'src/notifications/email.ts':
    'export enum Channel {\n  Email,\n  Sms,\n  Push,\n}\n\n' + 'export function sendEmail() {}\n',
  'src/reports/monthly.ts':
    "import { issueRefund } from '../billing/refund';\n" +
    "import { Subscription } from '../billing/Subscription';\n" +
    "import { Checkout } from '../checkout/Checkout';\n\n" +
    'export function monthly() {\n' +
    '  const sub = new Subscription();\n' +
    '  const cart = new Checkout();\n' +
    "  issueRefund('demo');\n}\n",
};

/** `.artha/` entries covering every status: certified (glows), proposed
 * (certify/suggest surfaces), stale (hatched seam). Pin hashes are left blank -
 * the first `artha build` fills them against the seeded source. */
const ARTHA = {
  '.artha/config.yaml':
    'source_roots: [src]\n' +
    'embeddings:\n  enabled: false\n' +
    'areas:\n' +
    '  Billing & Money: [src/billing]\n' +
    '  Buying: [src/checkout]\n' +
    '  Platform: [src/auth, src/notifications]\n',
  '.artha/concepts/subscription.yaml':
    'id: concept.subscription\n' +
    'kind: concept\n' +
    'status: certified\n' +
    'name: Subscription\n' +
    "summary: A customer's recurring paid access - it moves through a small lifecycle as payments succeed or fail. It has retry mechanisms for failed payments\n" +
    'states:\n' +
    '  - name: trialing\n    effect: full access, no charge yet\n' +
    '  - name: active\n    invariant: currentPeriodEnd is in the future\n' +
    '  - name: past_due\n    effect: grace window before access is cut\n' +
    '  - name: canceled\n    effect: access ends at period end\n' +
    'transitions:\n' +
    '  - from: trialing\n    to: active\n    trigger: first payment succeeds\n' +
    '  - from: active\n    to: past_due\n    trigger: payment fails\n' +
    '  - from: past_due\n    to: active\n    trigger: retry succeeds\n' +
    '  - from: active\n    to: canceled\n    trigger: user cancels\n' +
    'pins:\n' +
    '  - symbol: src/billing/Subscription.ts#Subscription\n' +
    'certified_by: Demo Dev\n' +
    'certified_at: 2026-07-04\n',
  '.artha/concepts/checkout.yaml':
    'id: concept.checkout\n' +
    'kind: concept\n' +
    'status: stale\n' +
    'name: Checkout\n' +
    'summary: Turning a cart into a paid order.\n' +
    'states:\n' +
    '  - name: cart\n  - name: paying\n  - name: paid\n' +
    'transitions:\n' +
    '  - from: cart\n    to: paying\n    trigger: submit\n' +
    '  - from: paying\n    to: paid\n    trigger: payment confirmed\n' +
    'pins:\n' +
    '  - symbol: src/checkout/Checkout.ts#Checkout\n' +
    '  - symbol: src/billing/gateway.ts#StripeGateway\n' +
    'certified_by: Demo Dev\n' +
    'certified_at: 2026-07-04\n',
  '.artha/flows/refund.yaml':
    'id: flow.refund\n' +
    'kind: flow\n' +
    'status: proposed\n' +
    'name: Refund a purchase\n' +
    'summary: Give the money back safely.\n' +
    'steps:\n' +
    '  - on: customer asks\n    do: validate the request\n' +
    '    pin:\n      symbol: src/billing/refund.ts#validateRefund\n' +
    '  - do: reverse the charge\n' +
    '    pin:\n      symbol: src/billing/refund.ts#issueRefund\n' +
    '  - do: notify the customer\n' +
    '    pin:\n      symbol: src/notifications/email.ts#sendEmail\n' +
    '  - do: reconcile the ledger\n' +
    'entry:\n' +
    '  - symbol: src/billing/refund.ts#startRefund\n' +
    'pins:\n' +
    '  - symbol: src/checkout/Checkout.ts#Checkout\n' +
    '  - symbol: src/notifications/email.ts#sendEmail\n',
  '.artha/decisions/stripe.yaml':
    'id: decision.stripe\n' +
    'kind: decision\n' +
    'status: certified\n' +
    'title: Use Stripe for card processing\n' +
    'context: We needed PCI-compliant card handling without building our own vault.\n' +
    'decision: Route all card charges through Stripe via a single gateway class.\n' +
    'pins:\n' +
    '  - symbol: src/billing/gateway.ts#StripeGateway\n' +
    'certified_by: Demo Dev\n' +
    'certified_at: 2026-06-30\n',
  '.artha/invariants/money.yaml':
    'id: invariant.money\n' +
    'kind: invariant\n' +
    'status: certified\n' +
    'name: Money is integer minor units\n' +
    'rule: All monetary amounts are stored and computed as integer minor units (cents); never floats.\n' +
    'scope: [src/billing/**]\n' +
    'certified_by: Demo Dev\n' +
    'certified_at: 2026-06-30\n',
  '.artha/conventions/naming.yaml':
    'id: convention.naming\n' +
    'kind: convention\n' +
    'status: proposed\n' +
    'name: Repository classes end in Repo\n' +
    'rule: Data-access classes are named <Entity>Repo and expose find/save only.\n' +
    'scope: [src/**]\n',
};

/** Post-scaffold commits: which file each one touches gives the modules their
 * churn gradient (billing 6 > auth 5 > checkout 4 > notifications 3 > reports 2,
 * counting the scaffold commit). */
const CHURN = [
  ...[1, 2, 3, 4, 5].map((n) => ({
    file: 'src/billing/Subscription.ts',
    line: `// change ${n}`,
    msg: `billing work ${n}`,
  })),
  ...[1, 2, 3, 4].map((n) => ({
    file: 'src/auth/login.ts',
    line: `// change ${n}`,
    msg: `auth work ${n}`,
  })),
  ...[1, 2, 3].map((n) => ({
    file: 'src/checkout/Checkout.ts',
    line: `// change ${n}`,
    msg: `checkout work ${n}`,
  })),
  ...[1, 2].map((n) => ({
    file: 'src/notifications/email.ts',
    line: `// change ${n}`,
    msg: `notifications ${n}`,
  })),
  { file: 'src/reports/monthly.ts', line: '// r', msg: 'reports tweak' },
];

function seed() {
  const git = (...a) => execFileSync('git', a, { cwd: demoDir, stdio: 'pipe' });

  for (const [rel, content] of Object.entries({ ...SRC, ...ARTHA })) {
    const abs = join(demoDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  writeFileSync(join(demoDir, '.gitignore'), '.artha/index.db\n');

  git('init');
  git('config', 'user.name', 'Demo Dev');
  git('config', 'user.email', 'demo@example.com');
  git('add', '-A');
  git('commit', '-m', 'initial scaffold');
  for (const { file, line, msg } of CHURN) {
    appendFileSync(join(demoDir, file), `${line}\n`);
    git('commit', '-am', msg);
  }
}

// ── run ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? args[portIdx + 1] : '4173';

if (!existsSync(cli)) {
  console.error('demo: dist/cli.js not found - run `npm run build` first.');
  process.exit(1);
}

if (fresh) rmSync(demoDir, { recursive: true, force: true });

if (!existsSync(demoDir)) {
  console.log(`demo: seeding ${demoDir} …`);
  seed();
} else {
  console.log(`demo: reusing ${demoDir} (pass --fresh to reseed)`);
}

execFileSync(process.execPath, [cli, 'build'], { cwd: demoDir, stdio: 'inherit' });

const serve = spawn(process.execPath, [cli, 'serve', '--port', port], {
  cwd: demoDir,
  stdio: 'inherit',
});
serve.on('exit', (code) => process.exit(code ?? 0));
