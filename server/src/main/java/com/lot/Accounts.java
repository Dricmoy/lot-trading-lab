package com.lot;

import static com.lot.Json.*;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;

/** All ordinary money changes serialize on the account row. */
@Service
final class Accounts {
  final Database db;
  final Identity identity;
  final MarketData market;

  Accounts(Database db, Identity identity, MarketData market) {
    this.db = db;
    this.identity = identity;
    this.market = market;
  }

  String create(boolean seeded, Object user, String requestedId) {
    String id = requestedId == null ? UUID.randomUUID().toString() : requestedId;
    db.update(
        "INSERT INTO trading_account(id,cash,cash_anchor,created_at,user_id,watchlist,history_epoch,revision) VALUES (?::uuid,?,?,clock_timestamp(),?,?::jsonb,?::uuid,0)",
        id,
        seeded ? 7552815L : 10000000L,
        seeded ? 7552815L : 10000000L,
        user,
        write(List.of("NVDA", "AAPL", "MSFT", "AMZN")),
        UUID.randomUUID().toString());
    if (seeded)
      for (var p :
          List.of(
              obj("symbol", "HOOD", "quantity", 80, "cost", 874400),
              obj("symbol", "NVDA", "quantity", 60, "cost", 990000),
              obj("symbol", "AAPL", "quantity", 25, "cost", 582785)))
        db.update(
            "INSERT INTO trading_position(account_id,symbol,quantity,cost) VALUES (?::uuid,?,?,?)",
            id,
            p.get("symbol"),
            p.get("quantity"),
            p.get("cost"));
    return id;
  }

  List<Map<String, Object>> open(String id) {
    return db.rows(
        "SELECT * FROM trading_order WHERE account_id=?::uuid AND time_in_force='gtc' AND status IN ('open','partial') ORDER BY created_at,id",
        id);
  }

  record Reservations(long cash, Map<String, Long> shares) {}

  Reservations reservations(String id, String exclude) {
    long cash = 0;
    var shares = new HashMap<String, Long>();
    for (var o : open(id)) {
      if (Objects.equals(o.get("id"), exclude)) continue;
      long remaining = n(o, "requested") - n(o, "executed");
      if ("buy".equals(o.get("side"))) cash += remaining * n(o, "limit");
      else shares.merge(s(o, "symbol"), remaining, Long::sum);
    }
    return new Reservations(cash, shares);
  }

  Map<String, Object> order(Map<String, Object> row) {
    var copy = new LinkedHashMap<>(row);
    copy.remove("account_id");
    copy.remove("key");
    copy.remove("fingerprint");
    return copy;
  }

  Map<String, Object> serialize(String id) {
    return db.tx(
        () -> {
          var a = db.lockAccount(id);
          var r = reservations(id, null);
          return obj(
              "id",
              id,
              "revision",
              a.get("revision"),
              "cash",
              a.get("cash"),
              "watchlist",
              a.get("watchlist"),
              "market_source",
              identity.isOwner(id) ? "alpaca-iex" : "simulated",
              "positions",
              db.rows(
                  "SELECT symbol,quantity,cost FROM trading_position WHERE account_id=?::uuid AND quantity>0 ORDER BY id",
                  id),
              "orders",
              db
                  .rows(
                      "SELECT * FROM trading_order WHERE account_id=?::uuid ORDER BY created_at DESC,id DESC LIMIT 50",
                      id)
                  .stream()
                  .map(this::order)
                  .toList(),
              "open_orders",
              open(id).stream().map(this::order).toList(),
              "reserved_cash",
              r.cash(),
              "reserved_shares",
              r.shares());
        });
  }

