import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSession,
  connectPrivate,
  loadAccount,
  loadMarket,
  resetAccount,
  saveWatchlist,
  setSession,
  store,
  submitOrder,
} from "./store";
import type { Account, Market, Order, OrderInput } from "./types";

const account: Account = {
  id: "previous-account",
  cash: 10000000,
  positions: [],
  orders: [],
  watchlist: ["AAPL"],
};
const market: Market = {
  assets: [],
  book: { bids: [], asks: [] },
  as_of: "2026-10-05T12:00:00Z",
  source: "simulated",
  engine: "Go",
};
const input: OrderInput = {
  symbol: "AAPL",
  side: "buy",
  kind: "market",
  quantity: 1,
  limit: 0,
};
const order: Order = {
  id: "order",
  symbol: "AAPL",
  side: "buy",
  kind: "market",
  requested: 1,
  executed: 1,
  total: 20000,
  status: "filled",
  created_at: "2026-10-05T12:00:00Z",
  result: {
    fills: [{ price: 20000, quantity: 1 }],
    quantity: 1,
    total: 20000,
    status: "filled",
    duration_us: 1,
    algorithm: "heap",
    book: market.book,
  },
};

describe("Account changes invalidate earlier responses", () => {
  beforeEach(() => store.dispatch(clearSession()));

  it("ignores a previous account arriving after logout", () => {
    store.dispatch(loadAccount.pending("old", undefined));
    store.dispatch(clearSession());
    store.dispatch(loadAccount.fulfilled(account, "old", undefined));
    expect(store.getState().trading.account).toBeNull();
    expect(store.getState().trading.accountLoading).toBe(false);
  });

  it("ignores a completed order after switching identity", () => {
    const args = { order: input, key: "retry-key" };
    store.dispatch(submitOrder.pending("old", args));
    const next = { ...account, id: "new-account" };
    store.dispatch(
      setSession({
        user: { name: "Sam", email: "sam@example.test" },
        account: next,
      }),
    );
    store.dispatch(
      submitOrder.fulfilled({ account, order, replayed: false }, "old", args),
    );
    expect(store.getState().trading.account?.id).toBe("new-account");
    expect(store.getState().trading.pending).toBe(false);
  });

  it("ignores a previous watchlist arriving after logout", () => {
    store.dispatch(saveWatchlist.pending("old", ["TSLA"]));
    store.dispatch(clearSession());
    store.dispatch(
      saveWatchlist.fulfilled({ watchlist: ["TSLA"] }, "old", ["TSLA"]),
    );
    expect(store.getState().trading.watchlist).toEqual([
      "NVDA",
      "AAPL",
      "MSFT",
      "AMZN",
    ]);
  });

  it("ignores a reset or private connection arriving after logout", () => {
    store.dispatch(resetAccount.pending("reset", undefined));
    store.dispatch(connectPrivate.pending("connect", "test-token"));
    store.dispatch(clearSession());
    store.dispatch(resetAccount.fulfilled(account, "reset", undefined));
    store.dispatch(connectPrivate.fulfilled(account, "connect", "test-token"));
    expect(store.getState().trading.account).toBeNull();
  });

  it("uses the latest stock request, then clears its result on logout", () => {
    store.dispatch(loadMarket.pending("old", "AAPL"));
    store.dispatch(loadMarket.pending("new", "NVDA"));
    store.dispatch(loadMarket.fulfilled(market, "old", "AAPL"));
    expect(store.getState().trading.market).toBeNull();
    store.dispatch(loadMarket.fulfilled(market, "new", "NVDA"));
    expect(store.getState().trading.market).toEqual(market);
    store.dispatch(clearSession());
    store.dispatch(loadMarket.fulfilled(market, "new", "NVDA"));
    expect(store.getState().trading.market).toBeNull();
  });
});
