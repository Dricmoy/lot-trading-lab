package com.lot;

import static com.lot.Json.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;

/** Deterministic state transitions. Version-one paths are frozen to preserve saved events. */
@Service
final class ReplayEngine {
  static final long START = 10_000_000;
  final Map<String, Object> catalog, frictions, paths;

  ReplayEngine() throws IOException {
    try (var in = Objects.requireNonNull(getClass().getResourceAsStream("/scenarios.json"))) {
      var data = parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
      catalog = map(data.get("catalog"));
      frictions = map(data.get("friction"));
      paths = map(data.get("prices"));
    }
  }

  String clock(long step) {
    long minutes = 570 + Math.round(step * 390.0 / 59);
    return String.format(Locale.ROOT, "%02d:%02d", minutes / 60, minutes % 60);
  }

  long price(String scenario, long step) {
    return n(((List<?>) paths.get(scenario)).get(Math.toIntExact(step)));
  }

  List<Map<String, Object>> orders(Map<String, Object> state) {
    return maps(state.get("orders"));
  }

  List<Map<String, Object>> open(Map<String, Object> state) {
    return orders(state).stream()
        .filter(o -> oneOf(o.get("status"), "open", "partial") && n(o, "remaining") > 0)
        .toList();
  }

  Map<String, Object> settings(Map<String, Object> state) {
    return map(frictions.get(s(state, "friction")));
  }

  long fee(long gross, long bps) {
    return (gross * bps + 9999) / 10000;
  }

  long[] reserved(Map<String, Object> state, String exclude) {
    long cash = 0, shares = 0;
    for (var o : open(state)) {
      if (Objects.equals(o.get("id"), exclude)) continue;
      if ("buy".equals(o.get("side")))
        cash +=
            n(o, "remaining") * (n(o, "limit") + fee(n(o, "limit"), n(settings(state), "fee_bps")));
      else shares += n(o, "remaining");
    }
    return new long[] {cash, shares};
  }

  void point(Map<String, Object> state, String scenario) {
    var entry =
        obj(
            "step",
            state.get("step"),
            "time",
            clock(n(state, "step")),
            "value",
            n(state, "cash") + n(state, "shares") * price(scenario, n(state, "step")));
    var history = maps(state.get("history"));
    if (history.isEmpty() || !fingerprint(history.getLast()).equals(fingerprint(entry)))
      history.add(entry);
  }

  Map<String, Object> initial(String scenario, String friction) {
    var state =
        obj(
            "cash",
            START,
            "shares",
            0L,
            "cost",
            0L,
            "realized",
            0L,
            "step",
            0L,
            "revision",
            0L,
            "finished",
            false,
            "friction",
            friction,
            "orders",
            new ArrayList<>(),
            "history",
            new ArrayList<>(),
            "liquidity",
            obj("buy", 0L, "sell", 0L));
    point(state, scenario);
    return state;
  }

  long adjustment(Map<String, Object> state, long mid) {
    var p = settings(state);
    return Math.max(1, (mid * n(p, "spread_bps") + 19999) / 20000)
        + (mid * n(p, "latency_bps") + 9999) / 10000;
  }

