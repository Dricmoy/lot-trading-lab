import { useEffect, useRef, useState } from "react";
import type { AnchorHTMLAttributes, FormEvent } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  Menu,
  Play,
  X,
} from "lucide-react";
import App from "./App";
import { api } from "./lib";
import { navigate } from "./navigation";
import {
  clearSession,
  setSession,
  useAppDispatch,
  useAppSelector,
} from "./store";
import type { Account, User } from "./types";
import { SharedReplay } from "./Replay";

type Session = { user: User | null; account: Account | null };
type AuthMode = "signup" | "login" | "forgot-password" | "reset-password";

function Link({
  href = "/",
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          href.startsWith("/") &&
          !props.target
        ) {
          event.preventDefault();
          navigate(href);
        }
      }}
    />
  );
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <Link className={`wordmark ${light ? "light" : ""}`} aria-label="Lot home">
      lot<span>.</span>
    </Link>
  );
}

function Landing() {
  const user = useAppSelector((s) => s.trading.user);
  const [menu, setMenu] = useState(false);
  const [stock, setStock] = useState("AAPL");
  const video = useRef<HTMLVideoElement>(null);
  const [videoStarted, setVideoStarted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const samples: Record<
    string,
    { name: string; price: string; gain: string; values: number[] }
  > = {
    AAPL: {
      name: "Apple",
      price: "179.28",
      gain: "+1.48%",
      values: [
        172, 172.8, 172.3, 174, 173.8, 175, 174.6, 176.9, 176.5, 177.6, 178.1,
        177.7, 179.4, 179.28,
      ],
    },
    NVDA: {
      name: "NVIDIA",
      price: "182.40",
      gain: "+2.13%",
      values: [
        174, 177, 175, 176, 178.8, 177.3, 180.2, 181, 179, 181.6, 180.3, 182.4,
      ],
    },
    MSFT: {
      name: "Microsoft",
      price: "517.64",
      gain: "+0.92%",
      values: [
        510, 511.8, 511, 514, 512, 515, 514.2, 514.9, 513.9, 516.1, 515.3,
        517.64,
      ],
    },
  };
  const sample = samples[stock];
  const start = user ? "/app" : "/demo";
  return (
    <div className="landing">
      <header className="site-nav">
        <Wordmark />
        <nav className={menu ? "open" : ""} aria-label="Website navigation">
          <Link href="/replay" onClick={() => setMenu(false)}>
            Lot Replay
          </Link>
          <a href="#practice" onClick={() => setMenu(false)}>
            The workspace
          </a>
          <a href="#how-it-works" onClick={() => setMenu(false)}>
            How it works
          </a>
          <a href="#questions" onClick={() => setMenu(false)}>
            Questions
          </a>
        </nav>
        <div className="site-nav-actions">
          <Link href={user ? "/app" : "/login"} className="nav-signin">
            {user ? "My account" : "Log in"}
          </Link>
          <Link href={start} className="button button-dark">
            {user ? "My workspace" : "Try the demo"}
          </Link>
          <button
            className="mobile-menu"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <div className="hero-copy">
            <h1>Good investing starts with practice.</h1>
            <p>
              Try your ideas with $100,000 in virtual cash. Buy and sell stocks,
              build a portfolio, and get comfortable with every decision.
            </p>
            <div className="hero-actions">
              <Link href={start} className="button button-dark">
                {user ? "Open your workspace" : "Try the demo"}
                <ArrowUpRight size={19} />
              </Link>
              <a href="#watch-demo" className="button button-quiet">
                Watch it in action
                <ArrowRight size={17} />
              </a>
            </div>
            <span className="hero-fineprint">
              No signup. No deposits. Virtual money only.
            </span>
          </div>
          <div
            className="hero-workspace"
            aria-label="Interactive preview with illustrative prices"
          >
            <div className="preview-top">
              <span>Practice account</span>
              <span className="preview-balance">
                $100,000.00 <small>Buying power</small>
              </span>
            </div>
            <div
              className="preview-tabs"
              role="group"
              aria-label="Preview stock"
            >
              {Object.keys(samples).map((symbol) => (
                <button
                  key={symbol}
                  aria-pressed={stock === symbol}
                  className={stock === symbol ? "selected" : ""}
                  onClick={() => setStock(symbol)}
                >
                  {symbol}
                </button>
              ))}
            </div>
            <div className="preview-quote">
              <span>{sample.name}</span>
              <strong>${sample.price}</strong>
              <span className="positive">
                {sample.gain}
                <small>Illustrative daily change</small>
              </span>
            </div>
            <div className="preview-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={sample.values.map((price) => ({ price }))}
                  margin={{ top: 20, right: 0, bottom: 10, left: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="#dfe5d9" />
                  <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#215a3d"
                    strokeWidth={2.5}
                    fill="#e8f0db"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="preview-bottom">
              <span>
                Illustrative prices <small>Virtual money only</small>
              </span>
              <Link href="/demo" className="button button-green">
                Try a trade
                <ArrowUpRight size={17} />
              </Link>
            </div>
          </div>
        </section>
        <section
          className="walkthrough-section"
          id="watch-demo"
          aria-labelledby="walkthrough-title"
        >
          <div className="walkthrough-heading">
            <div>
              <span className="section-kicker">A look inside Lot</span>
              <h2 id="walkthrough-title">
                Your first trade,
                <br />
                from start to finish.
              </h2>
            </div>
            <div className="walkthrough-copy">
              <p>
                Pick a stock. Review your order. See your holdings change. Watch
                a recorded walkthrough, then try it yourself.
              </p>
              <Link href={start} className="inline-link">
                {user ? "Open your workspace" : "Try the demo — no signup"}
                <ArrowUpRight size={18} />
              </Link>
            </div>
          </div>
          <figure className="walkthrough-player">
            <div className="walkthrough-video">
              <video
                ref={video}
                onPlay={() => {
                  setVideoStarted(true);
                  setVideoError(false);
                }}
                onError={() => setVideoError(true)}
                controls
                playsInline
                preload="none"
                poster="/demo/lot-walkthrough-polished.jpg"
                aria-label="Lot trading walkthrough"
                aria-describedby="walkthrough-caption"
                width="1920"
                height="1080"
              >
                <source
                  src="/demo/lot-walkthrough-polished.mp4"
                  type="video/mp4"
                />
                <track
                  kind="captions"
                  src="/demo/lot-walkthrough-polished.vtt"
                  srcLang="en"
                  label="English"
                  default
                />
                Your browser doesn't support video.{" "}
                <a href="/demo/lot-walkthrough-polished.mp4">
                  Download the walkthrough
                </a>
                .
              </video>
              {!videoStarted && !videoError && (
                <button
                  className="walkthrough-play"
                  aria-label="Play product walkthrough"
                  onClick={() => {
                    void video.current?.play().catch(() => setVideoError(true));
                  }}
                >
                  <Play size={25} fill="currentColor" />
                  <span>
                    Watch the walkthrough<small>48 seconds · No audio</small>
                  </span>
                </button>
              )}
            </div>
            {videoError && (
              <p className="inline-error" role="alert">
                The video couldn't load.{" "}
                <a href="/demo/lot-walkthrough-polished.mp4">
                  Open the video directly
                </a>
                , or read the walkthrough below.
              </p>
            )}
            <figcaption id="walkthrough-caption">
              Recorded in Lot. Simulated prices and virtual funds. No audio.
            </figcaption>
          </figure>
          <details className="walkthrough-transcript">
            <summary>Read the walkthrough</summary>
            <ol>
              <li>
                Choose Try the demo to open a practice workspace without signing
                up. The demo includes a sample portfolio.
              </li>
              <li>
                Search for Apple, enter two shares, and select Review buy.
                Confirm the order after checking the estimated cost.
              </li>
              <li>
                Open Portfolio to see your cash and shares update from the
                completed trade.
              </li>
              <li>
                Return to Trading, choose Sell, and sell one share. Review and
                confirm the order.
              </li>
              <li>
                Open Activity to see both completed trades and their actual fill
                prices. Create an account whenever you want to save your
                progress across browsers.
              </li>
            </ol>
          </details>
        </section>
        <section
          className="landing-replay"
          aria-labelledby="landing-replay-title"
        >
          <div>
            <span className="section-kicker">A day to learn from</span>
            <h2 id="landing-replay-title">
              Make the call.
              <br />
              Then see what follows.
            </h2>
            <p>
              A steady climb. A sudden selloff. A volatile opening. Practice a
              market day as it unfolds, write down your plan, and look back at
              the result.
            </p>
            <Link href="/replay" className="button button-dark">
              Try Lot Replay <ArrowUpRight size={18} />
            </Link>
            <small>
              No signup. A fresh $100,000 balance for every session.
            </small>
          </div>
          <div
            className="landing-replay-preview"
            aria-label="Illustration of progressive replay"
          >
            <span>LOTX · Fictional market session</span>
            <div className="landing-replay-line">
              <svg
                viewBox="0 0 480 160"
                role="img"
                aria-label="An illustrative price line stops at the current moment, with the future hidden"
              >
                <path
                  d="M0 120 L25 115 L48 124 L75 90 L95 98 L121 80 L147 85 L174 47 L196 62 L221 33 L248 40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <circle cx="248" cy="40" r="5" fill="currentColor" />
                <path
                  d="M248 0 V160"
                  stroke="currentColor"
                  strokeDasharray="3 5"
                  opacity=".4"
                />
              </svg>
              <span>The rest is still ahead.</span>
            </div>
            <div className="landing-replay-steps">
              <span>
                01 <strong>Your plan</strong>
              </span>
              <span>
                02 <strong>Your decision</strong>
              </span>
              <span>
                03 <strong>Your recap</strong>
              </span>
            </div>
            <p>
              Reveal a moment. Place a practice trade. Compare your decisions
              with simply holding.
            </p>
          </div>
        </section>
        <section className="landing-intro" id="practice">
          <div className="intro-heading">
            <span className="section-kicker">Your practice, your pace</span>
            <h2>
              Room to find
              <br />
              your own approach.
            </h2>
          </div>
          <div className="intro-copy">
            <p>
              That stock you've been watching. That limit price you've been
              wondering about. Give your ideas somewhere to go.
            </p>
            <p>
              Lot gives you the tools to follow stocks, place orders, and see
              where your decisions take you. Your money stays right where it is.
            </p>
            <Link href="/demo" className="inline-link">
              Explore the workspace
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
        <section className="practice-features">
          <article>
            <span className="feature-symbol">$100,000</span>
            <h3>A proper place to start</h3>
            <p>
              Begin with virtual cash. Choose what to buy, how much to spend,
              and when to sell.
            </p>
          </article>
          <article>
            <span className="feature-symbol">Buy. Sell. Repeat.</span>
            <h3>Make the call yourself</h3>
            <p>
              Use market and limit orders. Review the details before you trade,
              then see exactly what filled.
            </p>
          </article>
          <article>
            <span className="feature-symbol">All in view.</span>
            <h3>See the whole picture</h3>
            <p>
              Your cash, holdings, and trade history stay together. Come back to
              your account, or reset it and try another approach.
            </p>
          </article>
        </section>
        <section className="how-section" id="how-it-works">
          <h2>
            Start small.
            <br />
            Learn by doing.
          </h2>
          <div className="how-steps">
            <article>
              <span>1</span>
              <div>
                <h3>Jump straight in</h3>
                <p>
                  Try the demo without signing up. It comes with a sample
                  portfolio so you can buy, sell, and explore right away. Create
                  an account when you want to keep your progress across
                  browsers.
                </p>
              </div>
            </article>
            <article>
              <span>2</span>
              <div>
                <h3>Find your first stock</h3>
                <p>
                  Explore eight companies, check their practice prices, and save
                  the ones you want to follow.
                </p>
              </div>
            </article>
            <article>
              <span>3</span>
              <div>
                <h3>Place a trade</h3>
                <p>
                  Choose your shares and order type. Review, confirm, and follow
                  the result in your portfolio.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section className="faq-section" id="questions">
          <h2>
            A few things
            <br />
            to know.
          </h2>
          <div className="faq-list">
            <details>
              <summary>
                Do I need an account to try it?<span>+</span>
              </summary>
              <p>
                No. Choose Try the demo to open the full workspace with a sample
                portfolio. Your demo stays in this browser. Sign up later to
                save it to an account and return from another device.
              </p>
            </details>
            <details>
              <summary>
                Am I investing real money?<span>+</span>
              </summary>
              <p>
                No. Your cash, stock prices, and trades in the public workspace
                are simulated. You won't connect a bank account or make a
                deposit.
              </p>
            </details>
            <details>
              <summary>
                Are the prices live?<span>+</span>
              </summary>
              <p>
                The public workspace uses fictional prices and simulated
                liquidity. It lets you practice the mechanics of placing orders,
                rather than measure performance against today's market.
              </p>
            </details>
            <details>
              <summary>
                Can I keep my portfolio?<span>+</span>
              </summary>
              <p>
                Yes. Create an account to save your holdings and history, then
                sign in from another browser. If you start as a guest, signing
                up saves that practice account.
              </p>
            </details>
            <details>
              <summary>
                How do limit orders work here?<span>+</span>
              </summary>
              <p>
                Your limit sets the most you'll pay to buy or the least you'll
                accept to sell. Keep the unfilled shares open and Lot checks
                them as you use the workspace, or choose Cancel immediately. You
                can cancel an open remainder to release its reserved cash or
                shares. Replay limits expire when the session ends.
              </p>
            </details>
            <details>
              <summary>
                Can I start over?<span>+</span>
              </summary>
              <p>
                Go to Portfolio and choose Reset practice account. It clears
                your holdings and trades and restores $100,000 in virtual cash.
              </p>
            </details>
          </div>
        </section>
        <section className="landing-final">
          <h2>
            Your next idea
            <br />
            has a place to start.
          </h2>
          <Link href={start} className="button button-light">
            {user ? "My workspace" : "Try the demo"}
            <ArrowUpRight size={21} />
          </Link>
        </section>
      </main>
      <footer className="site-footer">
        <div>
          <Wordmark />
          <p>Practice trading. At your own pace.</p>
        </div>
        <div className="site-footer-links">
          <Link href="/about">About Lot</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/login">Log in</Link>
        </div>
        <p className="site-disclosure">
          Lot is a paper-trading simulator. Virtual funds, simulated prices and
          executions. No real-money investing or investment advice.
        </p>
        <span>© {new Date().getFullYear()} Lot</span>
      </footer>
    </div>
  );
}

function PasswordField({
  label = "Password",
  name = "password",
  value,
  onChange,
  fresh = false,
}: {
  label?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  fresh?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      {label}
      <span className="password-wrap">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={fresh ? "new-password" : "current-password"}
          minLength={fresh ? 10 : undefined}
          maxLength={256}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
    </label>
  );
}

function AuthPage({ mode }: { mode: AuthMode }) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const signup = mode === "signup",
    forgot = mode === "forgot-password",
    reset = mode === "reset-password";
  const title = signup
    ? "Your practice starts here."
    : forgot
      ? "Forgot your password?"
      : reset
        ? "Choose a new password."
        : "Welcome back.";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (reset && password !== confirmation) {
      setError("Your passwords don't match.");
      return;
    }
    setPending(true);
    try {
      if (forgot || reset) {
        const search = new URLSearchParams(window.location.search);
        const result = await api<{ message: string }>(
          `/api/auth/${forgot ? "forgot" : "reset"}`,
          {
            method: "POST",
            body: JSON.stringify(
              forgot
                ? { email }
                : {
                    password,
                    uid: search.get("uid"),
                    token: search.get("token"),
                  },
            ),
          },
        );
        if (reset) dispatch(clearSession());
        setSuccess(result.message);
        setPassword("");
        setConfirmation("");
      } else {
        const result = await api<Session>(
          `/api/auth/${signup ? "signup" : "login"}`,
          {
            method: "POST",
            body: JSON.stringify({ name, email, password, remember }),
          },
        );
        dispatch(setSession(result));
        setPassword("");
        navigate("/app");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't connect. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Wordmark light />
        <div>
          <span>Paper trading, properly.</span>
          <h2>
            A little room
            <br />
            to try things.
          </h2>
          <p>
            Your ideas. Your decisions.
            <br />
            $100,000 in virtual cash to work with.
          </p>
        </div>
        <span className="auth-story-foot">
          No deposits. No bank connection.
        </span>
      </div>
      <main className="auth-main">
        <div className="auth-top">
          <Wordmark />
          <Link href="/">
            Back to Lot
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="auth-form-wrap">
          <h1>{title}</h1>
          <p>
            {signup
              ? "Create a free account. Your portfolio will be here whenever you come back."
              : forgot
                ? "Enter the email you used for Lot. We'll send you a link to choose a new password."
                : reset
                  ? "Use at least 10 characters. A longer, unique password is best."
                  : "Log in to pick up where you left off."}
          </p>
          {success ? (
            <div className="auth-success" role="status">
              <Check size={28} />
              <p>{success}</p>
              <Link href="/login" className="button button-dark">
                Back to log in
              </Link>
              {forgot && (
                <button className="text-button" onClick={() => setSuccess("")}>
                  Use a different email
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={submit}>
              {signup && (
                <label className="auth-field">
                  Your name
                  <input
                    name="name"
                    autoComplete="given-name"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              {!reset && (
                <label className="auth-field">
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={150}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {!forgot && (
                <PasswordField
                  fresh={signup || reset}
                  value={password}
                  onChange={setPassword}
                />
              )}
              {reset && (
                <PasswordField
                  fresh
                  label="Confirm password"
                  name="confirm_password"
                  value={confirmation}
                  onChange={setConfirmation}
                />
              )}
              {signup && (
                <span className="auth-hint">
                  At least 10 characters. Use a password you don't use
                  elsewhere.
                </span>
              )}
              {mode === "login" && (
                <div className="auth-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    Keep me logged in
                  </label>
                  <Link href="/forgot-password">Forgot password?</Link>
                </div>
              )}
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button button-dark auth-submit"
                disabled={pending}
              >
                {pending ? (
                  <>
                    <LoaderCircle className="spin" size={18} />
                    Please wait…
                  </>
                ) : signup ? (
                  "Create account"
                ) : forgot ? (
                  "Send reset link"
                ) : reset ? (
                  "Save new password"
                ) : (
                  "Log in"
                )}
              </button>
            </form>
          )}
          {(signup || mode === "login") && (
            <p className="auth-switch">
              {signup ? "Already have an account?" : "New to Lot?"}{" "}
              <Link href={signup ? "/login" : "/signup"}>
                {signup ? "Log in" : "Create an account"}
              </Link>
            </p>
          )}
          {(signup || mode === "login") && (
            <p className="auth-demo-link">
              <Link href="/demo">
                Skip signup — try the demo <ArrowUpRight size={16} />
              </Link>
            </p>
          )}
          <p className="auth-disclosure">
            Virtual money. Simulated prices. No real-money trades.
          </p>
        </div>
      </main>
    </div>
  );
}

function Information({ privacy }: { privacy: boolean }) {
  return (
    <div className="information-page">
      <header>
        <Wordmark />
        <Link href="/">Back to Lot</Link>
      </header>
      <main>
        <h1>{privacy ? "Your account, explained." : "A place to practice."}</h1>
        {privacy ? (
          <>
            <h2>What Lot stores</h2>
            <p>
              When you register, Lot stores your name, email address, a securely
              hashed password, and your practice portfolio. Your holdings,
              orders, cash balance, and watchlist are associated with your
              account so you can return to them. Lot also stores hashed
              identifiers and attempt counts to help prevent repeated sign-in
              and recovery requests.
            </p>
            <h2>Cookies and sessions</h2>
            <p>
              Lot uses essential cookies to keep you logged in and protect
              forms. Guest practice uses a cookie to restore the same browser's
              account. Signing out ends your session. Registered portfolios stay
              saved until you reset them.
            </p>
            <h2>Replay and sharing</h2>
            <p>
              Your replay sessions, reasons, reflections, and observed portfolio
              values are saved with your workspace. Recaps remain private until
              you create a sharing link. Journal notes are excluded unless you
              choose to include them. Anyone with the link can view the shared
              recap; revoking the link stops further access.
            </p>
            <p>
              Resetting the regular portfolio preserves replay sessions and
              earlier valuation records. Anonymous activity totals count
              workspaces, including verification sessions, rather than people.
              Operational logs record request status and timing without journal
              text, credentials, or account identifiers.
            </p>
            <h2>Your practice data</h2>
            <p>
              You can export your recent orders from Activity and clear your
              portfolio with Reset practice account. Lot does not ask for bank
              details or accept deposits.
            </p>
          </>
        ) : (
          <>
            <p>
              Lot lets you try stock trading with virtual money. Place market
              and limit orders, see the fills, and track your holdings and cash
              in one workspace.
            </p>
            <h2>What you're practicing</h2>
            <p>
              The mechanics of an order: choosing a stock, sizing a position,
              setting a limit, and understanding how cash and holdings change
              when shares trade.
            </p>
            <h2>What the numbers mean</h2>
            <p>
              Public prices and available liquidity are simulated. Market orders
              cancel unfilled shares immediately; limit remainders can stay open
              with reserved funds or shares. Replay reveals fictional prices and
              dispatches as its clock advances. Returns describe the practice
              scenario and do not represent performance in the real market. Lot
              provides no investment advice.
            </p>
          </>
        )}
        <Link href="/signup" className="button button-dark">
          Open a practice account
        </Link>
      </main>
    </div>
  );
}

export default function Site() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.trading.user);
  const [path, setPath] = useState(window.location.pathname);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const listener = () => setPath(window.location.pathname);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    setError("");
    api<Session>("/api/auth/session", { signal: controller.signal })
      .then((result) => {
        dispatch(setSession(result));
        setReady(true);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Couldn't connect.");
          setReady(true);
        }
      });
    return () => controller.abort();
  }, [dispatch, retry]);
  useEffect(() => {
    document.title =
      path === "/"
        ? "Lot — Practice trading. At your own pace."
        : path === "/app" || path === "/demo" || path.startsWith("/replay")
          ? "Your workspace — Lot"
          : path.startsWith("/s/")
            ? "Shared replay recap — Lot"
            : "Your account — Lot";
    if (!ready || error) return;
    if (user && ["/signup", "/login"].includes(path)) navigate("/app");
    if (
      path === "/app" &&
      !user &&
      new URLSearchParams(window.location.search).get("guest") !== "1"
    )
      navigate("/login");
  }, [path, user, ready, error]);
  if (!ready && path !== "/")
    return (
      <div className="site-loading" role="status">
        <LoaderCircle className="spin" />
        <span>Opening Lot…</span>
      </div>
    );
  if (error && path !== "/")
    return (
      <div className="site-loading">
        <h1>Couldn't open your account.</h1>
        <p>{error}</p>
        <button
          className="button button-dark"
          onClick={() => setRetry(retry + 1)}
        >
          Try again
        </button>
        <Link href="/">Back to Lot</Link>
      </div>
    );
  if (/^\/s\/[0-9a-f-]{36}$/.test(path))
    return <SharedReplay token={path.slice(3)} />;
  if (path === "/replay" || /^\/replay\/[0-9a-f-]{36}$/.test(path))
    return (
      <App
        initialView="replay"
        replayId={path === "/replay" ? undefined : path.slice(8)}
      />
    );
  if (path === "/app" || path === "/demo")
    return user ||
      path === "/demo" ||
      new URLSearchParams(window.location.search).get("guest") === "1" ? (
      <App />
    ) : (
      <div className="site-loading" role="status">
        Opening sign in…
      </div>
    );
  if (
    ["/signup", "/login", "/forgot-password", "/reset-password"].includes(path)
  )
    return <AuthPage key={path} mode={path.slice(1) as AuthMode} />;
  if (path === "/about" || path === "/privacy")
    return <Information privacy={path === "/privacy"} />;
  if (path !== "/")
    return (
      <div className="site-loading">
        <h1>We couldn't find that page.</h1>
        <Link href="/" className="button button-dark">
          Go to Lot
        </Link>
      </div>
    );
  return (
    <>
      <Landing />
      {error && (
        <div className="connection-banner" role="alert">
          Account services are unavailable.
          <button onClick={() => setRetry(retry + 1)}>Retry</button>
        </div>
      )}
    </>
  );
}
