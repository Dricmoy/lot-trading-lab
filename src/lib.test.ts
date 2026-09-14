import { describe, it, expect } from "vitest";
import { priceToCents, portfolioValue, chartHistory } from "./lib";
describe("Money and portfolio calculations", () => {
  it("parses currency exactly into integer cents", () => {
    expect(priceToCents("118.42")).toBe(11842);
    expect(priceToCents("0.29")).toBe(29);
    expect(priceToCents("100")).toBe(10000);
  });
  it("rejects sub-cent prices and malformed input", () => {
    for (const input of ["1.005", "NaN", "-10", "", "1e3"])
      expect(priceToCents(input)).toBeNaN();
  });
  it("includes cash and marks positions to simulated market", () => {
    expect(
      portfolioValue(
        {
          id: "test",
          cash: 500,
          orders: [],
          positions: [{ symbol: "X", quantity: 3, cost: 200 }],
        },
        [
          {
            symbol: "X",
            name: "X",
            sector: "X",
            price: 100,
            previous: 90,
            history: [],
          },
        ],
      ),
    ).toBe(800);
  });
});

describe("Real chart windows", () => {
  it("uses exchange timestamps instead of inventing bars across gaps", () => {
    const asset = {
      symbol: "HOOD",
      name: "Robinhood",
      sector: "Finance",
      price: 12000,
      previous: 11000,
      quote_time: "2026-09-11T19:59:00Z",
      history: [11500, 11600, 11700, 12000],
      history_times: [
        "2026-09-11T17:00:00Z",
        "2026-09-11T18:30:00Z",
        "2026-09-11T19:00:00Z",
        "2026-09-11T19:30:00Z",
      ],
    };
    expect(chartHistory(asset, "1H").map((p) => p.price)).toEqual([
      11700, 12000,
    ]);
    expect(chartHistory(asset, "1D")).toHaveLength(4);
  });
});
