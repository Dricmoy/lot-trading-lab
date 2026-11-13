/* global __ENV, console */
// Closed-model load test against the deployed Java/C++ stack.
// SCENARIO: engine (stateless Java + C++ subprocess), orders (full ledger path:
// row lock + Postgres + C++), account (read path). VUS / DURATION set the load.
import http from "k6/http";
import { check, fail } from "k6";
import exec from "k6/execution";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:8080";
const SCENARIO = __ENV.SCENARIO || "engine";
const VUS = Number(__ENV.VUS || 8);
const DURATION = __ENV.DURATION || "30s";

export const options = {
  scenarios: { [SCENARIO]: { executor: "constant-vus", vus: VUS, duration: DURATION, gracefulStop: "5s" } },
  noCookiesReset: true, // each VU keeps one guest account for the whole run
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  thresholds: { checks: ["rate>0.99"] },
};

const symbols = ["NVDA", "AAPL", "MSFT", "AMZN", "TSLA", "GOOGL", "COIN", "HOOD"];
const session = {}; // per-VU guest account: cookie jar + CSRF token

function ensureSession() {
  if (session.csrf) return;
  const res = http.get(`${BASE}/api/account`, { tags: { name: "setup" } });
  if (res.status !== 200) fail(`guest setup failed: ${res.status}`);
  const jar = http.cookieJar().cookiesForURL(BASE);
  session.csrf = (jar.csrftoken || [])[0];
  if (!session.csrf) fail("no csrftoken cookie");
  session.n = 0;
}

function uuid() {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += h[(Math.random() * 16) | 0];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20)}`;
}

function engine() {
  const symbol = symbols[exec.scenario.iterationInTest % symbols.length];
  const res = http.post(
    `${BASE}/api/engine`,
    JSON.stringify({ symbol, side: "buy", kind: "market", quantity: 25 }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "POST /api/engine" } },
  );
  check(res, {
    "engine 200": (r) => r.status === 200,
    "fills sum to total": (r) => {
      const b = r.json();
      const fills = b.fills || (b.result && b.result.fills) || [];
      const total = b.total !== undefined ? b.total : b.result && b.result.total;
      return fills.length > 0 && fills.reduce((t, f) => t + f.price * f.quantity, 0) === total;
    },
  });
}

function orders() {
  ensureSession();
  // Alternate buy/sell of one share so cash and holdings stay bounded for the run.
  const side = session.n++ % 2 === 0 ? "buy" : "sell";
  const res = http.post(
    `${BASE}/api/orders`,
    JSON.stringify({ symbol: "HOOD", side, kind: "market", quantity: 1 }),
    {
      headers: {
        "Content-Type": "application/json",
        Origin: BASE,
        // The CSRF cookie can rotate after a mutation, so read the current one.
        "X-CSRFToken": (http.cookieJar().cookiesForURL(BASE).csrftoken || [session.csrf])[0],
        "Idempotency-Key": uuid(),
      },
      tags: { name: "POST /api/orders" },
    },
  );
  if (__ENV.DEBUG && res.status !== 201) console.log(res.status, res.body.slice(0, 200));
  check(res, {
    "order 201": (r) => r.status === 201,
    "order filled": (r) => r.status === 201 && r.json("order.executed") === 1,
  });
}

function account() {
  ensureSession();
  const res = http.get(`${BASE}/api/account`, { tags: { name: "GET /api/account" } });
  check(res, { "account 200": (r) => r.status === 200 && typeof r.json("cash") === "number" });
}

export default { engine, orders, account }[SCENARIO];

export function handleSummary(data) {
  const m = data.metrics;
  const d = m.http_req_duration.values;
  const lines = [
    `${SCENARIO} vus=${VUS} duration=${DURATION}`,
    `  requests ${m.http_reqs.values.count}  rps ${m.http_reqs.values.rate.toFixed(1)}  failed ${(m.http_req_failed.values.rate * 100).toFixed(2)}%`,
    `  latency ms  p50 ${d.med.toFixed(2)}  p95 ${d["p(95)"].toFixed(2)}  p99 ${d["p(99)"].toFixed(2)}  max ${d.max.toFixed(2)}`,
    `  checks passed ${(m.checks.values.rate * 100).toFixed(2)}%`,
  ];
  for (const g of data.root_group.checks)
    if (g.fails) lines.push(`  FAILED CHECK ${g.name}: ${g.fails}/${g.passes + g.fails}`);
  const result = { stdout: lines.join("\n") + "\n" };
  if (__ENV.OUT) result[__ENV.OUT] = JSON.stringify(data, null, 2);
  return result;
}