  void fill(Map<String, Object> state, Map<String, Object> order, String scenario) {
    long step = n(state, "step"), mid = price(scenario, step);
    String side = s(order, "side");
    boolean buy = "buy".equals(side);
    long px = mid + (buy ? 1 : -1) * adjustment(state, mid);
    if ("limit".equals(order.get("kind"))
        && (buy ? px > n(order, "limit") : px < n(order, "limit"))) return;
    var liquidity = map(state.get("liquidity"));
    long quantity =
        Math.min(n(order, "remaining"), Math.max(0, 100 + (step * 17) % 90 - n(liquidity, side)));
    if (quantity == 0) return;
    long gross = quantity * px, charge = fee(gross, n(settings(state), "fee_bps"));
    var r = reserved(state, s(order, "id"));
    if (buy) {
      if (gross + charge > n(state, "cash") - r[0]) return;
      state.put("cash", n(state, "cash") - gross - charge);
      state.put("shares", n(state, "shares") + quantity);
      state.put("cost", n(state, "cost") + gross + charge);
    } else {
      if (quantity > n(state, "shares") - r[1]) return;
      long released = n(state, "cost") * quantity / n(state, "shares"),
          pnl = gross - charge - released;
      state.put("shares", n(state, "shares") - quantity);
      state.put("cost", n(state, "cost") - released);
      state.put("cash", n(state, "cash") + gross - charge);
      state.put("realized", n(state, "realized") + pnl);
      order.put("realized", n(order, "realized") + pnl);
    }
    liquidity.put(side, n(liquidity, side) + quantity);
    order.put("executed", n(order, "executed") + quantity);
    order.put("remaining", n(order, "remaining") - quantity);
    order.put("total", n(order, "total") + gross);
    order.put("fees", n(order, "fees") + charge);
    maps(order.get("fills"))
        .add(
            obj(
                "step",
                step,
                "time",
                clock(step),
                "price",
                px,
                "quantity",
                quantity,
                "fee",
                charge,
                "mid",
                mid));
    order.put("status", n(order, "remaining") == 0 ? "filled" : "partial");
  }

  Map<String, Object> metrics(Map<String, Object> state, String scenario) {
    long value = n(state, "cash") + n(state, "shares") * price(scenario, n(state, "step")),
        peak = START;
    double drawdown = 0;
    for (var p : maps(state.get("history"))) {
      peak = Math.max(peak, n(p, "value"));
      drawdown = Math.max(drawdown, (peak - n(p, "value")) / (double) peak * 100);
    }
    long benchmarkShares = START / price(scenario, 0),
        baseline =
            START
                - benchmarkShares * price(scenario, 0)
                + benchmarkShares * price(scenario, n(state, "step"));
    return obj(
        "value",
        value,
        "return",
        (value - START) / (double) START * 100,
        "benchmark_value",
        baseline,
        "benchmark_return",
        (baseline - START) / (double) START * 100,
        "difference",
        value - baseline,
        "drawdown",
        drawdown,
        "realized",
        state.get("realized"),
        "unrealized",
        n(state, "shares") * price(scenario, n(state, "step")) - n(state, "cost"),
        "fees",
        orders(state).stream().mapToLong(o -> n(o, "fees")).sum(),
        "trades",
        orders(state).stream().filter(o -> n(o, "executed") > 0).count());
  }

  void finish(Map<String, Object> state) {
    for (var order : open(state)) order.put("status", "expired");
    state.put("finished", true);
  }

