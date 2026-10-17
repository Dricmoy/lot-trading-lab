package com.lot;

import static com.lot.Json.*;

import java.util.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

/** Read-only aggregate audit; never prints identities, balances, notes or credentials. */
@Component
final class Reconciliation implements ApplicationRunner {
  final Database db;
  final Accounts accounts;
  final ReplayService replays;
  final ReplayEngine engine;
  final ConfigurableApplicationContext context;

  Reconciliation(
      Database db,
      Accounts accounts,
      ReplayService replays,
      ReplayEngine engine,
      ConfigurableApplicationContext context) {
    this.db = db;
    this.accounts = accounts;
    this.replays = replays;
    this.engine = engine;
    this.context = context;
  }

  Map<String, Object> audit() {
    return db.readSnapshot(this::snapshot);
  }

  private Map<String, Object> snapshot() {
    var problems = new ArrayList<String>();
    long count = 0, orders = 0, replayCount = 0;
    for (var ref : db.rows("SELECT id FROM trading_account ORDER BY id")) {
      final long[] orderCount = {0};
      db.tx(
          () -> {
            String id = s(ref, "id");
            var a = db.one("SELECT * FROM trading_account WHERE id=?::uuid", id);
            long cash = n(a, "cash_anchor");
            var movements =
                db.rows(
                    "SELECT cash_delta,cash_after,created_at FROM trading_ledgerentry WHERE account_id=?::uuid UNION ALL SELECT cash_delta,cash_after,created_at FROM trading_ordermovement WHERE account_id=?::uuid ORDER BY created_at",
                    id,
                    id);
            for (var movement : movements) {
              cash += n(movement, "cash_delta");
              if (cash != n(movement, "cash_after")) problems.add("cash movement chain");
            }
            if (cash != n(a, "cash")) problems.add("cash anchor reconciliation");
            var reserved = accounts.reservations(id, null);
            if (reserved.cash() > cash) problems.add("cash reservation bounds");
            var positions = db.rows("SELECT * FROM trading_position WHERE account_id=?::uuid", id);
            var held = new HashMap<String, Long>();
            for (var p : positions) {
              held.put(s(p, "symbol"), n(p, "quantity"));
              if (n(p, "cost") < 0 || n(p, "quantity") < 0) problems.add("position bounds");
            }
            for (var entry : reserved.shares().entrySet())
              if (held.getOrDefault(entry.getKey(), 0L) < entry.getValue())
                problems.add("share reservation bounds");
            for (var order : db.rows("SELECT * FROM trading_order WHERE account_id=?::uuid", id)) {
              orderCount[0]++;
              long quantity = 0, total = 0;
              for (var fill : maps(map(order.get("result")).get("fills"))) {
                quantity += n(fill, "quantity");
                total += n(fill, "quantity") * n(fill, "price");
              }
              if (quantity != n(order, "executed") || total != n(order, "total"))
                problems.add("order fill totals");
              var ledger =
                  db.one(
                      "SELECT * FROM trading_ledgerentry WHERE order_id=?::uuid AND account_id=?::uuid",
                      order.get("id"),
                      id);
              long delta = ledger == null ? 0 : n(ledger, "cash_delta");
              delta +=
                  db.count(
                      "SELECT COALESCE(sum(cash_delta),0) FROM trading_ordermovement WHERE order_id=?::uuid",
                      order.get("id"));
              if (ledger == null || delta != ("buy".equals(order.get("side")) ? -total : total))
                problems.add("order ledger totals");
            }
            return null;
          });
      count++;
      orders += orderCount[0];
    }
    for (var ref : db.rows("SELECT id FROM trading_replaysession ORDER BY id")) {
      db.tx(
          () -> {
            var row = db.one("SELECT * FROM trading_replaysession WHERE id=?::uuid", ref.get("id"));
            try {
              engine.trace(row, i(map(row.get("state")), "step"), replays.events(s(row, "id")));
              var r = engine.reserved(map(row.get("state")), null);
              if (n(map(row.get("state")), "cash") < r[0]
                  || n(map(row.get("state")), "shares") < r[1])
                problems.add("replay reservation bounds");
            } catch (ApiException e) {
              problems.add("replay event reconstruction");
            }
            return null;
          });
      replayCount++;
    }
    return obj("accounts", count, "orders", orders, "replays", replayCount, "problems", problems);
  }

  @Override
  public void run(ApplicationArguments args) {
    if (args.containsOption("lot.reconcile")) {
      var result = audit();
      System.out.println("LOT_RECONCILIATION " + write(result));
      context.close();
      if (!((List<?>) result.get("problems")).isEmpty()) System.exit(1);
    }
  }
}