  Map<String, Object> validateOrder(Map<String, Object> data) {
    Object symbol = data.get("symbol"),
        side = data.get("side"),
        kind = data.get("kind"),
        q = data.get("quantity"),
        limit = data.getOrDefault("limit", 0),
        tif = data.getOrDefault("time_in_force", "ioc"),
        reason = data.getOrDefault("reason", "");
    if (!(symbol instanceof String s)
        || !MarketData.SYMBOLS.contains(s)
        || !oneOf(side, "buy", "sell")
        || !oneOf(kind, "market", "limit"))
      throw new ApiException(400, "Choose a supported symbol, side, and order type.");
    if (!integer(q) || n(q) < 1 || n(q) > 10000)
      throw new ApiException(400, "Enter a whole number between 1 and 10,000 shares.");
    if (!integer(limit) || ("limit".equals(kind) && (n(limit) < 1 || n(limit) > 100000000)))
      throw new ApiException(400, "Enter a valid limit price.");
    if (!oneOf(tif, "ioc", "gtc") || ("market".equals(kind) && !"ioc".equals(tif)))
      throw new ApiException(
          400, "Market orders execute immediately; only limit orders can stay open.");
    String plan = text(reason, "your reason", false);
    return obj(
        "symbol",
        symbol,
        "side",
        side,
        "kind",
        kind,
        "quantity",
        n(q),
        "limit",
        "limit".equals(kind) ? n(limit) : 0L,
        "time_in_force",
        tif,
        "reason",
        plan);
  }

  private void validateExecution(
      Map<String, Object> result, long requested, String side, long limit) {
    try {
      var fills = maps(result.get("fills"));
      long quantity = 0, total = 0;
      for (var f : fills) {
        if (!integer(f.get("quantity"))
            || !integer(f.get("price"))
            || n(f, "quantity") <= 0
            || n(f, "price") <= 0) throw new IllegalArgumentException();
        quantity = Math.addExact(quantity, n(f, "quantity"));
        total = Math.addExact(total, Math.multiplyExact(n(f, "quantity"), n(f, "price")));
        if (limit > 0 && ("buy".equals(side) ? n(f, "price") > limit : n(f, "price") < limit))
          throw new IllegalArgumentException();
      }
      if (!integer(result.get("quantity"))
          || !integer(result.get("total"))
          || quantity != n(result, "quantity")
          || total != n(result, "total")
          || quantity > requested
          || !Objects.equals(
              result.get("status"),
              quantity == requested ? "filled" : quantity == 0 ? "cancelled" : "partial"))
        throw new IllegalArgumentException();
    } catch (Exception e) {
      throw new ApiException(503, "Execution data was invalid. No funds were changed.");
    }
  }

  private long applyFill(
      Map<String, Object> account, String symbol, String side, long quantity, long total) {
    if (quantity == 0) return 0;
    String id = s(account, "id");
    var p =
        db.one("SELECT * FROM trading_position WHERE account_id=?::uuid AND symbol=?", id, symbol);
    long held = p == null ? 0 : n(p, "quantity"), cost = p == null ? 0 : n(p, "cost"), realized = 0;
    if ("buy".equals(side)) {
      held += quantity;
      cost += total;
      account.put("cash", n(account, "cash") - total);
    } else {
      if (held < quantity)
        throw new ApiException(409, "Reserved shares were unavailable. No funds were changed.");
      long released = cost * quantity / held;
      held -= quantity;
      cost -= released;
      realized = total - released;
      account.put("cash", n(account, "cash") + total);
    }
    db.update(
        "INSERT INTO trading_position(account_id,symbol,quantity,cost) VALUES (?::uuid,?,?,?) ON CONFLICT(account_id,symbol) DO UPDATE SET quantity=EXCLUDED.quantity,cost=EXCLUDED.cost",
        id,
        symbol,
        held,
        cost);
    db.update("UPDATE trading_account SET cash=? WHERE id=?::uuid", account.get("cash"), id);
    return realized;
  }

