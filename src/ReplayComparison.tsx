import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  GitBranch,
  LoaderCircle,
  MousePointer2,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, money, percent } from "./lib";
import { navigate } from "./navigation";
import Dialog from "./Dialog";
import type { Catalog, ReplayOrder, ReplaySession } from "./Replay";
import "./comparison.css";

type Decision = {
  id: string;
  action: "order" | "cancel" | "finish";
  step: number;
  time: string;
  price: number;
  before_value: number;
  value: number;
  cash: number;
  shares: number;
  order: ReplayOrder | null;
  final_order: ReplayOrder | null;
  reflection: string;
};
type Attempt = {
  id: string;
  created_at: string;
  clock: string;
  step: number;
  friction: string;
  metrics: ReplaySession["metrics"];
  decisions: Decision[];
  common: {
    metrics: ReplaySession["metrics"];
    cash: number;
    shares: number;
    history: ReplaySession["history"];
  };
};
type Comparison = {
  example?: boolean;
  scenario: string;
  title: string;
  cutoff: number;
  clock: string;
  shared_decisions: number;
  different_conditions: boolean;
  attempts: [Attempt, Attempt];
};
type Inspection = { label: string; decision: Decision }[];
type Saved = Catalog["sessions"][number];
const compatible = (a: Saved, b: Saved) =>
  a.id !== b.id &&
  a.scenario === b.scenario &&
  a.scenario_version === b.scenario_version;
function attemptLabel(s: Saved, sessions: Saved[]) {
  const same = sessions
    .filter(
      (p) =>
        p.scenario === s.scenario && p.scenario_version === s.scenario_version,
    )
    .slice()
    .reverse();
  return `Attempt ${same.findIndex((p) => p.id === s.id) + 1} · ${new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${percent(s.return)}`;
}
function decisionTitle(d: Decision) {
  if (d.action === "finish") return "Finish the session";
  if (d.action === "cancel") return `Cancel ${d.order?.side} limit`;
  const o = d.order!;
  return `${o.side === "buy" ? "Buy" : "Sell"} ${o.requested} shares`;
}
function decisionSubtitle(d: Decision) {
  if (d.action === "finish") return `Stopped at moment ${d.step + 1}`;
  if (d.action === "cancel") return `${d.order?.remaining} shares released`;
  return d.order?.kind === "limit"
    ? `Limit ${money(d.order.limit)}`
    : "Market order";
}

