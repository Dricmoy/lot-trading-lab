import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  BarChart3,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Download,
  ExternalLink,
  Layers3,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Wallet,
  X,
  Zap,
  RotateCcw,
  Activity,
  CircleDot,
  AlertCircle,
} from "lucide-react";
import {
  useAppDispatch,
  useAppSelector,
  loadMarket,
  loadAccount,
  selectSymbol,
  setView,
  saveWatchlist,
  submitOrder,
  resetAccount,
  connectPrivate,
  settleOrders,
} from "./store";
import {
  change,
  money,
  percent,
  portfolioValue,
  priceToCents,
  chartHistory,
} from "./lib";
import type { Asset, Order, OrderInput } from "./types";
import AccountMenu from "./AccountMenu";
import Dialog from "./Dialog";
import ReplayWorkspace from "./Replay";
import ReplayComparison from "./ReplayComparison";
import { navigate } from "./navigation";
import { PortfolioHistory, OrderLearning, PrivateNews } from "./Insights";

const orderIsOpen = (order: Order) =>
  order.time_in_force === "gtc" && ["open", "partial"].includes(order.status);

const assetColors: Record<string, string> = {
  HOOD: "#c5f36a",
  NVDA: "#e4f2ce",
  AAPL: "#edf0f4",
  TSLA: "#fde8e7",
  MSFT: "#e4edff",
  AMZN: "#fff0d9",
  GOOGL: "#e6effd",
  COIN: "#e6eaff",
};
function AssetMark({
  symbol,
  small = false,
}: {
  symbol: string;
  small?: boolean;
}) {
  return (
    <span
      className={`asset-mark ${small ? "small" : ""}`}
      style={{ background: assetColors[symbol] ?? "#eee" }}
      aria-hidden="true"
    >
      <img
        src={`/logos/${symbol}.${["MSFT", "AMZN"].includes(symbol) ? "ico" : "svg"}`}
        alt=""
      />
    </span>
  );
}
function Sparkline({ asset }: { asset: Asset }) {
  const positive = change(asset) >= 0;
  if (!asset.history.length)
    return (
      <span className="sparkline" aria-label="Select stock to view its chart" />
    );
  const min = Math.min(...asset.history),
    max = Math.max(...asset.history);
  return (
    <svg
      className="sparkline"
      viewBox="0 0 110 36"
      role="img"
      aria-label={`${asset.symbol} ${asset.quote_time ? "IEX" : "simulated"} price trend`}
    >
      <polyline
        fill="none"
        stroke={positive ? "#278760" : "#d57569"}
        strokeWidth="1.8"
        points={asset.history
          .map(
            (v, i) =>
              `${(i / Math.max(1, asset.history.length - 1)) * 110},${32 - ((v - min) / (max - min || 1)) * 28}`,
          )
          .join(" ")}
      />
    </svg>
  );
}