  Map<String, Object> place(String id, Map<String, Object> data, UUID key) {
    var v = validateOrder(data);
    String symbol = s(v, "symbol"),
        side = s(v, "side"),
        kind = s(v, "kind"),
        tif = s(v, "time_in_force");
    long quantity = n(v, "quantity"), limit = n(v, "limit");
    var payload =
        obj("symbol", symbol, "side", side, "kind", kind, "quantity", quantity, "limit", limit);
    var canonical = new LinkedHashMap<>(payload);
    if (!"ioc".equals(tif) || !Objects.toString(data.get("reason"), "").isEmpty()) {
      canonical.put("time_in_force", tif);
      canonical.put("reason", v.get("reason"));
    }
    String fingerprint = hash(Json.canonical(canonical, true));
    return db.tx(
        () -> {
          var a = db.lockAccount(id);
          var existing =
              db.one("SELECT * FROM trading_order WHERE account_id=?::uuid AND key=?", id, key);
          if (existing != null) {
            if (!fingerprint.equals(existing.get("fingerprint")))
              throw new ApiException(
                  409, "This request key was already used for a different order.");
            return obj("order", order(existing), "account", serialize(id), "replayed", true);
          }
          var reserved = reservations(id, null);
          var p =
              db.one(
                  "SELECT * FROM trading_position WHERE account_id=?::uuid AND symbol=?",
                  id,
                  symbol);
          if ("sell".equals(side)
              && (p == null
                  || n(p, "quantity") - reserved.shares().getOrDefault(symbol, 0L) < quantity))
            throw new ApiException(
                400, "You do not own enough shares. Short selling is not supported.");
          if ("gtc".equals(tif)) {
            if (open(id).size() >= 20)
              throw new ApiException(
                  400,
                  "Cancel an open limit order before adding another. Your workspace supports 20 open orders.");
            if ("buy".equals(side) && quantity * limit > n(a, "cash") - reserved.cash())
              throw new ApiException(400, "Not enough available cash to reserve this limit order.");
          }
          var result = market.execute(identity.isOwner(id), payload);
          validateExecution(result, quantity, side, limit);
          long executed = n(result, "quantity"), total = n(result, "total");
          if ("buy".equals(side) && total > n(a, "cash") - reserved.cash())
            throw new ApiException(400, "Not enough buying power for this order.");
          long realized = applyFill(a, symbol, side, executed, total);
          if ("gtc".equals(tif) && executed < quantity)
            result.put("status", executed == 0 ? "open" : "partial");
          result.put("checked_bucket", Instant.now().getEpochSecond() / 15);
          String orderId = UUID.randomUUID().toString();
          db.update(
              "INSERT INTO trading_order(id,key,fingerprint,symbol,side,kind,requested,executed,total,status,result,created_at,account_id,\"limit\",time_in_force,reason,reflection,realized) VALUES (?::uuid,?,?,?,?,?,?,?,?,?,?::jsonb,clock_timestamp(),?::uuid,?,?,?,'',?)",
              orderId,
              key,
              fingerprint,
              symbol,
              side,
              kind,
              quantity,
              executed,
              total,
              result.get("status"),
              write(result),
              id,
              limit,
              tif,
              v.get("reason"),
              realized);
          db.update(
              "INSERT INTO trading_ledgerentry(account_id,order_id,cash_delta,cash_after,created_at) VALUES (?::uuid,?::uuid,?,?,clock_timestamp())",
              id,
              orderId,
              "buy".equals(side) ? -total : total,
              a.get("cash"));
          db.update("UPDATE trading_account SET revision=revision+1 WHERE id=?::uuid", id);
          return obj(
              "order",
              order(db.one("SELECT * FROM trading_order WHERE id=?::uuid", orderId)),
              "account",
              serialize(id),
              "replayed",
              false);
        });
  }

  Map<String, Object> settle(String id) {
    return db.tx(
        () -> {
          var a = db.lockAccount(id);
          long bucket = Instant.now().getEpochSecond() / 15;
          var o =
              db.one(
                  "SELECT * FROM trading_order WHERE account_id=?::uuid AND time_in_force='gtc' AND status IN ('open','partial') AND COALESCE((result->>'checked_bucket')::bigint,0)<? ORDER BY COALESCE((result->>'checked_bucket')::bigint,0),created_at,id LIMIT 1",
                  id,
                  bucket);
          if (o == null) return obj("account", serialize(id));
          String symbol = s(o, "symbol"), side = s(o, "side");
          long remaining = n(o, "requested") - n(o, "executed");
          var payload =
              obj(
                  "symbol",
                  symbol,
                  "side",
                  side,
                  "kind",
                  "limit",
                  "quantity",
                  remaining,
                  "limit",
                  o.get("limit"));
          var fresh = market.execute(identity.isOwner(id), payload);
          validateExecution(fresh, remaining, side, n(o, "limit"));
          long quantity = n(fresh, "quantity"), total = n(fresh, "total");
          var reserved = reservations(id, s(o, "id"));
          if ("buy".equals(side) && total > n(a, "cash") - reserved.cash())
            throw new ApiException(
                409, "Reserved buying power was unavailable. No funds were changed.");
          var p =
              db.one(
                  "SELECT * FROM trading_position WHERE account_id=?::uuid AND symbol=?",
                  id,
                  symbol);
          if ("sell".equals(side)
              && (p == null
                  || quantity > n(p, "quantity") - reserved.shares().getOrDefault(symbol, 0L)))
            throw new ApiException(409, "Reserved shares were unavailable. No funds were changed.");
          long realized = applyFill(a, symbol, side, quantity, total);
          if (quantity > 0)
            db.update(
                "INSERT INTO trading_ordermovement(account_id,order_id,quantity,total,cash_delta,cash_after,created_at) VALUES (?::uuid,?::uuid,?,?,?,?,clock_timestamp())",
                id,
                o.get("id"),
                quantity,
                total,
                "buy".equals(side) ? -total : total,
                a.get("cash"));
          long executed = n(o, "executed") + quantity, gross = n(o, "total") + total;
          String status =
              executed == n(o, "requested") ? "filled" : executed > 0 ? "partial" : "open";
          var result = map(o.get("result"));
          var fills = maps(result.get("fills"));
          fills.addAll(maps(fresh.get("fills")));
          result.putAll(
              obj(
                  "quantity",
                  executed,
                  "total",
                  gross,
                  "status",
                  status,
                  "checked_bucket",
                  bucket,
                  "book",
                  fresh.get("book")));
          db.update(
              "UPDATE trading_order SET executed=?,total=?,status=?,result=?::jsonb,realized=? WHERE id=?::uuid",
              executed,
              gross,
              status,
              write(result),
              (o.get("realized") == null ? 0 : n(o, "realized")) + realized,
              o.get("id"));
          db.update("UPDATE trading_account SET revision=revision+1 WHERE id=?::uuid", id);
          return obj("account", serialize(id));
        });
  }

