import {
  createContext,
  useContext,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  MotionConfig,
} from "motion/react";
import * as m from "motion/react-m";
import { ArrowUpRight, Check } from "lucide-react";

const ease = [0.16, 1, 0.3, 1] as const;
const ReducedMotion = createContext(true);
const SetReducedMotion = createContext<((reduced: boolean) => void) | null>(
  null,
);
const motionPreference = "(prefers-reduced-motion: reduce)";
const preferenceKey = "lot-landing-motion";
const readMotionPreference = () => window.matchMedia(motionPreference).matches;
const staticMotionPreference = () => true;

function subscribeToMotionPreference(onChange: () => void) {
  const media = window.matchMedia(motionPreference);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readStoredPreference(): boolean | null {
  try {
    if (typeof window === "undefined") return null;
    const value = window.sessionStorage.getItem(preferenceKey);
    return value === "reduced" ? true : value === "full" ? false : null;
  } catch {
    return null;
  }
}

export function LandingMotion({ children }: { children: ReactNode }) {
  const deviceReduced = useSyncExternalStore(
    subscribeToMotionPreference,
    readMotionPreference,
    staticMotionPreference,
  );
  const [preference, setPreference] = useState(readStoredPreference);
  const reduced = preference ?? deviceReduced;
  function chooseMotion(reduce: boolean) {
    setPreference(reduce);
    try {
      window.sessionStorage.setItem(preferenceKey, reduce ? "reduced" : "full");
    } catch {
      // The page control still works when the browser blocks preference storage.
    }
  }
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={reduced ? "always" : "never"}>
        <ReducedMotion.Provider value={reduced}>
          <SetReducedMotion.Provider value={chooseMotion}>
            <div className="landing">{children}</div>
          </SetReducedMotion.Provider>
        </ReducedMotion.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}

export function LandingMotionControl() {
  const reduced = useContext(ReducedMotion);
  const chooseMotion = useContext(SetReducedMotion);
  return (
    <button
      type="button"
      className="landing-motion-control"
      aria-label="Page animations"
      aria-pressed={!reduced}
      onClick={() => chooseMotion?.(!reduced)}
    >
      <span className={reduced ? "" : "enabled"} aria-hidden="true" />
      Animations {reduced ? "off" : "on"}
    </button>
  );
}

export function HeroCopy({ children }: { children: ReactNode }) {
  const reduced = useContext(ReducedMotion);
  return (
    <m.div
      className="hero-copy"
      initial={reduced ? false : "hidden"}
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: reduced ? 0 : 0.085 } },
      }}
    >
      {children}
    </m.div>
  );
}

export function HeroTitle() {
  const reduced = useContext(ReducedMotion);
  return (
    <h1 aria-label="Good investing starts with practice.">
      {["Good investing", "starts with", "practice."].map((line) => (
        <span className="hero-line" aria-hidden="true" key={line}>
          <m.span
            variants={{
              hidden: { y: "105%", opacity: 0 },
              visible: {
                y: 0,
                opacity: 1,
                transition: { duration: reduced ? 0 : 0.8, ease },
              },
            }}
          >
            {line}
          </m.span>
        </span>
      ))}
    </h1>
  );
}

export function HeroWorkspace({
  children,
  symbol,
}: {
  children: ReactNode;
  symbol: string;
}) {
  const reduced = useContext(ReducedMotion);
  return (
    <m.div
      className="hero-stage"
      initial={
        reduced ? false : { opacity: 0, y: 28, scale: 0.97, rotate: -1.5 }
      }
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{
        duration: reduced ? 0 : 1,
        delay: reduced ? 0 : 0.15,
        ease,
      }}
    >
      {children}
      <m.div
        className="hero-order-note"
        aria-hidden="true"
        initial={reduced ? false : { opacity: 0, x: 26, y: 28, rotate: 6 }}
        animate={{ opacity: 1, x: 0, y: 0, rotate: -5 }}
        transition={{
          duration: reduced ? 0 : 0.9,
          delay: reduced ? 0 : 0.5,
          ease,
        }}
      >
        <span className="hero-order-icon">
          <Check size={17} />
        </span>
        <div>
          <span>Practice your next move</span>
          <strong>
            Buy 2 {symbol} <ArrowUpRight size={16} />
          </strong>
          <small>Illustrative order · Virtual funds</small>
        </div>
      </m.div>
    </m.div>
  );
}

export function PreviewTabs({
  symbols,
  selected,
  onSelect,
}: {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
}) {
  const reduced = useContext(ReducedMotion);
  return (
    <div className="preview-tabs" role="group" aria-label="Preview stock">
      <m.span
        className="preview-tab-highlight"
        aria-hidden="true"
        initial={false}
        style={{ width: `${100 / symbols.length}%` }}
        animate={{ x: `${Math.max(0, symbols.indexOf(selected)) * 100}%` }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 430, damping: 36 }
        }
      />
      {symbols.map((symbol) => (
        <button
          type="button"
          key={symbol}
          aria-pressed={selected === symbol}
          className={selected === symbol ? "selected" : ""}
          onClick={() => onSelect(symbol)}
        >
          <span className="preview-tab-label">{symbol}</span>
        </button>
      ))}
    </div>
  );
}

export function PreviewContent({
  symbol,
  children,
}: {
  symbol: string;
  children: ReactNode;
}) {
  const reduced = useContext(ReducedMotion);
  return (
    <AnimatePresence initial={false} mode="wait">
      <m.div
        key={symbol}
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -4 }}
        transition={{ duration: reduced ? 0 : 0.17, ease }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

export function ReplayIllustration() {
  const reduced = useContext(ReducedMotion);
  return (
    <m.svg
      viewBox="0 0 480 160"
      role="img"
      aria-label="An illustrative price line stops at the current moment, with the future hidden"
      initial={reduced ? "visible" : "hidden"}
      animate={reduced ? "visible" : undefined}
      whileInView="visible"
      viewport={{ once: true, amount: 0.6 }}
    >
      <m.path
        d="M0 120 L25 115 L48 124 L75 90 L95 98 L121 80 L147 85 L174 47 L196 62 L221 33 L248 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
        transition={{ duration: reduced ? 0 : 1, ease }}
      />
      <m.circle
        cx="248"
        cy="40"
        r="5"
        fill="currentColor"
        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
        transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.8 }}
      />
      <path
        d="M248 0 V160"
        stroke="currentColor"
        strokeDasharray="3 5"
        opacity=".4"
      />
    </m.svg>
  );
}

export function LandingQuestion({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduced = useContext(ReducedMotion);
  return (
    <div className="landing-question">
      <button
        type="button"
        className="faq-question"
        id={`${id}-question`}
        aria-expanded={open}
        aria-controls={`${id}-answer`}
        onClick={() => setOpen(!open)}
      >
        {question}
        <m.span
          aria-hidden="true"
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: reduced ? 0 : 0.2, ease }}
        >
          +
        </m.span>
      </button>
      <m.div
        id={`${id}-answer`}
        role="region"
        aria-labelledby={`${id}-question`}
        aria-hidden={!open}
        inert={!open}
        className="faq-answer"
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.28, ease }}
      >
        {children}
      </m.div>
    </div>
  );
}
