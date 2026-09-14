export type Asset = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  previous: number;
  history: number[];
  history_times?: string[];
  quote_time?: string;
};
export type Level = { price: number; quantity: number; sequence: number };
export type Book = { bids: Level[]; asks: Level[] };
export type Market = {
  assets: Asset[];
  book: Book;
  as_of: string;
  source: string;
  engine: string;
};
export type Fill = { price: number; quantity: number };
export type Execution = {
  fills: Fill[];
  quantity: number;
  total: number;
  status: string;
  duration_us: number;
  algorithm: string;
  book: Book;
};
export type Order = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  kind: "market" | "limit";
  requested: number;
  executed: number;
  total: number;
  status: string;
  result: Execution;
  created_at: string;
};
export type Account = {
  id: string;
  cash: number;
  market_source?: string;
  positions: { symbol: string; quantity: number; cost: number }[];
  orders: Order[];
};
export type OrderInput = {
  symbol: string;
  side: "buy" | "sell";
  kind: "market" | "limit";
  quantity: number;
  limit: number;
};
