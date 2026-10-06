import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  FastForward,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react";
import { api, ApiError, money, percent, priceToCents } from "./lib";
import { navigate } from "./navigation";
import Dialog from "./Dialog";
import "./replay.css";

type ReplayOrder = {
  id: string;
  side: "buy" | "sell";
  kind: "market" | "limit";
  requested: number;
  remaining: number;
  executed: number;
  limit: number;
  total: number;
  fees: number;
  realized: number;
  status: string;
  time: string;
  reason: string;
  reflection: string;
  fills: {
    time: string;
    price: number;
    quantity: number;
    fee: number;
    mid: number;
  }[];
};
export type ReplaySession = {
  id: string | null;
  scenario: string;
  title: string;
  lesson: string;
  step: number;
  last_step: number;
  revision: number;
  finished: boolean;
  price: number;
  cash: number;
  shares: number;
  cost: number;
  reserved_cash: number;
  reserved_shares: number;
  clock: string;
  friction: string;
  prices: { step: number; time: string; price: number }[];
  history: { step: number; time: string; value: number }[];
  news: {
    step: number;
    time: string;
    title: string;
    body: string;
    source: string;
  }[];
  orders: ReplayOrder[];
  assumptions: {
    label: string;
    spread_bps: number;
    latency_bps: number;
    fee_bps: number;
  };
  metrics: {
    value: number;
    return: number;
    benchmark_value: number;
    benchmark_return: number;
    difference: number;
    drawdown: number;
    realized: number;
    unrealized: number;
    fees: number;
    trades: number;
  };
  share_url: string | null;
  notes_shared: boolean;
};
type Catalog = {
  scenarios: {
    id: string;
    title: string;
    description: string;
    lesson: string;
    tone: string;
    duration: string;
  }[];
  sessions: {
    id: string;
    title: string;
    step: number;
    finished: boolean;
    return: number;
    created_at: string;
  }[];
};
const isOpen = (o: ReplayOrder) =>
  ["open", "partial"].includes(o.status) && o.remaining > 0;

function Performance({ session }: { session: ReplaySession }) {
  const m = session.metrics;
  const values = session.history.map((p) => ({
    ...p,
    benchmark:
      10000000 -
      1000 * session.prices[0].price +
      1000 * session.prices[p.step].price,
  }));
  return (
    <section className="replay-performance" aria-label="Session performance">
      <div className="replay-recap-heading">
        <div>
          <span className="replay-eyebrow">
            {session.finished ? "Your session recap" : "Your progress"}
          </span>
          <h2>
            {session.finished
              ? "A chance to look back."
              : "See your decisions unfold."}
          </h2>
          <p>
            {session.finished
              ? `Finished at ${session.clock}. ${m.trades} ${m.trades === 1 ? "order had fills" : "orders had fills"}.`
              : "Your practice portfolio, marked at the latest revealed price."}
          </p>
        </div>
        <strong className={m.return >= 0 ? "positive" : "negative"}>
          {percent(m.return)}
          <small>Session return, after fees</small>
        </strong>
      </div>
      <div className="replay-stat-row">
        <div>
          <span>Portfolio value</span>
          <strong>{money(m.value)}</strong>
        </div>
        <div>
          <span>Holding benchmark</span>
          <strong>{percent(m.benchmark_return)}</strong>
        </div>
        <div>
          <span>Largest drawdown</span>
          <strong>{m.drawdown.toFixed(2)}%</strong>
        </div>
        <div>
          <span>Modeled fees paid</span>
          <strong>{money(m.fees)}</strong>
        </div>
      </div>
      <div className="replay-comparison-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={values}
            margin={{ top: 12, right: 20, left: 10, bottom: 4 }}
          >
            <CartesianGrid vertical={false} stroke="#e4eadd" />
            <XAxis dataKey="time" minTickGap={65} tick={{ fontSize: 11 }} />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(v) => money(v, 0)}
              width={82}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(v, name) => [
                money(Number(v)),
                name === "value" ? "Your portfolio" : "Holding benchmark",
              ]}
            />
            <Line
              name="value"
              dataKey="value"
              type="linear"
              stroke="#236b49"
              strokeWidth={2.5}
              dot={values.length === 1}
              isAnimationActive={false}
            />
            <Line
              name="benchmark"
              dataKey="benchmark"
              type="linear"
              stroke="#869879"
              strokeDasharray="5 5"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="replay-chart-key">
        <span>
          <i />
          Your portfolio
        </span>
        <span>
          <i className="dashed" />
          Holding benchmark
        </span>
      </div>
      <p className="replay-method">
        The benchmark buys 1,000 whole shares at the first mid-price and holds
        them. It excludes execution costs. Your return includes modeled spread,
        latency cost, and fees. Drawdown measures the largest drop from a
        previously observed portfolio peak.
      </p>
      <div className="replay-pnl">
        <span>Realized {money(m.realized)}</span>
        <span>Unrealized {money(m.unrealized)}</span>
        <span>Cash {money(session.cash)}</span>
        <span>Shares {session.shares}</span>
      </div>
    </section>
  );
}

