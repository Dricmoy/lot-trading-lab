package com.lot;

import static com.lot.Json.*;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
final class PortfolioHistory {
  final Database db;

  PortfolioHistory(Database db) {
    this.db = db;
  }

  void observe(String id, Map<String, Object> market) {
    var prices = new LinkedHashMap<String, Object>();
    for (var a : maps(market.get("assets")))
      if (integer(a.get("price")) && n(a, "price") > 0) prices.put(s(a, "symbol"), a.get("price"));
    if (prices.isEmpty()) return;
    db.tx(
        () -> {
          var account = db.lockAccount(id);
          var positions =
              db.rows(
                  "SELECT symbol,quantity,cost FROM trading_position WHERE account_id=?::uuid AND quantity>0 ORDER BY id",
                  id);
          long value = n(account, "cash");
          for (var p : positions) {
            if (!prices.containsKey(s(p, "symbol"))) return null;
            value += n(p, "quantity") * n(prices.get(s(p, "symbol")));
          }
          db.update(
              "INSERT INTO trading_portfoliosnapshot(account_id,epoch,bucket,cash,value,positions,prices) VALUES (?::uuid,?::uuid,?::timestamptz,?,?,?::jsonb,?::jsonb) ON CONFLICT(account_id,epoch,bucket) DO UPDATE SET cash=EXCLUDED.cash,value=EXCLUDED.value,positions=EXCLUDED.positions,prices=EXCLUDED.prices",
              id,
              account.get("history_epoch"),
              Instant.now().truncatedTo(ChronoUnit.MINUTES).toString(),
              account.get("cash"),
              value,
              write(positions),
              write(prices));
          return null;
        });
  }

  Map<String, Object> get(String id, int days) {
    if (!Set.of(1, 7, 30).contains(days))
      throw new ApiException(400, "Choose a one-day, seven-day, or thirty-day window.");
    return db.tx(
        () -> {
          var account = db.lockAccount(id);
          String since = Instant.now().minus(Duration.ofDays(days)).toString();
          var rows =
              db.rows(
                  "SELECT * FROM trading_portfoliosnapshot WHERE account_id=?::uuid AND epoch=?::uuid AND bucket>=?::timestamptz ORDER BY bucket DESC LIMIT 5000",
                  id,
                  account.get("history_epoch"),
                  since);
          Collections.reverse(rows);
          if (rows.isEmpty())
            return obj(
                "points",
                List.of(),
                "since",
                null,
                "return",
                0,
                "benchmark_return",
                0,
                "drawdown",
                0,
                "limited",
                false);
          var first = rows.getFirst();
          long start = n(first, "value"), peak = start;
          double drawdown = 0;
          var points = new ArrayList<Map<String, Object>>();
          for (var row : rows) {
            long benchmark = n(first, "cash");
            var prices = map(row.get("prices"));
            var originalPrices = map(first.get("prices"));
            for (var p : maps(first.get("positions")))
              benchmark +=
                  n(p, "quantity")
                      * n(prices.getOrDefault(s(p, "symbol"), originalPrices.get(s(p, "symbol"))));
            long value = n(row, "value");
            peak = Math.max(peak, value);
            drawdown = Math.max(drawdown, (peak - value) / (double) Math.max(1, peak) * 100);
            points.add(obj("time", row.get("bucket"), "value", value, "benchmark", benchmark));
          }
          var shown = new ArrayList<Map<String, Object>>();
          int stride = Math.max(1, points.size() / 240);
          for (int index = 0; index < points.size(); index += stride) shown.add(points.get(index));
          if (shown.getLast() != points.getLast()) shown.add(points.getLast());
          long count =
              db.count(
                  "SELECT count(*) FROM trading_portfoliosnapshot WHERE account_id=?::uuid AND epoch=?::uuid AND bucket>=?::timestamptz",
                  id,
                  account.get("history_epoch"),
                  since);
          return obj(
              "points",
              shown,
              "since",
              first.get("bucket"),
              "return",
              (n(rows.getLast(), "value") - start) / (double) Math.max(1, start) * 100,
              "benchmark_return",
              (n(points.getLast(), "benchmark") - start) / (double) Math.max(1, start) * 100,
              "drawdown",
              drawdown,
              "limited",
              count > 5000,
              "definition",
              "Holding comparison keeps the cash and share quantities from the first shown observation; no earlier prices are reconstructed.");
        });
  }
}
