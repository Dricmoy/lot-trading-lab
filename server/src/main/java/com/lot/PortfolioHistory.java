package com.lot;

import static com.lot.Json.*;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
final class PortfolioHistory {
  private static final int CHART_POINTS = 240;
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
                "observations",
                0,
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
          var shown = sample(points);
          long count =
              db.count(
                  "SELECT count(*) FROM trading_portfoliosnapshot WHERE account_id=?::uuid AND epoch=?::uuid AND bucket>=?::timestamptz",
                  id,
                  account.get("history_epoch"),
                  since);
          return obj(
              "points",
              shown,
              "observations",
              rows.size(),
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

  static List<Map<String, Object>> sample(List<Map<String, Object>> points) {
    if (points.size() <= CHART_POINTS) return points;
    var selected = new TreeSet<Integer>();
    selected.add(0);
    selected.add(points.size() - 1);

    int peak = 0, drawdownPeak = 0, drawdownTrough = 0;
    double drawdown = 0;
    for (int index = 1; index < points.size(); index++) {
      long value = n(points.get(index), "value");
      if (value > n(points.get(peak), "value")) peak = index;
      long high = n(points.get(peak), "value");
      double loss = (high - value) / (double) Math.max(1, high);
      if (loss > drawdown) {
        drawdown = loss;
        drawdownPeak = peak;
        drawdownTrough = index;
      }
    }
    selected.add(drawdownPeak);
    selected.add(drawdownTrough);

    // Reserve four slots for endpoints and the maximum-drawdown pair. Each
    // bucket contributes at most four original points: two extrema per series.
    int buckets = (CHART_POINTS - 4) / 4;
    for (int bucket = 0; bucket < buckets; bucket++) {
      int start = 1 + (points.size() - 2) * bucket / buckets;
      int end = 1 + (points.size() - 2) * (bucket + 1) / buckets;
      for (String series : List.of("value", "benchmark")) {
        int low = start, high = start;
        for (int index = start + 1; index < end; index++) {
          long value = n(points.get(index), series);
          if (value < n(points.get(low), series)) low = index;
          if (value > n(points.get(high), series)) high = index;
        }
        selected.add(low);
        selected.add(high);
      }
    }
    return selected.stream().map(points::get).toList();
  }
}