function Sidebar() {
  const dispatch = useAppDispatch();
  const { view, user } = useAppSelector((s) => s.trading);
  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Lot home">
        <span className="brand-icon">
          <span />
          <span />
        </span>
        lot<span className="brand-period">.</span>
      </a>
      <span className="workspace-label">Your workspace</span>
      <nav aria-label="Main navigation">
        {(
          [
            { id: "trade", name: "Trading", icon: BarChart3 },
            { id: "portfolio", name: "Portfolio", icon: Wallet },
            { id: "activity", name: "Activity", icon: Activity },
            { id: "replay", name: "Lot Replay", icon: RotateCcw },
          ] as const
        ).map(({ id, name, icon: Icon }) => (
          <button
            key={id}
            aria-label={name}
            aria-current={view === id ? "page" : undefined}
            className={`nav-link ${view === id ? "active" : ""}`}
            onClick={() => {
              if (id === "replay") navigate("/replay");
              else {
                if (window.location.pathname.startsWith("/replay"))
                  navigate(user ? "/app" : "/demo");
                dispatch(setView(id));
              }
            }}
          >
            <Icon size={19} />
            <span>{name}</span>
            {view === id && <span className="nav-dot" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-note">
        <div className="note-symbol">
          <Wallet size={22} />
        </div>
        <h3>
          Learn at your
          <br />
          own pace.
        </h3>
        <p>$100,000 in virtual cash. Every trade is practice.</p>
        <span>
          <ShieldCheck size={14} />
          Virtual money only
        </span>
      </div>
      <div className="sidebar-bottom">
        <div className="avatar">{user?.name[0] || "G"}</div>
        <div>
          <strong>{user?.name || "Guest investor"}</strong>
          <span>{user ? "Practice account" : "Guest workspace"}</span>
        </div>
        <ChevronDown size={15} />
      </div>
    </aside>
  );
}

function Header() {
  const dispatch = useAppDispatch();
  const { market, view } = useAppSelector((s) => s.trading);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (view !== "replay" && (e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [view]);
  const filtered =
    market?.assets.filter((a) =>
      `${a.symbol} ${a.name}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <header className="topbar">
      <div className="breadcrumb">
        Workspace <ChevronRight size={13} />
        <strong>
          {
            {
              trade: "Trading",
              portfolio: "Portfolio",
              activity: "Activity",
              replay: "Lot Replay",
            }[view]
          }
        </strong>
      </div>
      <div className="search-wrap" hidden={view === "replay"}>
        <Search size={16} />
        <input
          ref={input}
          aria-label="Search stocks"
          placeholder="Search stocks"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        <kbd>
          <Command size={11} /> K
        </kbd>
        {focused && (
          <div className="search-results">
            {filtered.length ? (
              filtered.map((a) => (
                <button
                  key={a.symbol}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    dispatch(selectSymbol(a.symbol));
                    setSearch("");
                    setFocused(false);
                    input.current?.blur();
                  }}
                >
                  <AssetMark small symbol={a.symbol} />
                  <span>
                    <strong>{a.symbol}</strong>
                    <small>{a.name}</small>
                  </span>
                  <b>{money(a.price)}</b>
                </button>
              ))
            ) : (
              <p>No matching stocks</p>
            )}
          </div>
        )}
      </div>
      <span className="paper-badge">
        <span /> Paper trading
      </span>
      <AccountMenu />
    </header>
  );
}

function PriceChart({ asset }: { asset: Asset }) {
  const [range, setRange] = useState("1D");
  const [hover, setHover] = useState<number | null>(null);
  const [watchPending, setWatchPending] = useState(false);
  const [watchError, setWatchError] = useState("");
  const dispatch = useAppDispatch();
  const { watchlist } = useAppSelector((s) => s.trading);
  const real = !!asset.quote_time;
  const data = chartHistory(asset, range).map((point, i, arr) => ({
    price: point.price / 100,
    time: new Date(
      point.timestamp ??
        Date.UTC(2026, 8, 14, 9, 30) +
          ((96 - arr.length + i) / 95) * 6.5 * 3600000,
    ).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: real ? "America/New_York" : "UTC",
    }),
  }));
  const price = hover ?? asset.price;
  const delta = price - asset.previous;
  return (
    <section className="card chart-card">
      <div className="stock-heading">
        <div className="stock-identity">
          <AssetMark symbol={asset.symbol} />
          <div>
            <h2>
              {asset.symbol}
              <span>{asset.name}</span>
            </h2>
            <span>NASDAQ</span>
          </div>
        </div>
        <button
          className={`watch-button ${watchlist.includes(asset.symbol) ? "watched" : ""}`}
          aria-pressed={watchlist.includes(asset.symbol)}
          disabled={watchPending}
          onClick={async () => {
            setWatchPending(true);
            setWatchError("");
            const next = watchlist.includes(asset.symbol)
              ? watchlist.filter((s) => s !== asset.symbol)
              : [...watchlist, asset.symbol];
            try {
              await dispatch(saveWatchlist(next)).unwrap();
            } catch {
              setWatchError("Couldn't save your watchlist. Please try again.");
            } finally {
              setWatchPending(false);
            }
          }}
        >
          <Star
            size={15}
            fill={watchlist.includes(asset.symbol) ? "currentColor" : "none"}
          />
          {watchlist.includes(asset.symbol) ? "Watching" : "Watch"}
        </button>
      </div>
      {watchError && (
        <p className="inline-error" role="alert">
          {watchError}
        </p>
      )}
      <div className="quote-overview">
        <div className="price-block">
          <h1>{money(price)}</h1>
          <div className={delta >= 0 ? "positive" : "negative"}>
            {delta >= 0 ? (
              <ArrowUpRight size={17} />
            ) : (
              <ArrowDownLeft size={17} />
            )}{" "}
            {money(Math.abs(delta))} ({percent((delta / asset.previous) * 100)}){" "}
            <span>{real ? "vs. previous IEX close" : "simulated today"}</span>
          </div>
        </div>
        <div className="stock-facts">
          <div>
            <span>Previous close</span>
            <strong>{money(asset.previous)}</strong>
          </div>
          <div>
            <span>{real ? "Chart close range" : "Day range"}</span>
            <strong>
              {money(Math.min(...asset.history))} –{" "}
              {money(Math.max(...asset.history))}
            </strong>
          </div>
          <div>
            <span>Sector</span>
            <strong>{asset.sector}</strong>
          </div>
        </div>
      </div>
      {real && (
        <p className="feed-detail">
          Last IEX trade:{" "}
          {new Date(asset.quote_time!).toLocaleString("en-US", {
            timeZone: "America/New_York",
          })}{" "}
          ET. Prices may be from the last session.
        </p>
      )}
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 5, left: 0, bottom: 0 }}
            onMouseMove={(state) => {
              const i = Number(state.activeTooltipIndex);
              if (Number.isInteger(i) && data[i])
                setHover(Math.round(data[i].price * 100));
            }}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#74c49b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#74c49b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="#edf0eb"
              strokeDasharray="4 5"
            />
            <XAxis
              dataKey="time"
              minTickGap={70}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#949b94", fontSize: 11 }}
              dy={10}
            />
            <YAxis
              domain={["dataMin - 0.2", "dataMax + 0.2"]}
              orientation="right"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#949b94", fontSize: 11 }}
              tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
              width={43}
              tickCount={4}
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="chart-tooltip">
                    <span>
                      {label} · {real ? "ET" : "scenario time"}
                    </span>
                    <strong>{money(Number(payload[0].value) * 100)}</strong>
                  </div>
                ) : null
              }
            />
            <Area
              type="linear"
              dataKey="price"
              stroke="#26865d"
              strokeWidth={2.3}
              fill="url(#priceFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-footer">
        <div className="range-tabs">
          {["1H", "1D"].map((r) => (
            <button
              className={range === r ? "selected" : ""}
              key={r}
              onClick={() => {
                setRange(r);
                setHover(null);
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="scenario-label">
          <CircleDot size={12} />{" "}
          {real
            ? `IEX · 5-minute closes · ${asset.history_times?.[0] ? new Date(asset.history_times[0]).toLocaleDateString("en-US", { timeZone: "America/New_York" }) : "Unavailable"}`
            : "Simulated intraday scenario"}
        </span>
        <BarChart3 size={16} />
      </div>
    </section>
  );
}

function OrderTicket({ asset }: { asset: Asset }) {
  const dispatch = useAppDispatch();
  const { account, pending, marketError } = useAppSelector((s) => s.trading);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [kind, setKind] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState("1");
  const [limit, setLimit] = useState("");
  const [timeInForce, setTimeInForce] = useState<"ioc" | "gtc">("gtc");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<OrderInput | null>(null);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Order | null>(null);
  const requestKey = useRef<string | null>(null);
  const selected = useRef(asset.symbol);
  useEffect(() => {
    if (selected.current !== asset.symbol) {
      selected.current = asset.symbol;
      setReview(null);
      setConfirmation(null);
      setError("");
      setLimit("");
      requestKey.current = null;
    }
  }, [asset.symbol]);
  const owned =
    (account?.positions.find((p) => p.symbol === asset.symbol)?.quantity ?? 0) -
    (account?.reserved_shares?.[asset.symbol] ?? 0);
  const estimated =
    Number(quantity) *
    (kind === "limit"
      ? priceToCents(limit)
      : asset.price + (side === "buy" ? 1 : -1));
  function prepare() {
    setError("");
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1 || q > 10000) {
      setError("Enter 1–10,000 whole shares.");
      return;
    }
    const cents = kind === "limit" ? priceToCents(limit) : 0;
    if (kind === "limit" && (!Number.isSafeInteger(cents) || cents < 1)) {
      setError("Enter a valid limit price with up to two decimals.");
      return;
    }
    if (side === "sell" && q > owned) {
      setError(`You own ${owned} ${asset.symbol} shares.`);
      return;
    }
    if (
      side === "buy" &&
      estimated > (account?.cash ?? 0) - (account?.reserved_cash ?? 0)
    ) {
      setError("This order exceeds your buying power.");
      return;
    }
    requestKey.current = crypto.randomUUID();
    setReview({
      symbol: asset.symbol,
      side,
      kind,
      quantity: q,
      limit: cents,
      time_in_force: kind === "limit" ? timeInForce : "ioc",
      reason,
    });
  }
  async function confirm() {
    if (!review || !requestKey.current) return;
    setError("");
    try {
      const result = await dispatch(
        submitOrder({ order: review, key: requestKey.current }),
      ).unwrap();
      setConfirmation(result.order);
      setReview(null);
      requestKey.current = null;
      setReason("");
      dispatch(loadMarket(asset.symbol));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String(e.message)
            : "Your order could not be placed. Try again.",
      );
    }
  }
  return (
    <section className="card order-card">
      <div className="ticket-title">
        <h2>Trade {asset.symbol}</h2>
        <span className="muted-pill">Practice</span>
      </div>
      {confirmation ? (
        <div className="order-success">
          <span className="success-icon">
            {confirmation.executed ? <CheckCheck /> : <CircleHelp />}
          </span>
          <h3>
            {confirmation.status === "filled"
              ? "Order filled"
              : confirmation.status === "partial"
                ? "Partially filled"
                : orderIsOpen(confirmation)
                  ? "Order is open"
                  : "Limit not reached"}
          </h3>
          <p>
            {confirmation.executed
              ? `${confirmation.executed} ${confirmation.symbol} shares ${confirmation.side === "buy" ? "bought" : "sold"} for ${money(confirmation.total)}.`
              : "No shares traded at your limit price. Your balance is unchanged."}
          </p>
          <span>
            {orderIsOpen(confirmation)
              ? "Remaining shares stay open. Funds or shares are reserved until filled or cancelled; checks occur while the workspace is open."
              : "Unfilled shares are cancelled immediately."}
          </span>
          <button
            className="primary"
            onClick={() => {
              setConfirmation(null);
              setQuantity("1");
            }}
          >
            Make another trade <ArrowRight size={16} />
          </button>
          <button
            className="text-button"
            onClick={() => dispatch(setView("activity"))}
          >
            View execution details <ArrowUpRight size={14} />
          </button>
        </div>
      ) : review ? (
        <>
          <div className="review-heading">
            <ShieldCheck size={27} />
            <h3>One last look.</h3>
            <p>Check the details before you place your order.</p>
          </div>
          <dl className="order-summary">
            <div>
              <dt>Action</dt>
              <dd className="capitalize">
                {review.side} {review.symbol}
              </dd>
            </div>
            <div>
              <dt>Order type</dt>
              <dd className="capitalize">{review.kind}</dd>
            </div>
            <div>
              <dt>Shares</dt>
              <dd>{review.quantity}</dd>
            </div>
            {review.kind === "limit" && (
              <div>
                <dt>Limit price</dt>
                <dd>{money(review.limit)}</dd>
              </div>
            )}
            <div className="summary-total">
              <dt>Estimated {side === "buy" ? "cost" : "credit"}</dt>
              <dd>{money(estimated)}</dd>
            </div>
          </dl>
          {review.reason && (
            <p className="replay-reason">
              <span>Your plan</span>
              {review.reason}
            </p>
          )}
          <p className="execution-note">
            {review.time_in_force === "gtc"
              ? "Unfilled shares stay open at your limit. Cash or shares are reserved. Orders are checked while your workspace is open."
              : "Your order fills at available practice prices. Any unfilled shares are cancelled immediately."}
          </p>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={pending} onClick={confirm}>
            {pending ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                Confirm {side} <ArrowRight size={17} />
              </>
            )}
          </button>
          <button
            className="text-button full"
            disabled={pending}
            onClick={() => {
              setReview(null);
              requestKey.current = null;
              setError("");
            }}
          >
            Back to order
          </button>
        </>
      ) : (
        <>
          <div className="side-switch">
            <button
              className={side === "buy" ? "active" : ""}
              onClick={() => {
                setSide("buy");
                setError("");
              }}
            >
              Buy
            </button>
            <button
              className={side === "sell" ? "active" : ""}
              onClick={() => {
                setSide("sell");
                setError("");
              }}
            >
              Sell
            </button>
          </div>
          <label className="field-label" htmlFor="order-type">
            Order type
          </label>
          <div className="select-wrap">
            <select
              id="order-type"
              value={kind}
              onChange={(e) => setKind(e.target.value as "market" | "limit")}
            >
              <option value="market">Market order</option>
              <option value="limit">Limit order</option>
            </select>
            <ChevronDown size={15} />
          </div>
          <label className="field-label" htmlFor="quantity">
            Number of shares{" "}
            <span>
              {side === "sell" ? `${owned} available` : "Whole shares"}
            </span>
          </label>
          <div className="quantity-input">
            <input
              id="quantity"
              inputMode="numeric"
              type="number"
              min="1"
              max="10000"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <span>{asset.symbol}</span>
          </div>
          <div className="quantity-presets">
            {[1, 5, 10, 25].map((q) => (
              <button
                key={q}
                onClick={() => setQuantity(String(q))}
                className={quantity === String(q) ? "selected" : ""}
              >
                {q} {q === 1 ? "share" : "shares"}
              </button>
            ))}
          </div>
          {kind === "limit" && (
            <>
              <label className="field-label" htmlFor="limit">
                Limit price
              </label>
              <div className="quantity-input">
                <span>$</span>
                <input
                  id="limit"
                  placeholder={(asset.price / 100).toFixed(2)}
                  value={limit}
                  inputMode="decimal"
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <label className="field-label" htmlFor="time-in-force">
                Unfilled shares
              </label>
              <div className="select-wrap">
                <select
                  id="time-in-force"
                  value={timeInForce}
                  onChange={(e) =>
                    setTimeInForce(e.target.value as "ioc" | "gtc")
                  }
                >
                  <option value="gtc">
                    Keep open until filled or cancelled
                  </option>
                  <option value="ioc">Cancel immediately</option>
                </select>
                <ChevronDown size={15} />
              </div>
            </>
          )}
          <label className="field-label" htmlFor="trade-reason">
            Your plan <span>Optional</span>
          </label>
          <textarea
            className="ordinary-trade-reason"
            id="trade-reason"
            maxLength={1200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this trade? What would change your mind?"
          />
          <dl className="order-summary">
            <div>
              <dt>Market price</dt>
              <dd>{money(asset.price)}</dd>
            </div>
            <div>
              <dt>
                Trading fee <CircleHelp size={12} />
              </dt>
              <dd>$0.00</dd>
            </div>
            <div className="summary-total">
              <dt>Estimated {side === "buy" ? "cost" : "credit"}</dt>
              <dd>{Number.isFinite(estimated) ? money(estimated) : "—"}</dd>
            </div>
          </dl>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="primary"
            disabled={!account || !!marketError}
            onClick={prepare}
          >
            Review {side === "buy" ? "buy" : "sell"} order{" "}
            <ArrowRight size={17} />
          </button>
          <div className="buying-power">
            <Wallet size={14} />
            <strong>
              {account
                ? money(account.cash - (account.reserved_cash ?? 0))
                : "—"}
            </strong>{" "}
            available buying power
          </div>
        </>
      )}
      <div className="ticket-disclaimer">
        <ShieldCheck size={14} />
        <span>Practice only. No real money involved.</span>
      </div>
    </section>
  );
}

function OrderBook() {
  const { market } = useAppSelector((s) => s.trading);
  const [expanded, setExpanded] = useState(false);
  if (!market) return null;
  const book = market.book;
  const max = Math.max(
    ...book.bids.map((l) => l.quantity),
    ...book.asks.map((l) => l.quantity),
  );
  return (
    <section className="card book-card">
      <div className="section-heading">
        <h2>Order book</h2>
        <span className="small-muted">Simulated depth</span>
      </div>
      <div className="book-labels">
        <span>Bid (USD)</span>
        <span>Shares</span>
        <span>Ask (USD)</span>
        <span>Shares</span>
      </div>
      {book.bids.slice(0, expanded ? 8 : 4).map((b, i) => {
        const a = book.asks[i];
        return (
          <div className="book-row" key={i}>
            <span
              className="bid-depth"
              style={{ width: `${(b.quantity / max) * 48}%` }}
            />
            <strong className="positive">{money(b.price).slice(1)}</strong>
            <span>{b.quantity}</span>
            <strong className="negative">{money(a.price).slice(1)}</strong>
            <span>{a.quantity}</span>
            <span
              className="ask-depth"
              style={{ width: `${(a.quantity / max) * 48}%` }}
            />
          </div>
        );
      })}
      <button className="book-footer" onClick={() => setExpanded(!expanded)}>
        <span>
          Spread{" "}
          <strong>{money(book.asks[0].price - book.bids[0].price)}</strong>
        </span>
        <span>
          {expanded ? "Less depth" : "Full depth"} <ChevronDown size={12} />
        </span>
      </button>
    </section>
  );
}

function Watchlist() {
  const dispatch = useAppDispatch();
  const { market, watchlist, symbol } = useAppSelector((s) => s.trading);
  const [all, setAll] = useState(false);
  return (
    <section className="card watchlist-card">
      <div className="section-heading">
        <h2>
          {all ? "Explore stocks" : "Your watchlist"}{" "}
          <span className="count-pill">
            {all ? market?.assets.length : watchlist.length}
          </span>
        </h2>
        <button className="text-button" onClick={() => setAll(!all)}>
          {all ? "My watchlist" : "Explore all"}{" "}
          {all ? <Star size={14} /> : <Plus size={15} />}
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Price</th>
              <th>Today</th>
              <th className="trend-column">Price trend</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {market?.assets
              .filter((a) => all || watchlist.includes(a.symbol))
              .map((a) => (
                <tr
                  key={a.symbol}
                  className={symbol === a.symbol ? "selected" : ""}
                >
                  <td>
                    <button
                      className="company-cell"
                      onClick={() => dispatch(selectSymbol(a.symbol))}
                    >
                      <AssetMark symbol={a.symbol} small />
                      <span>
                        <strong>{a.symbol}</strong>
                        <small>{a.name}</small>
                      </span>
                    </button>
                  </td>
                  <td className="number">{money(a.price)}</td>
                  <td>
                    <span
                      className={`change-pill ${change(a) >= 0 ? "positive" : "negative"}`}
                    >
                      {percent(change(a))}
                    </span>
                  </td>
                  <td className="trend-column">
                    <Sparkline asset={a} />
                  </td>
                  <td>
                    <button
                      aria-label={`Trade ${a.symbol}`}
                      className="icon-button"
                      onClick={() => dispatch(selectSymbol(a.symbol))}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!watchlist.length && !all && (
        <div className="empty-state">
          Your watchlist is clear. Explore stocks to add your favorites.
        </div>
      )}
    </section>
  );
}

function AccountSummary() {
  const { account, market } = useAppSelector((s) => s.trading);
  const dispatch = useAppDispatch();
  if (!account || !market) return null;
  const value = portfolioValue(account, market.assets);
  return (
    <div className="account-summary">
      <div>
        <span className="summary-icon">
          <Wallet size={20} />
        </span>
        <div>
          <span>Your portfolio</span>
          <strong>{money(value)}</strong>
        </div>
      </div>
      <span className={value >= 10000000 ? "positive" : "negative"}>
        {percent(((value - 10000000) / 10000000) * 100)}{" "}
        <small>total return</small>
      </span>
      <button
        className="icon-button"
        aria-label="View portfolio"
        onClick={() => dispatch(setView("portfolio"))}
      >
        <ArrowUpRight size={19} />
      </button>
    </div>
  );
}

function Portfolio() {
  const { account, market } = useAppSelector((s) => s.trading);
  const dispatch = useAppDispatch();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);
  if (!account || !market) return <ServiceLoading />;
  const value = portfolioValue(account, market.assets),
    invested = value - account.cash,
    returnValue = value - 10000000;
  async function reset() {
    setResetting(true);
    try {
      await dispatch(resetAccount()).unwrap();
      setResetOpen(false);
    } catch {
      setResetError("Could not reset the account. Please try again.");
    } finally {
      setResetting(false);
    }
  }
  return (
    <>
      <div className="portfolio-metrics">
        <div className="card metric main-metric">
          <span>Total portfolio value</span>
          <h1>{money(value)}</h1>
          <div className={returnValue >= 0 ? "positive" : "negative"}>
            {money(returnValue)} ({percent((returnValue / 10000000) * 100)}){" "}
            <span>all time</span>
          </div>
        </div>
        <div className="card metric">
          <Wallet size={20} />
          <span>Buying power</span>
          <h2>{money(account.cash - (account.reserved_cash ?? 0))}</h2>
          <small>
            {account.reserved_cash
              ? `${money(account.reserved_cash)} reserved for open orders`
              : "Available for your next move"}
          </small>
        </div>
        <div className="card metric">
          <Layers3 size={20} />
          <span>Invested in stocks</span>
          <h2>{money(invested)}</h2>
          <small>{account.positions.length} positions in your portfolio</small>
        </div>
      </div>
      <PortfolioHistory key={account.id} />
      <section className="card holdings-card">
        <div className="section-heading">
          <h2>Your holdings</h2>
          <span className="small-muted">
            Valued at{" "}
            {market?.source === "alpaca-iex"
              ? "last available IEX"
              : "simulated"}{" "}
            prices
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Shares</th>
                <th>Avg. cost</th>
                <th>Market value</th>
                <th>Total return</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {account.positions.map((p) => {
                const asset = market.assets.find((a) => a.symbol === p.symbol)!;
                const val = asset.price * p.quantity;
                const gain = val - p.cost;
                return (
                  <tr key={p.symbol}>
                    <td>
                      <button
                        className="company-cell"
                        onClick={() => dispatch(selectSymbol(p.symbol))}
                      >
                        <AssetMark symbol={p.symbol} />
                        <span>
                          <strong>{p.symbol}</strong>
                          <small>{asset.name}</small>
                        </span>
                      </button>
                    </td>
                    <td>{p.quantity}</td>
                    <td>{money(p.cost / p.quantity)}</td>
                    <td>{money(val)}</td>
                    <td className={gain >= 0 ? "positive" : "negative"}>
                      {money(gain)}
                      <small className="table-sub">
                        {percent((gain / p.cost) * 100)}
                      </small>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => dispatch(selectSymbol(p.symbol))}
                      >
                        Trade <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!account.positions.length && (
          <div className="empty-state">
            <Wallet />
            <h3>A fresh start.</h3>
            <p>
              Your virtual $100,000 is ready. Make your first trade to build a
              portfolio.
            </p>
            <button
              className="primary"
              onClick={() => dispatch(setView("trade"))}
            >
              Explore the market <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
      <div className="portfolio-bottom">
        <section className="card allocation">
          <h2>Portfolio allocation</h2>
          <div className="allocation-bar">
            <span
              style={{
                width: `${(account.cash / value) * 100}%`,
                background: "#c4ec87",
              }}
            />
            {account.positions.map((p, i) => (
              <span
                key={p.symbol}
                style={{
                  width: `${((p.quantity * market.assets.find((a) => a.symbol === p.symbol)!.price) / value) * 100}%`,
                  background: ["#2d7656", "#659b7b", "#99bba1"][i % 3],
                }}
              />
            ))}
          </div>
          <div className="allocation-legend">
            <span>
              <i style={{ background: "#c4ec87" }} />
              Cash <b>{((account.cash / value) * 100).toFixed(1)}%</b>
            </span>
            {account.positions.map((p, i) => (
              <span key={p.symbol}>
                <i
                  style={{
                    background: ["#2d7656", "#659b7b", "#99bba1"][i % 3],
                  }}
                />
                {p.symbol}
                <b>
                  {(
                    ((p.quantity *
                      market.assets.find((a) => a.symbol === p.symbol)!.price) /
                      value) *
                    100
                  ).toFixed(1)}
                  %
                </b>
              </span>
            ))}
          </div>
        </section>
        <section className="card reset-card">
          <RotateCcw size={20} />
          <h2>Room to try again</h2>
          <p>
            Clear your trades and start fresh with $100,000 in virtual cash.
          </p>
          <button className="text-button" onClick={() => setResetOpen(true)}>
            Reset practice account <ArrowRight size={14} />
          </button>
        </section>
      </div>
      {resetOpen && (
        <Dialog
          titleId="reset-title"
          onClose={() => {
            if (!resetting) setResetOpen(false);
          }}
        >
          <button
            className="modal-close icon-button"
            aria-label="Close reset dialog"
            disabled={resetting}
            onClick={() => setResetOpen(false)}
          >
            <X size={20} />
          </button>
          <RotateCcw size={32} />
          <h2 id="reset-title">Start with a clean slate?</h2>
          <p>
            This clears your simulated positions and order history, then
            restores $100,000 in virtual cash.
          </p>
          {resetError && <p role="alert">{resetError}</p>}
          <button className="primary" disabled={resetting} onClick={reset}>
            {resetting ? "Resetting…" : "Reset practice account"}
          </button>
          <button
            className="text-button full"
            disabled={resetting}
            onClick={() => setResetOpen(false)}
          >
            Keep my portfolio
          </button>
        </Dialog>
      )}
    </>
  );
}

function ExecutionDetails({ order }: { order: Order }) {
  return (
    <div className="execution-details">
      <div className="execution-steps">
        {[
          {
            icon: ShieldCheck,
            title: "Validated",
            detail: "Cash and shares checked",
          },
          {
            icon: Zap,
            title: order.executed
              ? "Matched"
              : orderIsOpen(order)
                ? "Waiting"
                : "Checked",
            detail: order.executed
              ? "Filled at available prices"
              : "No shares filled yet",
          },
          {
            icon: Layers3,
            title: "Recorded",
            detail: order.executed
              ? "Portfolio updated"
              : "Order saved to history",
          },
        ].map(({ icon: Icon, title, detail }, i) => (
          <div key={title}>
            <span>
              <Icon size={17} />
            </span>
            <strong>{title}</strong>
            <small>{detail}</small>
            {i < 2 && <ChevronRight className="step-arrow" size={16} />}
          </div>
        ))}
      </div>
      <div className="execution-meta">
        <span>
          Matching time <strong>{order.result.duration_us} μs</strong>
        </span>
        <span>
          Time in force{" "}
          <strong>
            {order.time_in_force === "gtc"
              ? "Until filled or cancelled"
              : "Immediate or cancel"}
          </strong>
        </span>
        <span>
          Request <strong>{order.id.slice(0, 8)}</strong>
        </span>
      </div>
      {order.result.fills.length ? (
        <table className="fills-table">
          <thead>
            <tr>
              <th>Fill</th>
              <th>Shares</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.result.fills.map((f, i) => (
              <tr key={i}>
                <td>#{i + 1}</td>
                <td>{f.quantity}</td>
                <td>{money(f.price)}</td>
                <td>{money(f.price * f.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="execution-note">
          The limit did not cross available liquidity. No cash or shares changed
          hands.
        </p>
      )}
      <OrderLearning order={order} />
    </div>
  );
}

function ActivityView() {
  const { account } = useAppSelector((s) => s.trading);
  const dispatch = useAppDispatch();
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const combined = [
    ...new Map(
      [...(account?.open_orders ?? []), ...(account?.orders ?? [])].map((o) => [
        o.id,
        o,
      ]),
    ).values(),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const orders = combined.filter(
    (o) =>
      filter === "all" ||
      (filter === "open" ? orderIsOpen(o) : o.side === filter),
  );
  function exportCSV() {
    const rows = [
      [
        "ID",
        "Time",
        "Symbol",
        "Side",
        "Type",
        "Requested",
        "Filled",
        "Total USD",
        "Status",
      ],
      ...(account?.orders ?? []).map((o) => [
        o.id,
        o.created_at,
        o.symbol,
        o.side,
        o.kind,
        o.requested,
        o.executed,
        (o.total / 100).toFixed(2),
        o.status,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "lot-trading-activity.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="card activity-card">
      <div className="section-heading">
        <div className="activity-filters">
          {["all", "buy", "sell", "open"].map((f) => (
            <button
              key={f}
              className={filter === f ? "selected" : ""}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All orders"
                : f === "buy"
                  ? "Buys"
                  : f === "sell"
                    ? "Sells"
                    : "Open orders"}
            </button>
          ))}
        </div>
        <button
          className="text-button"
          onClick={exportCSV}
          disabled={!account?.orders.length}
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>
      {orders.length ? (
        orders.map((order) => (
          <div className="activity-item" key={order.id}>
            <button
              className="activity-row"
              onClick={() =>
                setExpanded(expanded === order.id ? null : order.id)
              }
            >
              <span className={`order-direction ${order.side}`}>
                {order.side === "buy" ? (
                  <ArrowDownLeft size={21} />
                ) : (
                  <ArrowUpRight size={21} />
                )}
              </span>
              <span className="activity-name">
                <strong className="capitalize">
                  {order.side} {order.symbol}
                </strong>
                <small>
                  {new Date(order.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {order.kind} order
                </small>
              </span>
              <span className="activity-shares">
                <strong>
                  {order.executed} / {order.requested} shares
                </strong>
                <small>
                  {order.executed
                    ? `${money(order.total / order.executed)} average`
                    : "No fills"}
                </small>
              </span>
              <span className={`status-pill ${order.status}`}>
                {order.status === "filled" && <Check size={12} />}{" "}
                {order.status}
              </span>
              <strong>{money(order.total)}</strong>
              <ChevronDown
                size={17}
                className={expanded === order.id ? "rotate" : ""}
              />
            </button>
            {expanded === order.id && <ExecutionDetails order={order} />}
          </div>
        ))
      ) : (
        <div className="empty-state">
          <Activity size={32} />
          <h3>Your trades will appear here.</h3>
          <p>
            {filter === "all"
              ? "Your trades and their execution details will appear here."
              : `You have no ${filter} orders yet.`}
          </p>
          <button
            className="primary"
            onClick={() => dispatch(setView("trade"))}
          >
            Place a paper trade <ArrowRight size={15} />
          </button>
        </div>
      )}
      <div className="activity-footnote">
        Your latest 50 orders and all open limits. Export a copy of your latest
        trades whenever you need it.
      </div>
    </section>
  );
}

function ServiceLoading() {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={25} />
      <span>Loading your workspace…</span>
    </div>
  );
}

export default function App({
  replayId,
  initialView,
  replayComparison = false,
}: {
  replayId?: string;
  initialView?: "replay";
  replayComparison?: boolean;
}) {
  const dispatch = useAppDispatch();
  const { symbol, view, market, account, accountError, marketError } =
    useAppSelector((s) => s.trading);
  const [help, setHelp] = useState(false);
  const [privateDialog, setPrivateDialog] = useState(false);
  const [token, setToken] = useState("");
  const [connectError, setConnectError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const settledObservation = useRef("");
  useEffect(() => {
    if (initialView) dispatch(setView(initialView));
  }, [dispatch, initialView]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
  useEffect(() => {
    dispatch(loadAccount());
  }, [dispatch]);
  useEffect(() => {
    if (!account?.id || view === "replay") return;
    dispatch(loadMarket(symbol));
    const timer = setInterval(() => dispatch(loadMarket(symbol)), 15000);
    return () => clearInterval(timer);
  }, [dispatch, symbol, account?.id, view]);
  useEffect(() => {
    if (
      view !== "replay" &&
      account?.id &&
      market?.as_of &&
      account.open_orders?.length
    ) {
      const observation = `${account.id}:${market.as_of}`;
      if (settledObservation.current !== observation) {
        settledObservation.current = observation;
        dispatch(settleOrders(account.id));
      }
    }
  }, [
    dispatch,
    account?.id,
    market?.as_of,
    view,
    account?.open_orders?.length,
  ]);
  const asset = market?.assets.find((a) => a.symbol === symbol);
  const titles = {
    trade: [
      "Your trading ground.",
      "Practice market and limit orders with virtual money.",
    ],
    portfolio: ["Your portfolio.", "Your holdings, cash, and returns."],
    activity: [
      "Your activity.",
      "Review your orders and the shares that filled.",
    ],
    replay: [
      "Practice a market day.",
      "A plan, a decision, and a chance to learn.",
    ],
  };
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Header />
        <main>
          <div className="page-heading" hidden={view === "replay"}>
            <div>
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            <div className="session-info" hidden={view === "replay"}>
              <span>
                <span className="session-dot" />{" "}
                {marketError
                  ? "Feed disconnected"
                  : market
                    ? market.source === "alpaca-iex"
                      ? "Alpaca IEX connected"
                      : "Practice market"
                    : "Connecting…"}
              </span>
              <small>
                {market?.source === "alpaca-iex"
                  ? "Private data · Simulated fills · USD"
                  : "Simulated prices · USD"}
              </small>
              <button
                className="private-access"
                onClick={() => setPrivateDialog(true)}
              >
                Private market data
              </button>
            </div>
          </div>
          {(marketError || accountError) && (
            <div className="service-error" role="alert">
              <AlertCircle size={18} />
              <span>{marketError ?? accountError}</span>
              <button
                onClick={() => {
                  dispatch(loadMarket(symbol));
                  dispatch(loadAccount());
                }}
              >
                Retry <RotateCcw size={13} />
              </button>
            </div>
          )}
          {view === "replay" ? (
            account ? (
              replayComparison ? (
                <ReplayComparison key={account.id} accountId={account.id} />
              ) : (
                <ReplayWorkspace
                  key={account.id}
                  accountId={account.id}
                  sessionId={replayId}
                />
              )
            ) : (
              <ServiceLoading />
            )
          ) : view === "trade" ? (
            <>
              <div className="trading-grid">
                <div className="main-column">
                  {asset && asset.history.length > 0 ? (
                    <PriceChart key={asset.symbol} asset={asset} />
                  ) : (
                    <ServiceLoading />
                  )}
                  <Watchlist />
                  {market?.source === "alpaca-iex" && (
                    <PrivateNews
                      key={`${account?.id}:${symbol}`}
                      symbol={symbol}
                    />
                  )}
                </div>
                <div className="right-column">
                  {asset && <OrderTicket asset={asset} />}
                  <OrderBook />
                  <AccountSummary />
                </div>
              </div>
            </>
          ) : view === "portfolio" ? (
            <Portfolio />
          ) : (
            <ActivityView />
          )}
          <footer>
            <span>
              <span className="footer-logo">lot.</span> Practice trading. At
              your own pace.
            </span>
            <span>
              Virtual money. Simulated trades.
              <button
                className="mobile-private-access"
                onClick={() => setPrivateDialog(true)}
              >
                Private market data
              </button>
              <button onClick={() => setHelp(true)}>
                About Lot <ExternalLink size={11} />
              </button>
            </span>
          </footer>
        </main>
      </div>
      {privateDialog && (
        <Dialog
          titleId="private-title"
          onClose={() => {
            if (!connecting) {
              setPrivateDialog(false);
              setToken("");
            }
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setConnecting(true);
              setConnectError("");
              try {
                await dispatch(connectPrivate(token)).unwrap();
                setToken("");
                setPrivateDialog(false);
                dispatch(setView("trade"));
                if (window.location.pathname.startsWith("/replay"))
                  navigate("/demo");
              } catch (error) {
                setConnectError(
                  error instanceof Error
                    ? error.message
                    : "Private access failed. Check your token.",
                );
              } finally {
                setConnecting(false);
              }
            }}
          >
            <button
              type="button"
              className="modal-close icon-button"
              aria-label="Close private access"
              onClick={() => {
                setPrivateDialog(false);
                setToken("");
              }}
            >
              <X size={20} />
            </button>
            <h2 id="private-title">Your private market feed.</h2>
            <p>
              Access real Alpaca IEX prices with your personal access token.
              Your private practice account starts with $100,000 and keeps its
              own history.
            </p>
            <label className="private-token">
              Private access token
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </label>
            {connectError && <p role="alert">{connectError}</p>}
            <button className="primary" disabled={connecting}>
              {connecting ? "Connecting…" : "Connect private feed"}
            </button>
          </form>
        </Dialog>
      )}
      {help && (
        <Dialog titleId="about-title" onClose={() => setHelp(false)}>
          <button
            className="modal-close icon-button"
            aria-label="Close about dialog"
            onClick={() => setHelp(false)}
          >
            <X size={20} />
          </button>
          <span className="engineering-label">
            <ShieldCheck size={17} /> Paper trading
          </span>
          <h2 id="about-title">Your practice account.</h2>
          <p>
            Lot is a place to practice buying and selling stocks. Use virtual
            cash, try market and limit orders, and track your holdings.
          </p>
          <p>
            Public demo prices are simulated. Private mode uses real Alpaca IEX
            data, which covers one exchange rather than the whole market.
            Liquidity, fills, and funds are always simulated. No real-money
            trades are possible.
          </p>
          <button className="primary" onClick={() => setHelp(false)}>
            Back to exploring <ArrowRight size={16} />
          </button>
        </Dialog>
      )}
    </div>
  );
}
