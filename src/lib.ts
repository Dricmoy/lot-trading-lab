import type { Asset, Account } from "./types";
export const money = (cents: number, digits = 2) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
export const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
export const change = (a: Asset) => ((a.price - a.previous) / a.previous) * 100;
export const portfolioValue = (account: Account, assets: Asset[]) =>
  account.cash +
  account.positions.reduce(
    (sum, p) =>
      sum +
      p.quantity * (assets.find((a) => a.symbol === p.symbol)?.price ?? 0),
    0,
  );
export function priceToCents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const csrf =
    document.cookie
      .split("; ")
      .find((v) => v.startsWith("csrftoken="))
      ?.split("=")[1] ?? "";
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
      ...init?.headers,
    },
  });
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json"))
    throw new Error(
      "The trading services are unavailable. Please try again shortly.",
    );
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error ?? "Something went wrong. Please try again.",
      response.status,
    );
  return data;
}

export function chartHistory(asset: Asset, range: string) {
  const points = asset.history.map((price, i) => ({
    price,
    timestamp: asset.history_times?.[i],
  }));
  if (range !== "1H") return points;
  if (!asset.quote_time) return points.slice(-16);
  const last = Date.parse(points.at(-1)?.timestamp ?? "");
  return points.filter(
    (point) => Date.parse(point.timestamp ?? "") > last - 3600000,
  );
}