  void apply(Map<String, Object> state, Map<String, Object> data, String scenario, UUID orderId) {
    Object action = data.get("action");
    if (b(state, "finished") && !oneOf(action, "reflect", "share", "unshare"))
      throw new ApiException(
          409,
          "This session is finished. Try the scenario again to practice a different approach.");
    if ("advance".equals(action)) {
      Object count = data.getOrDefault("count", 1);
      if (!integer(count) || n(count) < 1 || n(count) > 5)
        throw new ApiException(400, "Advance between one and five moments.");
      for (int i = 0; i < n(count) && n(state, "step") < 59; i++) {
        state.put("step", n(state, "step") + 1);
        state.put("liquidity", obj("buy", 0L, "sell", 0L));
        for (var o : open(state)) fill(state, o, scenario);
        point(state, scenario);
      }
      if (n(state, "step") == 59) finish(state);
    } else if ("order".equals(action)) {
      if (orders(state).size() >= 100)
        throw new ApiException(
            429, "This session has reached its 100-order limit. Finish it or start another.");
      Object side = data.get("side"),
          kind = data.get("kind"),
          q = data.get("quantity"),
          limit = data.getOrDefault("limit", 0);
      if (!oneOf(side, "buy", "sell")
          || !oneOf(kind, "market", "limit")
          || !integer(q)
          || n(q) < 1
          || n(q) > 10000)
        throw new ApiException(400, "Choose a side and between 1 and 10,000 whole shares.");
      if (!integer(limit) || ("limit".equals(kind) && (n(limit) < 1 || n(limit) > 100000000)))
        throw new ApiException(400, "Enter a valid limit price.");
      String reason = text(data.getOrDefault("reason", ""), "your reason for this trade", true);
      long[] r = reserved(state, null);
      long quantity = n(q), px = price(scenario, n(state, "step"));
      if ("sell".equals(side) && quantity > n(state, "shares") - r[1])
        throw new ApiException(
            400,
            "You do not have enough available shares. Cancel an open sell order to release its reservation.");
      var order =
          obj(
              "id",
              orderId.toString(),
              "step",
              state.get("step"),
              "time",
              clock(n(state, "step")),
              "side",
              side,
              "kind",
              kind,
              "requested",
              quantity,
              "remaining",
              quantity,
              "executed",
              0L,
              "limit",
              "limit".equals(kind) ? n(limit) : 0L,
              "total",
              0L,
              "fees",
              0L,
              "realized",
              0L,
              "status",
              "open",
              "fills",
              new ArrayList<>(),
              "reason",
              reason,
              "reflection",
              "");
      if ("buy".equals(side)) {
        long worst = "limit".equals(kind) ? n(limit) : px + adjustment(state, px),
            gross = quantity * worst,
            required =
                "limit".equals(kind)
                    ? quantity * (worst + fee(worst, n(settings(state), "fee_bps")))
                    : gross + fee(gross, n(settings(state), "fee_bps"));
        if (required > n(state, "cash") - r[0])
          throw new ApiException(
              400, "Not enough available cash for this order and its modeled fees.");
      }
      orders(state).add(order);
      fill(state, order, scenario);
      if ("market".equals(kind) && n(order, "remaining") > 0)
        order.put("status", n(order, "executed") > 0 ? "partial_cancelled" : "cancelled");
      point(state, scenario);
    } else if (oneOf(action, "cancel", "reflect")) {
      var order =
          orders(state).stream()
              .filter(o -> Objects.equals(o.get("id"), data.get("order_id")))
              .findFirst()
              .orElseThrow(() -> new ApiException(404, "This order was not found."));
      if ("cancel".equals(action)) {
        if (!open(state).contains(order))
          throw new ApiException(409, "This order is no longer open.");
        order.put("status", "cancelled");
      } else
        order.put("reflection", text(data.getOrDefault("reflection", ""), "a reflection", false));
    } else if ("finish".equals(action)) finish(state);
    else if (oneOf(action, "share", "unshare")) {
      if (!b(state, "finished"))
        throw new ApiException(400, "Finish the session before sharing a recap.");
      if ("share".equals(action) && !(data.getOrDefault("include_notes", false) instanceof Boolean))
        throw new ApiException(400, "Choose whether to share your journal notes.");
    } else throw new ApiException(400, "Choose a supported replay action.");
    state.put("revision", n(state, "revision") + 1);
  }

  Map<String, Object> serialize(Map<String, Object> row, boolean publicly) {
    var state = copy(map(row.get("state")));
    String scenario = s(row, "scenario");
    var definition = map(catalog.get(scenario));
    long step = n(state, "step");
    if (publicly && !b(row, "share_notes"))
      for (var o : orders(state)) {
        o.put("reason", "");
        o.put("reflection", "");
      }
    var out =
        obj(
            "id",
            publicly ? null : row.get("id"),
            "scenario",
            scenario,
            "scenario_version",
            row.get("scenario_version"),
            "title",
            definition.get("title"),
            "lesson",
            definition.get("lesson"));
    out.putAll(state);
    var revealed = new ArrayList<Map<String, Object>>();
    for (int i = 0; i <= step; i++)
      revealed.add(obj("step", i, "time", clock(i), "price", price(scenario, i)));
    var news = new ArrayList<Map<String, Object>>();
    for (var raw : (List<?>) definition.get("news")) {
      var item = (List<?>) raw;
      if (n(item.get(0)) <= step)
        news.add(
            obj(
                "step",
                item.get(0),
                "time",
                clock(n(item.get(0))),
                "title",
                item.get(1),
                "body",
                item.get(2),
                "source",
                "Lot scenario desk"));
    }
    long[] r = reserved(state, null);
    out.putAll(
        obj(
            "price",
            price(scenario, step),
            "clock",
            clock(step),
            "last_step",
            59,
            "prices",
            revealed,
            "news",
            news,
            "reserved_cash",
            r[0],
            "reserved_shares",
            r[1],
            "metrics",
            metrics(state, scenario),
            "assumptions",
            settings(state),
            "share_url",
            row.get("shared_token") == null ? null : "/s/" + row.get("shared_token"),
            "notes_shared",
            row.get("share_notes"),
            "created_at",
            row.get("created_at")));
    return out;
  }

