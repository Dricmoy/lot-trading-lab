import {
  configureStore,
  createAsyncThunk,
  createSlice,
} from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { api } from "./lib";
import type { Account, Market, Order, OrderInput } from "./types";

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
};
const slice = createSlice({
  name: "trading",
  initialState,
  reducers: {
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
      .addCase(loadAccount.pending, (s) => {
        s.accountLoading = true;
      })
      .addCase(loadAccount.fulfilled, (s, a) => {
        s.account = a.payload;
        s.accountError = null;
        s.accountLoading = false;
      })
      .addCase(loadAccount.rejected, (s, a) => {
        s.accountError = a.error.message ?? "Account unavailable";
        s.accountLoading = false;
      })
      .addCase(submitOrder.pending, (s) => {
        s.pending = true;
      })
      .addCase(submitOrder.fulfilled, (s, a) => {
        s.pending = false;
        s.account = a.payload.account;
      })
      .addCase(submitOrder.rejected, (s) => {
        s.pending = false;
      })
      .addCase(connectPrivate.fulfilled, (s, a) => {
        s.account = a.payload;
        s.market = null;
        s.marketRequest = null;
        s.marketError = null;
      })
      .addCase(resetAccount.fulfilled, (s, a) => {
        s.account = a.payload;
      });
  },
});
export const { selectSymbol, setView, toggleWatch } = slice.actions;
export const store = configureStore({
  reducer: { trading: slice.reducer },
  devTools: import.meta.env.DEV,
});
export type RootState = ReturnType<typeof store.getState>;
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
