import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, Check, LoaderCircle, RotateCcw } from "lucide-react";
import { api, money, percent } from "./lib";
import {
  useAppDispatch,
  useAppSelector,
  saveReflection,
  cancelOrder,
} from "./store";
import type { Order } from "./types";

type History = {
  points: { time: string; value: number; benchmark: number }[];
  since: string | null;
  return: number;
  benchmark_return: number;
  drawdown: number;
  limited: boolean;
};
export function PortfolioHistory() {
  const account = useAppSelector((s) => s.trading.account);
  const [history, setHistory] = useState<History | null>(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError("");
    api<History>(`/api/portfolio/history?days=${days}`, { signal: c.signal })
      .then((h) => {
        if (!c.signal.aborted) setHistory(h);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [account?.id, account?.revision, days, reload]);
  return (
    <section className="card observed-history">
      <div className="section-heading">
        <div>
          <h2>Your portfolio over time.</h2>
          <p>Observed values, saved as you use the workspace.</p>
        </div>
        <div
          className="history-ranges"
          role="group"
          aria-label="Portfolio history window"
        >
          {[
            [1, "1D"],
            [7, "1W"],
            [30, "1M"],
          ].map(([v, label]) => (
            <button
              key={v}
              aria-pressed={days === v}
              onClick={() => setDays(Number(v))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error} <button onClick={() => setReload((v) => v + 1)}>Retry</button>
        </p>
      ) : !history ? (
        <p className="small-muted">Loading observed history…</p>
      ) : !history.points.length ? (
        <div className="replay-empty">
          <h3>Your history starts here.</h3>
          <p>
            Lot records a valuation when your workspace receives quotes. Your
            next observation will appear here; earlier values are not invented.
          </p>
          <button
            className="replay-text-button"
            onClick={() => setReload((v) => v + 1)}
          >
            Check observations <RotateCcw size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="replay-stat-row">
            <div>
              <span>Return in shown window</span>
              <strong>{percent(history.return)}</strong>
            </div>
            <div>
              <span>Holding comparison</span>
              <strong>{percent(history.benchmark_return)}</strong>
            </div>
            <div>
              <span>Largest drawdown</span>
              <strong>{history.drawdown.toFixed(2)}%</strong>
            </div>
          </div>
          <div className="observed-history-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history.points}>
                <CartesianGrid vertical={false} stroke="#e4eadd" />
                <XAxis
                  dataKey="time"
                  minTickGap={60}
                  tickFormatter={(t) =>
                    new Date(t).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  width={80}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => money(v, 0)}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  labelFormatter={(t) => new Date(String(t)).toLocaleString()}
                  formatter={(v, n) => [
                    money(Number(v)),
                    n === "value" ? "Portfolio" : "Holding comparison",
                  ]}
                />
                <Line
                  dataKey="value"
                  type="linear"
                  stroke="#236b49"
                  strokeWidth={2}
                  dot={history.points.length === 1}
                  isAnimationActive={false}
                />
                <Line
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
              Holding comparison
            </span>
          </div>
          <p className="replay-method">
            Tracking shown from {new Date(history.since!).toLocaleString()}. The
            comparison holds the cash and share quantities at the first shown
            observation. One valuation is stored per observed minute; sparse
            observations are connected by straight lines.{" "}
            {history.limited &&
              "This window shows the latest 5,000 observations."}{" "}
            A reset begins a new tracking period.
          </p>
        </>
      )}
    </section>
  );
}

export function OrderLearning({ order }: { order: Order }) {
  const dispatch = useAppDispatch();
  const account = useAppSelector((s) => s.trading.account);
  const [reflection, setReflection] = useState(order.reflection ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setReflection(order.reflection ?? "");
  }, [order.reflection]);
  const open =
    order.time_in_force === "gtc" && ["open", "partial"].includes(order.status);
  async function cancel() {
    if (!account) return;
    setBusy(true);
    setError("");
    try {
      await dispatch(
        cancelOrder({ accountId: account.id, orderId: order.id }),
      ).unwrap();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The order couldn't be cancelled. Refresh its status and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="order-learning">
      <p className="replay-method">
        Fills walk the available simulated ask levels for buys and bid levels
        for sells, with price/time priority. The spread and limited depth can
        make the average fill differ from the chart price. Regular workspace
        executions use no modeled fee or latency cost; Replay offers adjustable
        conditions.
      </p>
      {open && (
        <div className="open-order-note">
          <p>
            {order.requested - order.executed} shares remain open at{" "}
            {money(order.limit ?? 0)}. Reserved{" "}
            {order.side === "buy" ? "cash" : "shares"} stays unavailable to
            other orders. Lot checks up to one eligible open order per quote
            refresh while the regular workspace is open; it does not run a
            continuous exchange.
          </p>
          <button
            className="replay-text-button"
            disabled={busy}
            onClick={() => void cancel()}
          >
            Cancel remaining shares <RotateCcw size={14} />
          </button>
        </div>
      )}
      {order.realized != null && order.side === "sell" && (
        <p className="replay-method">
          Realized profit/loss for these fills: {money(order.realized)}.
        </p>
      )}
      <p className="replay-reason">
        <span>Your original plan</span>
        {order.reason || "No reason was recorded before this order."}
      </p>
      <form
        className="replay-reflection"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!account) return;
          setBusy(true);
          setError("");
          try {
            await dispatch(
              saveReflection({
                accountId: account.id,
                orderId: order.id,
                reflection,
              }),
            ).unwrap();
            setSaved(true);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "The reflection couldn't be saved. Try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={`ordinary-reflection-${order.id}`}>
          What would you keep or change?
        </label>
        <textarea
          id={`ordinary-reflection-${order.id}`}
          value={reflection}
          maxLength={1200}
          placeholder="Reflect on the information you had at the time."
          onChange={(e) => {
            setReflection(e.target.value);
            setSaved(false);
          }}
        />
        <div>
          <button
            className="replay-text-button"
            disabled={busy || reflection === (order.reflection ?? "")}
          >
            Save reflection <Check size={14} />
          </button>
          <span role="status">{saved ? "Reflection saved" : ""}</span>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

export function PrivateNews({ symbol }: { symbol: string }) {
  const [articles, setArticles] = useState<
    | {
        id: string;
        headline: string;
        source: string;
        published_at: string;
        url: string;
      }[]
    | null
  >(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setArticles(null);
    setError("");
    api<{ articles: NonNullable<typeof articles> }>(
      `/api/news?symbol=${encodeURIComponent(symbol)}`,
      { signal: c.signal },
    )
      .then((r) => {
        if (!c.signal.aborted) setArticles(r.articles);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [symbol, reload]);
  return (
    <section className="card private-news">
      <div className="section-heading">
        <h2>In the news.</h2>
        <span className="small-muted">Private Alpaca feed</span>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error} <button onClick={() => setReload((v) => v + 1)}>Retry</button>
        </p>
      ) : articles === null ? (
        <p className="small-muted">
          <LoaderCircle size={15} className="spin" />
          Loading headlines…
        </p>
      ) : !articles.length ? (
        <p className="small-muted">No headlines were returned for {symbol}.</p>
      ) : (
        articles.map((a) => (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
            <span>
              {a.source} · {new Date(a.published_at).toLocaleString()}
            </span>
            <h3>
              {a.headline}
              <ArrowUpRight size={15} />
            </h3>
          </a>
        ))
      )}
      <p className="replay-method">
        Publisher headlines and timestamps, with links to the original articles.
        News and simulated executions are independent; these headlines are not
        used in Replay.
      </p>
    </section>
  );
}