  Map<String, Object> trace(Map<String, Object> row, int cutoff, List<Map<String, Object>> events) {
    String scenario = s(row, "scenario");
    var finalState = map(row.get("state"));
    var state = initial(scenario, s(finalState, "friction"));
    var comparable = copy(state);
    var decisions = new ArrayList<Map<String, Object>>();
    var finalOrders = new HashMap<String, Map<String, Object>>();
    for (var o : orders(finalState)) finalOrders.put(s(o, "id"), o);
    for (var event : events) {
      var data = map(event.get("payload"));
      if (!fingerprint(data).equals(event.get("fingerprint"))
          || !integer(data.get("revision"))
          || n(data, "revision") != n(state, "revision"))
        throw new ApiException(409, "Replay action fingerprint or revision differs.");
      var before = copy(state);
      apply(state, data, scenario, uuid5(uuid(row.get("id")), event.get("key").toString()));
      if (n(state, "step") <= cutoff) comparable = copy(state);
      else if (n(before, "step") < cutoff && "advance".equals(data.get("action"))) {
        comparable = copy(before);
        apply(
            comparable,
            obj("action", "advance", "count", cutoff - n(before, "step")),
            scenario,
            UUID.randomUUID());
      }
      Object action = data.get("action");
      if (!oneOf(action, "order", "cancel", "finish")) continue;
      Map<String, Object> order =
          "order".equals(action)
              ? orders(state).getLast()
              : orders(state).stream()
                  .filter(o -> Objects.equals(o.get("id"), data.get("order_id")))
                  .findFirst()
                  .orElse(null);
      var choice = obj("action", action, "step", before.get("step"));
      if ("order".equals(action))
        for (String field : List.of("side", "kind", "requested", "limit"))
          choice.put(field, order.get(field));
      else if ("cancel".equals(action)) choice.put("order_index", orders(state).indexOf(order));
      decisions.add(
          obj(
              "id",
              event.get("id").toString(),
              "action",
              action,
              "step",
              before.get("step"),
              "time",
              clock(n(before, "step")),
              "price",
              price(scenario, n(before, "step")),
              "before_value",
              metrics(before, scenario).get("value"),
              "value",
              metrics(state, scenario).get("value"),
              "cash",
              state.get("cash"),
              "shares",
              state.get("shares"),
              "order",
              order == null ? null : copy(order),
              "reflection",
              order == null ? "" : finalOrders.get(s(order, "id")).get("reflection"),
              "final_order",
              order == null ? null : copy(finalOrders.get(s(order, "id"))),
              "choice",
              choice));
    }
    if (!fingerprint(state).equals(fingerprint(finalState)))
      throw new ApiException(409, "Replay reconstruction differs from saved state.");
    var history = new TreeMap<Long, Map<String, Object>>();
    for (var p : maps(comparable.get("history"))) history.put(n(p, "step"), p);
    return obj(
        "id",
        row.get("id"),
        "created_at",
        row.get("created_at"),
        "clock",
        clock(n(state, "step")),
        "step",
        state.get("step"),
        "friction",
        state.get("friction"),
        "metrics",
        metrics(state, scenario),
        "decisions",
        decisions,
        "common",
        obj(
            "metrics",
            metrics(comparable, scenario),
            "cash",
            comparable.get("cash"),
            "shares",
            comparable.get("shares"),
            "history",
            new ArrayList<>(history.values())));
  }
}