function Reflection({
  order,
  busy,
  save,
}: {
  order: ReplayOrder;
  busy: boolean;
  save: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(order.reflection);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setValue(order.reflection);
  }, [order.reflection]);
  return (
    <form
      className="replay-reflection"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(await save(value));
      }}
    >
      <label htmlFor={`reflection-${order.id}`}>
        What would you keep or change?
      </label>
      <textarea
        id={`reflection-${order.id}`}
        value={value}
        maxLength={1200}
        placeholder="Review the decision with the information you had at the time."
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
      />
      <div>
        <button
          className="replay-text-button"
          disabled={busy || value === order.reflection}
        >
          Save reflection <Check size={14} />
        </button>
        <span role="status">
          {saved && value === order.reflection ? "Reflection saved" : ""}
        </span>
      </div>
    </form>
  );
}

function Journal({
  session,
  busy = false,
  cancel,
  reflect,
  readOnly = false,
}: {
  session: ReplaySession;
  busy?: boolean;
  cancel?: (id: string) => void;
  reflect?: (id: string, value: string) => Promise<boolean>;
  readOnly?: boolean;
}) {
  return (
    <section className="replay-journal">
      <div className="replay-section-heading">
        <div>
          <h2>Your decision journal.</h2>
          <p>
            {readOnly
              ? session.notes_shared
                ? "Notes were included by the person who shared this recap."
                : "Journal notes were kept private. Only trade outcomes are shown."
              : "The plan before each trade. The reflection after it."}
          </p>
        </div>
        <span>
          {session.orders.length}{" "}
          {session.orders.length === 1 ? "order" : "orders"}
        </span>
      </div>
      {!session.orders.length ? (
        <div className="replay-empty">
          <h3>A trade starts with a reason.</h3>
          <p>
            Your plans, fills, and reflections will appear here when you place
            an order.
          </p>
        </div>
      ) : (
        <div className="replay-journal-list">
          {[...session.orders].reverse().map((o) => (
            <article className="replay-journal-entry" key={o.id}>
              <header>
                <div>
                  <span className={`replay-side ${o.side}`}>
                    {o.side === "buy" ? (
                      <ArrowUpRight size={16} />
                    ) : (
                      <ArrowRight size={16} />
                    )}
                  </span>
                  <div>
                    <h3>
                      {o.side === "buy" ? "Buy" : "Sell"} LOTX{" "}
                      <small>{o.time}</small>
                    </h3>
                    <p>
                      {o.kind === "limit"
                        ? `Limit ${money(o.limit)}`
                        : "Market order"}{" "}
                      · {o.executed}/{o.requested} shares filled
                    </p>
                  </div>
                </div>
                <span className={`replay-order-status ${o.status}`}>
                  {o.status.replaceAll("_", " ")}
                </span>
              </header>
              {o.reason && (
                <p className="replay-reason">
                  <span>The plan</span>
                  {o.reason}
                </p>
              )}
              {o.fills.length > 0 && (
                <details className="replay-fill-details">
                  <summary>
                    See{" "}
                    {o.fills.length === 1
                      ? "the fill"
                      : `${o.fills.length} fills`}{" "}
                    and costs
                  </summary>
                  <div className="replay-fills">
                    {o.fills.map((f, i) => (
                      <p key={i}>
                        <span>
                          {f.time} · {f.quantity} shares at {money(f.price)}
                        </span>
                        <span>
                          Mid {money(f.mid)} · fee {money(f.fee)}
                        </span>
                      </p>
                    ))}
                  </div>
                  <p>
                    Gross {money(o.total)} · fees {money(o.fees)}
                    {o.side === "sell" && ` · realized ${money(o.realized)}`}
                  </p>
                </details>
              )}
              {isOpen(o) && cancel && (
                <button
                  className="replay-text-button"
                  disabled={busy}
                  onClick={() => cancel(o.id)}
                >
                  Cancel remaining {o.remaining} shares <X size={14} />
                </button>
              )}
              {reflect && (
                <Reflection
                  order={o}
                  busy={busy}
                  save={(value) => reflect(o.id, value)}
                />
              )}
              {readOnly && o.reflection && (
                <p className="replay-reason">
                  <span>The reflection</span>
                  {o.reflection}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ReplayWorkspace({
  accountId,
  sessionId,
}: {
  accountId: string;
  sessionId?: string;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleSessions, setVisibleSessions] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [friction, setFriction] = useState("standard");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [kind, setKind] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState("50");
  const [limit, setLimit] = useState("100.00");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [shareNotes, setShareNotes] = useState(false);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  const routeSession = useRef(sessionId);
  routeSession.current = sessionId;
  const busyRef = useRef(false);
  const attempted = useRef<{
    body: Record<string, unknown>;
    key: string;
    id: string;
  } | null>(null);
  const startAttempt = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const [reload, setReload] = useState(0);
  const preferredScenario = new URLSearchParams(window.location.search).get(
    "scenario",
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, [accountId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPlaying(false);
    setError("");
    setSession(null);
    setReview(false);
    attempted.current = null;
    if (sessionId)
      api<Catalog>("/api/replay", { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setCatalog(result);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    if (sessionId)
      api<{ session: ReplaySession }>(`/api/replay/${sessionId}`, {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) {
            setSession(result.session);
            setShareNotes(result.session.notes_shared);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    else
      api<Catalog>("/api/replay", { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setCatalog(result);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    return () => controller.abort();
  }, [accountId, sessionId, reload]);
  const send = useCallback(
    async (
      body: Record<string, unknown>,
      key: string,
      id: string,
    ): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setError("");
      setErrorStatus(null);
      attempted.current = { body, key, id };
      try {
        const result = await api<{ session: ReplaySession }>(
          `/api/replay/${id}`,
          {
            method: "POST",
            headers: { "Idempotency-Key": key },
            body: JSON.stringify(body),
          },
        );
        if (!alive.current || routeSession.current !== id) return false;
        setSession(result.session);
        attempted.current = null;
        if (result.session.finished) setPlaying(false);
        return true;
      } catch (e) {
        if (alive.current && routeSession.current === id) {
          setPlaying(false);
          setErrorStatus(e instanceof ApiError ? e.status : null);
          if (e instanceof ApiError && e.status < 500) attempted.current = null;
          setError(
            e instanceof Error
              ? e.message
              : "The action couldn't be saved. Retry the same request or reload the session.",
          );
        }
        return false;
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [],
  );
  const act = useCallback(
    async (action: string, data: Record<string, unknown> = {}) => {
      if (!session?.id) return false;
      return send(
        { action, revision: session.revision, ...data },
        crypto.randomUUID(),
        session.id,
      );
    },
    [session, send],
  );
  useEffect(() => {
    if (!playing || !session || session.finished || busy || review || error)
      return;
    const timer = setInterval(() => {
      void act("advance");
    }, 4000 / speed);
    return () => clearInterval(timer);
  }, [playing, session, busy, review, error, speed, act]);
  async function start(scenario: string, conditions = friction) {
    if (busyRef.current) return;
    setError("");
    setBusy(true);
    busyRef.current = true;
    const originSession = sessionId;
    const body = JSON.stringify({ scenario, friction: conditions });
    if (startAttempt.current?.fingerprint !== body)
      startAttempt.current = { fingerprint: body, key: crypto.randomUUID() };
    try {
      const result = await api<{ session: ReplaySession }>("/api/replay", {
        method: "POST",
        headers: { "Idempotency-Key": startAttempt.current.key },
        body,
      });
      if (alive.current && routeSession.current === originSession) {
        startAttempt.current = null;
        navigate(`/replay/${result.session.id}`);
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "The session couldn't open. Try again.",
        );
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const errorBlock = error && (
    <div className="replay-error" role="alert">
      <span>{error}</span>
      <div>
        {errorStatus === 400 && review && (
          <button
            onClick={() => {
              setError("");
              setErrorStatus(null);
              setReview(false);
            }}
          >
            Edit your plan
          </button>
        )}
        {attempted.current && (
          <button
            disabled={busy}
            onClick={async () => {
              const a = attempted.current;
              if (a && (await send(a.body, a.key, a.id))) {
                setReview(false);
                setFinishConfirm(false);
              }
            }}
          >
            Retry request
          </button>
        )}
        <button disabled={busy} onClick={() => setReload((v) => v + 1)}>
          Reload
        </button>
      </div>
    </div>
  );
  if (loading)
    return (
      <div className="replay-loading" role="status">
        <LoaderCircle className="spin" size={22} />
        Opening your learning sessions…
      </div>
    );
  if (!session)
    return (
      <div className="replay-library">
        {errorBlock}
        <div className="replay-library-intro">
          <div>
            <span className="replay-eyebrow">Lot Replay</span>
            <h1>
              Make a plan.
              <br />
              See what happens.
            </h1>
            <p>
              Practice a market day in a few minutes. Prices and fictional
              dispatches unfold as you go. Your future chart stays hidden.
            </p>
          </div>
          <div className="replay-library-note">
            <Play size={26} />
            <p>
              Pause whenever you need.
              <br />
              Trade with a reason.
              <br />
              Look back at the result.
            </p>
            <span>Independent $100,000 practice balance</span>
          </div>
        </div>
        <div className="replay-library-controls">
          <div>
            <h3>Choose your session.</h3>
            <p>Three synthetic days. One fictional company: LOTX.</p>
          </div>
          <label>
            Execution conditions
            <select
              value={friction}
              onChange={(e) => setFriction(e.target.value)}
              disabled={busy}
            >
              <option value="light">Light friction</option>
              <option value="standard">Standard friction</option>
              <option value="challenging">Challenging friction</option>
            </select>
          </label>
        </div>
        {catalog?.scenarios.some((s) => s.id === preferredScenario) && (
          <p className="replay-method">
            Ready to try the shared scenario? Choose{" "}
            {catalog.scenarios.find((s) => s.id === preferredScenario)?.title}{" "}
            below.
          </p>
        )}
        <div className="replay-scenarios">
          {catalog?.scenarios.map((s, i) => (
            <article
              className={`replay-scenario scenario-${i} ${s.id === preferredScenario ? "recommended-scenario" : ""}`}
              key={s.id}
            >
              <span>{s.tone}</span>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
              <blockquote>{s.lesson}</blockquote>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void start(s.id)}
              >
                Start {s.title.toLowerCase()} <ArrowUpRight size={17} />
              </button>
              <small>About {s.duration} at normal speed</small>
            </article>
          ))}
        </div>
        <p className="replay-method">
          Execution conditions control spread, modeled latency cost, and fees.
          The same scenario always follows the same price path. Replay funds
          stay separate from your regular portfolio.
        </p>
        <section className="replay-saved">
          <h2>Your saved sessions.</h2>
          {catalog?.sessions.length ? (
            catalog.sessions.slice(0, visibleSessions).map((s) => (
              <button
                className="replay-saved-row"
                key={s.id}
                onClick={() => navigate(`/replay/${s.id}`)}
              >
                <span>
                  <strong>{s.title}</strong>
                  <small>
                    {new Date(s.created_at).toLocaleDateString()} ·{" "}
                    {s.finished ? "Finished" : `Moment ${s.step + 1} of 60`}
                  </small>
                </span>
                <span className={s.return >= 0 ? "positive" : "negative"}>
                  {percent(s.return)}
                </span>
                <span>
                  {s.finished ? "Read recap" : "Resume"}{" "}
                  <ArrowRight size={16} />
                </span>
              </button>
            ))
          ) : (
            <div className="replay-empty">
              <p>
                Your sessions will stay here when you start practicing. Guests
                can return in this browser; an account saves progress across
                browsers.
              </p>
            </div>
          )}
          {catalog && catalog.sessions.length > visibleSessions && (
            <button
              className="replay-text-button"
              onClick={() => setVisibleSessions((v) => v + 30)}
            >
              Show older sessions <ArrowRight size={16} />
            </button>
          )}
        </section>
      </div>
    );
  const disabled = busy || !!error;
  const requested = Number(quantity);
  const price = kind === "limit" ? priceToCents(limit) : session.price;
  const valid =
    Number.isInteger(requested) &&
    requested >= 1 &&
    requested <= 10000 &&
    Number.isFinite(price) &&
    price > 0 &&
    reason.trim().length > 0;
  const a = session.assumptions;
  return (
    <div className="replay-workspace">
      {errorBlock}
      <div className="replay-session-title">
        <button
          className="replay-back"
          onClick={() => {
            setPlaying(false);
            navigate("/replay");
          }}
        >
          <ArrowRight size={15} /> All sessions
        </button>
        <div>
          <span>Fictional market session</span>
          <h1>{session.title}</h1>
        </div>
        <p>{session.lesson}</p>
      </div>
      {!session.finished && (
        <div className="replay-toolbar">
          <button
            className="replay-play"
            disabled={disabled || review}
            aria-label={playing ? "Pause replay" : "Play replay"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            disabled={disabled || review}
            onClick={() => {
              setPlaying(false);
              void act("advance");
            }}
          >
            <SkipForward size={17} />
            Next moment
          </button>
          <button
            disabled={disabled || review}
            onClick={() => {
              setPlaying(false);
              void act("advance", { count: 5 });
            }}
          >
            <FastForward size={17} />
            Skip ahead
          </button>
          <label>
            Speed
            <select
              aria-label="Replay speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </label>
          <span className="replay-clock">
            {session.clock}
            <small>Moment {session.step + 1} of 60</small>
          </span>
          <button
            className="replay-finish"
            disabled={disabled}
            onClick={() => {
              setPlaying(false);
              setFinishConfirm(true);
            }}
          >
            Finish here
          </button>
        </div>
      )}
      <div
        className="replay-progress"
        role="progressbar"
        aria-label="Revealed session"
        aria-valuemin={0}
        aria-valuemax={59}
        aria-valuenow={session.step}
      >
        <span style={{ width: `${(session.step / 59) * 100}%` }} />
      </div>
      {!session.finished && (
        <div className="replay-scene">
          <div className="replay-scene-main">
            <section className="replay-price-panel">
              <div>
                <span>LOTX · Lot Company</span>
                <strong>{money(session.price)}</strong>
                <small>Revealed price at {session.clock}</small>
              </div>
              <div className="replay-price-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={session.prices}
                    margin={{ top: 12, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="#e6ecdf" />
                    <XAxis
                      type="number"
                      dataKey="step"
                      domain={[0, 59]}
                      ticks={[0, 15, 30, 45, 59]}
                      tickFormatter={(step) => {
                        const minute = 570 + Math.round((step * 390) / 59);
                        return `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}`;
                      }}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      domain={[
                        (v) => Math.floor(v * 0.99),
                        (v) => Math.ceil(v * 1.01),
                      ]}
                      tickFormatter={(v) => money(v, 0)}
                      tick={{ fontSize: 11 }}
                      width={64}
                    />
                    <Tooltip
                      formatter={(v) => [money(Number(v)), "Revealed price"]}
                      labelFormatter={(step) =>
                        session.prices.find((p) => p.step === Number(step))
                          ?.time ?? ""
                      }
                    />
                    <Area
                      dataKey="price"
                      type="linear"
                      stroke="#236b49"
                      fill="#e9efdf"
                      strokeWidth={2.5}
                      dot={session.prices.length === 1}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="replay-method">
                Only revealed prices are shown. Blank space is the part of the
                session you haven't experienced yet.
              </p>
            </section>
            <section className="replay-dispatches">
              <div className="replay-section-heading">
                <h3>From the scenario desk.</h3>
                <span>Fictional dispatches</span>
              </div>
              {[...session.news].reverse().map((n) => (
                <article key={n.step}>
                  <time>{n.time}</time>
                  <div>
                    <h4>{n.title}</h4>
                    <p>{n.body}</p>
                  </div>
                </article>
              ))}
            </section>
          </div>
          <aside className="replay-ticket">
            <h3>Trade LOTX</h3>
            <div className="replay-ticket-balance">
              <span>
                Available cash{" "}
                <strong>{money(session.cash - session.reserved_cash)}</strong>
              </span>
              <span>
                Available shares{" "}
                <strong>{session.shares - session.reserved_shares}</strong>
              </span>
              {session.reserved_cash > 0 && (
                <small>
                  {money(session.reserved_cash)} reserved for open buys
                </small>
              )}
              {session.reserved_shares > 0 && (
                <small>
                  {session.reserved_shares} shares reserved for open sells
                </small>
              )}
            </div>
            <div
              className="segmented"
              role="group"
              aria-label="Replay order side"
            >
              {(["buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  aria-pressed={side === s}
                  className={side === s ? "active" : ""}
                  onClick={() => {
                    setPlaying(false);
                    setSide(s);
                  }}
                >
                  {s === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) {
                  setPlaying(false);
                  setReview(true);
                }
              }}
              onFocus={() => setPlaying(false)}
            >
              <label>
                Order type
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as "market" | "limit")
                  }
                >
                  <option value="market">Market order</option>
                  <option value="limit">Resting limit order</option>
                </select>
              </label>
              <label>
                Whole shares
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10000}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </label>
              {kind === "limit" && (
                <label>
                  Limit price (USD)
                  <input
                    inputMode="decimal"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    required
                  />
                </label>
              )}
              <label>
                Your plan
                <textarea
                  required
                  maxLength={1200}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why this trade? What would change your mind?"
                />
              </label>
              <div className="replay-estimate">
                <span>
                  {side === "buy" ? "Reference cost" : "Reference proceeds"}
                </span>
                <strong>{valid ? money(requested * price) : "—"}</strong>
              </div>
              <p className="replay-method">
                {kind === "limit"
                  ? "Reserves funds or shares and stays open until filled, cancelled, or the session ends."
                  : "Uses the current modeled quote. Unfilled shares cancel immediately."}{" "}
                Fees and execution conditions can change the final amount.
              </p>
              <button className="primary" disabled={!valid || disabled}>
                Review {side} <ArrowRight size={16} />
              </button>
            </form>
            <details className="replay-assumptions">
              <summary>Execution conditions: {a.label.toLowerCase()}</summary>
              <p>
                Full spread {a.spread_bps / 100}%. Modeled latency cost{" "}
                {a.latency_bps / 100}% per fill. Fee {a.fee_bps / 100}% of
                gross, rounded up to cents. Shared liquidity is 100–189 shares
                per side per moment. These are explicit simulation assumptions,
                not predictions of actual execution.
              </p>
            </details>
          </aside>
        </div>
      )}
      <Performance session={session} />
      {session.finished && (
        <section className="replay-next">
          <div>
            <h3>Try a different decision.</h3>
            <p>
              The same path, a fresh balance. Your completed session stays
              saved.
            </p>
          </div>
          <button
            className="primary"
            disabled={disabled}
            onClick={() => {
              void start(session.scenario, session.friction);
            }}
          >
            <RotateCcw size={16} />
            Retry this scenario
          </button>
          <div className="replay-share">
            <label>
              <input
                type="checkbox"
                checked={shareNotes}
                onChange={(e) => setShareNotes(e.target.checked)}
              />
              Include journal notes in the public recap
            </label>
            <button
              className="replay-text-button"
              disabled={disabled}
              onClick={() => void act("share", { include_notes: shareNotes })}
            >
              {session.share_url ? "Update shared recap" : "Create share link"}
              <ArrowUpRight size={15} />
            </button>
            <p>
              {session.share_url
                ? session.notes_shared
                  ? "Journal notes are included in this shared recap."
                  : "Your journal notes remain private."
                : "Nothing is public until you create a sharing link."}
            </p>
            {session.share_url && (
              <div className="replay-share-link">
                <a href={session.share_url} target="_blank" rel="noreferrer">
                  Open shared recap <ArrowUpRight size={14} />
                </a>
                <button
                  className="replay-text-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        window.location.origin + session.share_url,
                      );
                      setCopied(true);
                    } catch {
                      setError(
                        "Copy the link from the shared recap address bar.",
                      );
                    }
                  }}
                >
                  <Copy size={14} />
                  {copied ? "Copied" : "Copy link"}
                </button>
                <button
                  className="replay-text-button"
                  disabled={disabled}
                  onClick={() => void act("unshare")}
                >
                  Revoke link
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      <Journal
        session={session}
        busy={disabled}
        cancel={(id) => {
          setPlaying(false);
          void act("cancel", { order_id: id });
        }}
        reflect={async (id, value) => {
          setPlaying(false);
          return act("reflect", { order_id: id, reflection: value });
        }}
      />
      <p className="replay-method">
        Synthetic prices, fictional dispatches, and virtual funds. Your replay
        balance is separate from your regular portfolio. Guests save sessions in
        this browser; create an account to return across browsers.
      </p>
      {review && (
        <Dialog
          titleId="replay-review-title"
          onClose={() => {
            if (!busy) setReview(false);
          }}
        >
          <div className="replay-review">
            <span className="replay-eyebrow">One last look</span>
            <h2 id="replay-review-title">Review your practice order.</h2>
            <dl>
              <div>
                <dt>Action</dt>
                <dd>{side === "buy" ? "Buy" : "Sell"} LOTX</dd>
              </div>
              <div>
                <dt>Shares</dt>
                <dd>{requested}</dd>
              </div>
              <div>
                <dt>Order type</dt>
                <dd>
                  {kind === "market"
                    ? "Market · immediate or cancel"
                    : `Limit ${money(price)} · good for session`}
                </dd>
              </div>
              <div>
                <dt>Revealed price</dt>
                <dd>
                  {money(session.price)} at {session.clock}
                </dd>
              </div>
            </dl>
            <p className="replay-reason">
              <span>Your plan</span>
              {reason}
            </p>
            <p>
              Spread, modeled latency cost and fees apply. A market order may
              fill partially; an unfilled limit can remain open.
            </p>
            {errorBlock}
            <button
              className="primary"
              disabled={disabled}
              onClick={async () => {
                if (
                  await act("order", {
                    side,
                    kind,
                    quantity: requested,
                    limit: kind === "limit" ? price : 0,
                    reason,
                  })
                ) {
                  setReview(false);
                  setReason("");
                }
              }}
            >
              {busy ? "Saving order…" : `Confirm ${side}`}
              <ArrowRight size={16} />
            </button>
            <button
              className="replay-text-button"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Back to your plan
            </button>
          </div>
        </Dialog>
      )}
      {finishConfirm && (
        <Dialog
          titleId="replay-finish-title"
          onClose={() => {
            if (!busy) setFinishConfirm(false);
          }}
        >
          <div className="replay-review">
            <h2 id="replay-finish-title">Finish at {session.clock}?</h2>
            <p>
              Your recap will cover the revealed part of this session. Remaining
              open orders expire and release their reservations. You can retry
              the same scenario with a fresh balance afterward.
            </p>
            {errorBlock}
            <button
              className="primary"
              disabled={disabled}
              onClick={async () => {
                if (await act("finish")) setFinishConfirm(false);
              }}
            >
              Finish session <Check size={16} />
            </button>
            <button
              className="replay-text-button"
              disabled={busy}
              onClick={() => setFinishConfirm(false)}
            >
              Keep practicing
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function SharedReplay({ token }: { token: string }) {
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<{ session: ReplaySession }>(`/api/replay/shared/${token}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) setSession(r.session);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [token]);
  return (
    <div className="replay-shared-page">
      <header className="replay-shared-nav">
        <a className="wordmark" href="/">
          lot<span>.</span>
        </a>
        <a className="button button-dark" href="/replay">
          Try Lot Replay <ArrowUpRight size={17} />
        </a>
      </header>
      <main>
        {error ? (
          <div className="replay-empty">
            <h1>This recap is unavailable.</h1>
            <p>{error}</p>
            <a href="/replay">Try your own session</a>
          </div>
        ) : !session ? (
          <div className="replay-loading" role="status">
            <LoaderCircle className="spin" />
            Opening the shared recap…
          </div>
        ) : (
          <>
            <div className="replay-shared-heading">
              <span className="replay-eyebrow">A shared Lot Replay</span>
              <h1>{session.title}</h1>
              <p>
                A synthetic market day, experienced through someone's decisions.
                Virtual funds and fictional prices.
              </p>
            </div>
            <Performance session={session} />
            <Journal session={session} readOnly />
            <section className="replay-shared-invitation">
              <h2>Your turn to make the call.</h2>
              <p>
                Try the same scenario with a fresh $100,000 balance. No signup
                required.
              </p>
              <a
                className="button button-dark"
                href={`/replay?scenario=${session.scenario}`}
              >
                Try this scenario <ArrowUpRight size={17} />
              </a>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
