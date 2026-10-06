import {
  configureStore,
  createAsyncThunk,
  createSlice,
} from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { api } from "./lib";
import type { Account, Market, Order, OrderInput, User } from "./types";

export const loadMarket = createAsyncThunk(
  "trading/market",
  async (symbol: string) => api<Market>(`/api/market?symbol=${symbol}`),
);
export const loadAccount = createAsyncThunk(
  "trading/account",
  async () => api<Account>("/api/account"),
  {
    condition: (_, { getState }) =>
      !(getState() as { trading: State }).trading.accountLoading,
  },
);
export const submitOrder = createAsyncThunk(
  "trading/order",
  async ({ order, key }: { order: OrderInput; key: string }) =>
    api<{ account: Account; order: Order; replayed: boolean }>("/api/orders", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(order),
    }),
);
export const connectPrivate = createAsyncThunk(
  "trading/connect",
  async (token: string) =>
    api<Account>("/api/connect", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
);
export const resetAccount = createAsyncThunk("trading/reset", async () =>
  api<Account>("/api/reset", { method: "POST", body: "{}" }),
);
export const saveWatchlist = createAsyncThunk(
  "trading/watchlist",
  async (watchlist: string[]) =>
    api<{ watchlist: string[] }>("/api/preferences", {
      method: "POST",
      body: JSON.stringify({ watchlist }),
    }),
);

type State = {
  market: Market | null;
  account: Account | null;
  symbol: string;
  view: "trade" | "portfolio" | "activity";
  watchlist: string[];
  marketError: string | null;
  accountError: string | null;
  accountLoading: boolean;
  pending: boolean;
  marketRequest: string | null;
  accountRequest: string | null;
  orderRequest: string | null;
  preferencesRequest: string | null;
  resetRequest: string | null;
  connectRequest: string | null;
  user: User | null;
};
const initialState: State = {
  market: null,
  account: null,
  symbol: "NVDA",
  view: "trade",
  watchlist: ["NVDA", "AAPL", "MSFT", "AMZN"],
  marketError: null,
  accountError: null,
  accountLoading: false,
  pending: false,
  marketRequest: null,
  accountRequest: null,
  orderRequest: null,
  preferencesRequest: null,
  resetRequest: null,
  connectRequest: null,
  user: null,
};
const slice = createSlice({
  name: "trading",
  initialState,
  reducers: {
    setSession(
      state,
      action: { payload: { user: User | null; account: Account | null } },
    ) {
      state.user = action.payload.user;
      state.account = action.payload.account;
      if (action.payload.account)
        state.watchlist = action.payload.account.watchlist;
      state.market = null;
      state.marketError = null;
      state.accountError = null;
      state.marketRequest = null;
      state.accountRequest = null;
      state.orderRequest = null;
      state.preferencesRequest = null;
      state.resetRequest = null;
      state.connectRequest = null;
      state.accountLoading = false;
      state.pending = false;
      state.view = "trade";
    },
    clearSession() {
      return { ...initialState };
    },
    selectSymbol(state, action: { payload: string }) {
      state.symbol = action.payload;
      state.view = "trade";
    },
    setView(state, action: { payload: State["view"] }) {
      state.view = action.payload;
    },
    toggleWatch(state, action: { payload: string }) {
      state.watchlist = state.watchlist.includes(action.payload)
        ? state.watchlist.filter((s) => s !== action.payload)
        : [...state.watchlist, action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadMarket.pending, (s, a) => {
        s.marketRequest = a.meta.requestId;
      })
      .addCase(loadMarket.fulfilled, (s, a) => {
        if (s.marketRequest === a.meta.requestId) {
          s.market = a.payload;
          s.marketError = null;
        }
      })
      .addCase(loadMarket.rejected, (s, a) => {
        if (s.marketRequest === a.meta.requestId)
          s.marketError = a.error.message ?? "Market unavailable";
      })
      .addCase(loadAccount.pending, (s, a) => {
        s.accountLoading = true;
        s.accountRequest = a.meta.requestId;
      })
      .addCase(loadAccount.fulfilled, (s, a) => {
        if (s.accountRequest !== a.meta.requestId) return;
        s.account = a.payload;
        s.watchlist = a.payload.watchlist;
        s.accountError = null;
        s.accountLoading = false;
      })
      .addCase(loadAccount.rejected, (s, a) => {
        if (s.accountRequest !== a.meta.requestId) return;
        s.accountError = a.error.message ?? "Account unavailable";
        s.accountLoading = false;
      })
      .addCase(submitOrder.pending, (s, a) => {
        s.pending = true;
        s.orderRequest = a.meta.requestId;
      })
      .addCase(submitOrder.fulfilled, (s, a) => {
        if (s.orderRequest !== a.meta.requestId) return;
        s.pending = false;
        s.account = a.payload.account;
      })
      .addCase(submitOrder.rejected, (s, a) => {
        if (s.orderRequest !== a.meta.requestId) return;
        s.pending = false;
      })
      .addCase(connectPrivate.pending, (s, a) => {
        s.connectRequest = a.meta.requestId;
      })
      .addCase(connectPrivate.fulfilled, (s, a) => {
        if (s.connectRequest !== a.meta.requestId) return;
        s.account = a.payload;
        s.watchlist = a.payload.watchlist;
        s.market = null;
        s.marketRequest = null;
        s.marketError = null;
      })
      .addCase(resetAccount.pending, (s, a) => {
        s.resetRequest = a.meta.requestId;
      })
      .addCase(resetAccount.fulfilled, (s, a) => {
        if (s.resetRequest !== a.meta.requestId) return;
        s.account = a.payload;
      })
      .addCase(saveWatchlist.pending, (s, a) => {
        s.preferencesRequest = a.meta.requestId;
      })
      .addCase(saveWatchlist.fulfilled, (s, a) => {
        if (s.preferencesRequest !== a.meta.requestId) return;
        s.watchlist = a.payload.watchlist;
      });
  },
});
export const { selectSymbol, setView, toggleWatch, setSession, clearSession } =
  slice.actions;
export const store = configureStore({
  reducer: { trading: slice.reducer },
  devTools: import.meta.env.DEV,
});
export type RootState = ReturnType<typeof store.getState>;
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