  Map<String, Object> cancel(String id, UUID orderId) {
    return db.tx(
        () -> {
          db.lockAccount(id);
          var order =
              db.one("SELECT * FROM trading_order WHERE account_id=?::uuid AND id=?", id, orderId);
          if (order == null) throw new ApiException(404, "Order not found.");
          String status = s(order, "status");
          if ("gtc".equals(order.get("time_in_force"))
              && Set.of("open", "partial").contains(status)) {
            var result = map(order.get("result"));
            result.put("status", "cancelled");
            db.update(
                "UPDATE trading_order SET status='cancelled',result=?::jsonb WHERE id=?",
                write(result),
                orderId);
            db.update("UPDATE trading_account SET revision=revision+1 WHERE id=?::uuid", id);
          } else if (!"cancelled".equals(status))
            throw new ApiException(409, "This order is no longer open.");
          return obj("account", serialize(id));
        });
  }

  Map<String, Object> reflect(String id, UUID orderId, String reflection) {
    return db.tx(
        () -> {
          db.lockAccount(id);
          if (db.count(
                  "SELECT count(*) FROM trading_order WHERE id=? AND account_id=?::uuid",
                  orderId,
                  id)
              == 0) throw new ApiException(404, "Order not found.");
          db.update("UPDATE trading_order SET reflection=? WHERE id=?", reflection, orderId);
          db.update("UPDATE trading_account SET revision=revision+1 WHERE id=?::uuid", id);
          return obj("account", serialize(id));
        });
  }

  Map<String, Object> reset(String id) {
    return db.tx(
        () -> {
          db.lockAccount(id);
          db.update("DELETE FROM trading_ordermovement WHERE account_id=?::uuid", id);
          db.update("DELETE FROM trading_ledgerentry WHERE account_id=?::uuid", id);
          db.update("DELETE FROM trading_order WHERE account_id=?::uuid", id);
          db.update("DELETE FROM trading_position WHERE account_id=?::uuid", id);
          db.update(
              "UPDATE trading_account SET cash=10000000,cash_anchor=10000000,history_epoch=?::uuid,revision=revision+1 WHERE id=?::uuid",
              UUID.randomUUID().toString(),
              id);
          return serialize(id);
        });
  }

  Map<String, Object> preferences(String id, Map<String, Object> data) {
    Object raw = data.get("watchlist");
    if (!(raw instanceof List<?> list)
        || list.size() > 8
        || list.stream().anyMatch(v -> !(v instanceof String) || !MarketData.SYMBOLS.contains(v)))
      throw new ApiException(400, "Choose supported stocks for your watchlist.");
    var watchlist = new ArrayList<>(new LinkedHashSet<>((List<?>) raw));
    db.update(
        "UPDATE trading_account SET watchlist=?::jsonb WHERE id=?::uuid", write(watchlist), id);
    return obj("watchlist", watchlist);
  }
}