function ChoiceNode({
  decision,
  label,
  shared = false,
  pairedValue,
  onInspect,
}: {
  decision: Decision;
  label: string;
  shared?: boolean;
  pairedValue?: number;
  onInspect: () => void;
}) {
  return (
    <li className={`comparison-choice ${shared ? "shared-choice" : ""}`}>
      <button
        onClick={onInspect}
        aria-label={`${label}, ${decision.time}, ${decisionTitle(decision)}. Inspect decision.`}
      >
        <span className="comparison-choice-time">
          <time>{decision.time}</time>
          <span>Moment {decision.step + 1}</span>
        </span>
        <strong>{decisionTitle(decision)}</strong>
        <span>{decisionSubtitle(decision)}</span>
        <span className="comparison-choice-value">
          <span>
            {pairedValue === undefined ? (
              money(decision.value)
            ) : (
              <>
                A {money(decision.value)}
                <br />B {money(pairedValue)}
              </>
            )}
          </span>{" "}
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}

function DecisionTree({
  comparison,
  inspect,
}: {
  comparison: Comparison;
  inspect: (value: Inspection) => void;
}) {
  const [showShared, setShowShared] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { attempts, shared_decisions: common } = comparison;
  const shared = attempts[0].decisions.slice(0, common);
  const branchLengths = attempts.map((a) => a.decisions.length - common);
  return (
    <section className="comparison-tree" aria-labelledby="decision-tree-title">
      <header className="comparison-section-heading">
        <div>
          <h2 id="decision-tree-title">The paths you took.</h2>
          <p>Follow the shared start to the first different choice.</p>
        </div>
        <span>
          <MousePointer2 size={15} /> Select a choice to inspect it
        </span>
      </header>
      <div className="comparison-root">
        <span>Same market day</span>
        <strong>$100,000</strong>
        <small>Virtual cash · no shares</small>
      </div>
      {shared.length > 0 && (
        <div className="comparison-trunk">
          <p>
            {common} shared {common === 1 ? "choice" : "choices"}
          </p>
          {shared.length > 3 && (
            <button
              className="replay-text-button"
              onClick={() => setShowShared(!showShared)}
            >
              {showShared
                ? "Hide earlier shared choices"
                : `Show ${shared.length - 3} earlier shared choices`}
            </button>
          )}
          <ol>
            {(showShared ? shared : shared.slice(-3)).map((d) => (
              <ChoiceNode
                key={d.id}
                decision={d}
                label="Shared choice"
                shared
                pairedValue={
                  attempts[1].decisions[shared.findIndex((p) => p.id === d.id)]
                    .value
                }
                onInspect={() => {
                  const index = shared.findIndex((p) => p.id === d.id);
                  inspect(
                    attempts.map((a, i) => ({
                      label: `Attempt ${i === 0 ? "A" : "B"}`,
                      decision: a.decisions[index],
                    })),
                  );
                }}
              />
            ))}
          </ol>
        </div>
      )}
      <div className="comparison-fork" aria-hidden="true">
        <svg viewBox="0 0 600 60" preserveAspectRatio="none">
          <path d="M300 0 V18 Q300 30 285 30 H160 Q150 30 150 42 V60" />
          <path d="M300 0 V18 Q300 30 315 30 H440 Q450 30 450 42 V60" />
        </svg>
        <span>
          {branchLengths.some((n) => n > 0)
            ? "Choices diverge"
            : "Same choices"}
        </span>
      </div>
      <div className="comparison-branches">
        {attempts.map((a, i) => (
          <section
            className={`comparison-branch attempt-${i}`}
            key={a.id}
            aria-label={`Attempt ${i === 0 ? "A" : "B"} decision branch`}
          >
            <header>
              <span className="comparison-attempt-mark">
                {i === 0 ? "A" : "B"}
              </span>
              <div>
                <h3>Attempt {i === 0 ? "A" : "B"}</h3>
                <p>
                  {a.friction[0].toUpperCase() + a.friction.slice(1)} friction
                </p>
              </div>
            </header>
            <ol>
              {a.decisions
                .slice(common, showAll ? undefined : common + 6)
                .map((d) => (
                  <ChoiceNode
                    key={d.id}
                    decision={d}
                    label={`Attempt ${i === 0 ? "A" : "B"}`}
                    onInspect={() =>
                      inspect([
                        {
                          label: `Attempt ${i === 0 ? "A" : "B"}`,
                          decision: d,
                        },
                      ])
                    }
                  />
                ))}
            </ol>
            {!branchLengths[i] && (
              <p className="comparison-no-choice">
                No different saved choices.
              </p>
            )}
            {branchLengths[i] > 6 && !showAll && (
              <p className="comparison-more">
                {branchLengths[i] - 6} more choices below
              </p>
            )}
            {(showAll || branchLengths[i] <= 6) && (
              <div className="comparison-ending">
                <span>Finished at {a.clock}</span>
                <strong>{percent(a.metrics.return)}</strong>
                <small>{money(a.metrics.value)} · full attempt ending</small>
                {!comparison.example && (
                  <button
                    className="replay-text-button"
                    onClick={() => navigate(`/replay/${a.id}`)}
                  >
                    Read recap <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
      {branchLengths.some((n) => n > 6) && (
        <button
          className="comparison-expand"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show fewer choices" : "Show all choices in both branches"}
        </button>
      )}
      <p className="replay-method">
        Branches show saved orders, cancellations and early finishes. Identical
        timing, size and order terms share a trunk; written plans can differ. A
        split records a difference in choices, not proof that one choice caused
        the final result. Waiting is the space between decisions. Automatic
        fills stay attached to their orders.
      </p>
    </section>
  );
}

function DecisionInspection({
  inspection,
  close,
}: {
  inspection: Inspection;
  close: () => void;
}) {
  return (
    <Dialog titleId="comparison-inspection-title" onClose={close}>
      <div className="comparison-inspection">
        <header>
          <div>
            <span>Inside the decision</span>
            <h2 id="comparison-inspection-title">
              {decisionTitle(inspection[0].decision)}
            </h2>
          </div>
          <button
            className="comparison-close"
            onClick={close}
            aria-label="Close decision"
          >
            <X size={20} />
          </button>
        </header>
        <div
          className={`comparison-inspection-columns ${inspection.length === 2 ? "inspection-pair" : ""}`}
        >
          {inspection.map(({ label, decision: d }) => (
            <section key={d.id}>
              <h3>
                {label}{" "}
                <small>
                  {d.time} · LOTX {money(d.price)}
                </small>
              </h3>
              <dl>
                <div>
                  <dt>Before decision</dt>
                  <dd>{money(d.before_value)}</dd>
                </div>
                <div>
                  <dt>After decision</dt>
                  <dd>{money(d.value)}</dd>
                </div>
                <div>
                  <dt>Cash after</dt>
                  <dd>{money(d.cash)}</dd>
                </div>
                <div>
                  <dt>Shares after</dt>
                  <dd>{d.shares}</dd>
                </div>
              </dl>
              {d.order && (
                <>
                  <div className="comparison-note">
                    <h4>The plan at placement</h4>
                    <p>{d.order.reason}</p>
                  </div>
                  <div className="comparison-note">
                    <h4>At this decision</h4>
                    <p>
                      {d.order.executed}/{d.order.requested} shares filled.{" "}
                      {d.order.status.replaceAll("_", " ")}. Fees so far{" "}
                      {money(d.order.fees)}.
                    </p>
                  </div>
                  {d.final_order && (
                    <details className="comparison-fill-list">
                      <summary>All fills from this order</summary>
                      {d.final_order.fills.length ? (
                        d.final_order.fills.map((f, index) => (
                          <p key={index}>
                            {f.time} · {f.quantity} at {money(f.price)}
                            <small>
                              Mid {money(f.mid)} · fee {money(f.fee)}
                            </small>
                          </p>
                        ))
                      ) : (
                        <p>No fills before the order ended.</p>
                      )}
                      <p>
                        Final status:{" "}
                        {d.final_order.status.replaceAll("_", " ")}. Total fees{" "}
                        {money(d.final_order.fees)}.
                      </p>
                    </details>
                  )}
                  <div className="comparison-note">
                    <h4>Saved reflection</h4>
                    <p>{d.reflection || "No reflection saved yet."}</p>
                  </div>
                </>
              )}
              {d.action === "finish" && (
                <p className="replay-method">
                  Finishing expires resting orders. Held shares remain marked at
                  this revealed price.
                </p>
              )}
            </section>
          ))}
        </div>
        <p className="replay-method">
          Values use the revealed mid-price. An immediate change reflects
          modeled execution costs. Later price moves and decisions contribute to
          the eventual outcome.
        </p>
      </div>
    </Dialog>
  );
}

function CommonOutcome({ comparison }: { comparison: Comparison }) {
  const [a, b] = comparison.attempts;
  const aPoints = new Map(a.common.history.map((p) => [p.step, p]));
  const bPoints = new Map(b.common.history.map((p) => [p.step, p]));
  const points = Array.from({ length: comparison.cutoff + 1 }, (_, step) => ({
    step,
    time: aPoints.get(step)?.time ?? bPoints.get(step)?.time,
    a: aPoints.get(step)?.value,
    b: bPoints.get(step)?.value,
  }));
  const rows: [string, (attempt: Attempt) => string][] = [
    ["Net return", (x) => percent(x.common.metrics.return)],
    ["Portfolio value", (x) => money(x.common.metrics.value)],
    ["Largest drawdown", (x) => `${x.common.metrics.drawdown.toFixed(2)}%`],
    ["Modeled fees", (x) => money(x.common.metrics.fees)],
    ["Orders with fills", (x) => String(x.common.metrics.trades)],
    ["Shares held", (x) => String(x.common.shares)],
  ];
  return (
    <section
      className="comparison-outcome"
      aria-labelledby="common-outcome-title"
    >
      <header className="comparison-section-heading">
        <div>
          <h2 id="common-outcome-title">Two attempts. The same clock.</h2>
          <p>
            Both measured at {comparison.clock}, moment {comparison.cutoff + 1}.
          </p>
        </div>
        <div className="comparison-value-gap">
          <strong>
            {money(a.common.metrics.value - b.common.metrics.value)}
          </strong>
          <span>A minus B at this cutoff</span>
        </div>
      </header>
      {a.step !== b.step && (
        <p className="comparison-caveat">
          One attempt finished earlier. This chart and table stop at{" "}
          {comparison.clock}, the last moment both experienced. Each branch
          shows its own full ending separately.
        </p>
      )}
      {comparison.different_conditions && (
        <p className="comparison-caveat">
          Execution conditions differ. Differences include spread, modeled
          latency cost and fees as well as decisions.
        </p>
      )}
      <div
        className="comparison-chart"
        aria-label={`Portfolio values for attempts A and B through ${comparison.clock}. Exact results appear in the table below.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="#e4eadd" />
            <XAxis dataKey="time" minTickGap={65} tick={{ fontSize: 11 }} />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(v) => money(v, 0)}
              width={86}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(v, name) => [
                money(Number(v)),
                name === "a" ? "Attempt A" : "Attempt B",
              ]}
            />
            <Line
              dataKey="a"
              name="a"
              stroke="#236b49"
              strokeWidth={2.5}
              dot={points.length === 1}
              isAnimationActive={false}
            />
            <Line
              dataKey="b"
              name="b"
              stroke="#4767a4"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={points.length === 1}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="comparison-chart-key">
        <span>
          <i />
          Attempt A
        </span>
        <span>
          <i />
          Attempt B
        </span>
      </div>
      <table className="comparison-results">
        <caption>
          Results at {comparison.clock}, after all decisions at that moment
        </caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Attempt A</th>
            <th scope="col">Attempt B</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value(a)}</td>
              <td>{value(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="replay-method">
        Returns include modeled costs. Open holdings are valued at the revealed
        price. Both attempts start with independent $100,000 balances on the
        same version of the synthetic path.
      </p>
    </section>
  );
}

export default function ReplayComparison({ accountId }: { accountId: string }) {
  const [example, setExample] = useState(
    () => new URLSearchParams(window.location.search).get("example") === "1",
  );
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoadingCatalog(true);
    setError("");
    api<Catalog>("/api/replay", { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setCatalog(result);
        const params = new URLSearchParams(window.location.search);
        const finished = result.sessions.filter((s) => s.finished);
        const selectedA =
          finished.find((s) => s.id === params.get("first")) ??
          finished.find((s) => finished.some((p) => compatible(s, p))) ??
          finished[0];
        const selectedB =
          selectedA &&
          (finished.find(
            (s) => s.id === params.get("second") && compatible(selectedA, s),
          ) ??
            finished.find((s) => compatible(selectedA, s)));
        setFirst(selectedA?.id ?? "");
        setSecond(selectedB?.id ?? "");
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Your saved attempts could not load.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCatalog(false);
      });
    return () => controller.abort();
  }, [accountId, retry]);
  useEffect(() => {
    const controller = new AbortController();
    setComparison(null);
    setInspection(null);
    setError("");
    setLoadingComparison(false);
    if (example)
      window.history.replaceState({}, "", "/replay/compare?example=1");
    else if (first) {
      const params = new URLSearchParams({ first });
      if (second) params.set("second", second);
      window.history.replaceState({}, "", `/replay/compare?${params}`);
    }
    if (example || (first && second)) {
      setLoadingComparison(true);
      api<Comparison>(
        example
          ? "/api/replay/compare/example"
          : `/api/replay/compare?first=${encodeURIComponent(first)}&second=${encodeURIComponent(second)}`,
        { signal: controller.signal },
      )
        .then((result) => {
          if (!controller.signal.aborted) setComparison(result);
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error
                ? e.message
                : "These attempts could not be compared.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingComparison(false);
        });
    }
    return () => controller.abort();
  }, [accountId, first, second, retry, example]);
  const finished = catalog?.sessions.filter((s) => s.finished) ?? [];
  const selected = finished.find((s) => s.id === first);
  const peers = selected ? finished.filter((s) => compatible(selected, s)) : [];
  return (
    <div className="replay-comparison">
      <button className="comparison-back" onClick={() => navigate("/replay")}>
        <ArrowLeft size={15} /> All sessions
      </button>
      <div className="comparison-intro">
        <div>
          <span>Lot Replay</span>
          <h1>Same day. Different decisions.</h1>
          <p>
            Put two completed attempts beside each other. See where your plans
            split, then follow what happened.
          </p>
        </div>
      </div>
      {error && (
        <div className="replay-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
        </div>
      )}
      {loadingCatalog ? (
        <div className="replay-loading" role="status">
          <LoaderCircle className="spin" size={22} />
          Opening your saved attempts…
        </div>
      ) : (
        <>
          {example ? (
            <div className="comparison-example-banner">
              <div>
                <strong>Example decision tree</strong>
                <p>
                  Scripted choices executed by the replay simulator. Explore the
                  branches and inspect each plan.
                </p>
              </div>
              <button
                className="replay-text-button"
                onClick={() => setExample(false)}
              >
                Use my attempts <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <button
              className="comparison-example-link"
              onClick={() => setExample(true)}
            >
              <GitBranch size={16} /> Explore an example decision tree
            </button>
          )}
          {!example && finished.length > 0 && (
            <div className="comparison-picker">
              <label>
                <span>
                  <b>A</b> First attempt
                </span>
                <select
                  value={first}
                  onChange={(e) => {
                    const next = finished.find((s) => s.id === e.target.value)!;
                    setFirst(next.id);
                    setSecond(
                      peers.find((s) => s.id === second && compatible(next, s))
                        ?.id ??
                        finished.find((s) => compatible(next, s))?.id ??
                        "",
                    );
                  }}
                >
                  {catalog?.scenarios.map((scenario) => (
                    <optgroup key={scenario.id} label={scenario.title}>
                      {finished
                        .filter((s) => s.scenario === scenario.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {attemptLabel(s, catalog.sessions)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <button
                className="comparison-swap"
                aria-label="Swap attempts A and B"
                disabled={!first || !second}
                onClick={() => {
                  setFirst(second);
                  setSecond(first);
                }}
              >
                <ArrowLeftRight size={19} />
              </button>
              <label>
                <span>
                  <b>B</b> Second attempt
                </span>
                <select
                  value={second}
                  disabled={!peers.length}
                  onChange={(e) => setSecond(e.target.value)}
                >
                  {!peers.length && (
                    <option value="">
                      Complete another attempt on this path
                    </option>
                  )}
                  {peers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {attemptLabel(s, catalog!.sessions)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {!example && selected && (
            <p className="comparison-scenario-name">
              {selected.title} · Only finished attempts on the same scenario
              version can be paired.
            </p>
          )}
          {!example && !second && !error && (
            <div className="comparison-empty">
              <GitBranch size={38} />
              <h2>Give your next decision a different path.</h2>
              <p>
                {selected
                  ? "You have one finished attempt on this scenario. Complete another, then return to follow both branches."
                  : "Complete a scenario, retry it with a different approach, then compare the two saved attempts here."}
              </p>
              <button
                className="primary"
                onClick={() =>
                  navigate(selected ? `/replay/${selected.id}` : "/replay")
                }
              >
                {selected ? "Open recap and retry" : "Choose a scenario"}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {loadingComparison && (
            <div className="replay-loading" role="status">
              <LoaderCircle className="spin" size={22} />
              Tracing your decisions…
            </div>
          )}
          {comparison && (
            <>
              <div className="comparison-current-title">
                <h2>{comparison.title}</h2>
                <span>
                  {comparison.example
                    ? "Scripted choices on a fictional market day."
                    : "Your journal notes stay in your workspace."}
                </span>
              </div>
              <DecisionTree
                key={`${first}:${second}`}
                comparison={comparison}
                inspect={setInspection}
              />
              <CommonOutcome comparison={comparison} />
            </>
          )}
        </>
      )}
      {inspection && (
        <DecisionInspection
          inspection={inspection}
          close={() => setInspection(null)}
        />
      )}
    </div>
  );
}
