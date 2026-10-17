package com.lot;

import static com.lot.Json.*;

import java.util.*;
import org.springframework.stereotype.Service;

@Service
final class ReplayService {
  final Database db;
  final ReplayEngine engine;

  ReplayService(Database db, ReplayEngine engine) {
    this.db = db;
    this.engine = engine;
  }

  Map<String, Object> catalog(String account) {
    var scenarios = new ArrayList<Map<String, Object>>();
    for (var item : engine.catalog.entrySet()) {
      var scenario = new LinkedHashMap<>(map(item.getValue()));
      scenario.remove("news");
      scenario.put("id", item.getKey());
      scenarios.add(scenario);
    }
    var sessions =
        db.rows(
            "SELECT id,scenario,scenario_version,created_at,state->>'friction' AS friction,(state->>'step')::integer AS step,(state->>'finished')::boolean AS finished,(state->>'cash')::bigint AS cash,(state->>'shares')::bigint AS shares FROM trading_replaysession WHERE account_id=?::uuid ORDER BY created_at DESC,id DESC LIMIT 200",
            account);
    for (var row : sessions) {
      String scenario = s(row, "scenario");
      long value = n(row, "cash") + n(row, "shares") * engine.price(scenario, n(row, "step"));
      row.put("title", map(engine.catalog.get(scenario)).get("title"));
      row.put("return", (value - ReplayEngine.START) / (double) ReplayEngine.START * 100);
      row.remove("cash");
      row.remove("shares");
    }
    return obj("scenarios", scenarios, "sessions", sessions, "friction", engine.frictions);
  }

  Map<String, Object> start(String account, Map<String, Object> data, UUID key) {
    Object scenario = data.get("scenario"), friction = data.getOrDefault("friction", "standard");
    if (!(scenario instanceof String)
        || !(friction instanceof String)
        || !engine.catalog.containsKey(scenario)
        || !engine.frictions.containsKey(friction))
      throw new ApiException(400, "Choose an available scenario and execution setting.");
    String digest = fingerprint(data);
    return db.tx(
        () -> {
          db.lockAccount(account);
          var session =
              db.one(
                  "SELECT * FROM trading_replaysession WHERE account_id=?::uuid AND start_key=?",
                  account,
                  key);
          if (session != null && !digest.equals(session.get("start_fingerprint")))
            throw new ApiException(409, "This request key was used for a different session.");
          if (session == null) {
            if (db.count(
                    "SELECT count(*) FROM trading_replaysession WHERE account_id=?::uuid", account)
                >= 200)
              throw new ApiException(
                  429,
                  "Your workspace has reached 200 saved sessions. Resume an existing session.");
            String id = UUID.randomUUID().toString();
            db.update(
                "INSERT INTO trading_replaysession(id,account_id,scenario,scenario_version,start_key,start_fingerprint,state,share_notes,created_at,updated_at) VALUES (?::uuid,?::uuid,?,1,?,?,?::jsonb,false,clock_timestamp(),clock_timestamp())",
                id,
                account,
                scenario,
                key,
                digest,
                write(engine.initial((String) scenario, (String) friction)));
            session = db.one("SELECT * FROM trading_replaysession WHERE id=?::uuid", id);
          }
          return obj("session", engine.serialize(session, false));
        });
  }

  private Map<String, Object> owned(String account, UUID id, boolean lock) {
    var session =
        db.one(
            "SELECT * FROM trading_replaysession WHERE account_id=?::uuid AND id=?"
                + (lock ? " FOR UPDATE" : ""),
            account,
            id);
    if (session == null)
      throw new ApiException(404, "This session was not found in your workspace.");
    return session;
  }

  Map<String, Object> detail(String account, UUID id) {
    return obj("session", engine.serialize(owned(account, id, false), false));
  }

  Map<String, Object> act(String account, UUID id, Map<String, Object> data, UUID key) {
    String digest = fingerprint(data);
    return db.tx(
        () -> {
          var row = owned(account, id, true);
          var event =
              db.one("SELECT * FROM trading_replayevent WHERE session_id=? AND key=?", id, key);
          if (event != null) {
            if (!digest.equals(event.get("fingerprint")))
              throw new ApiException(409, "This request key was used for a different action.");
          } else {
            var state = map(row.get("state"));
            if (!integer(data.get("revision")) || n(data, "revision") != n(state, "revision"))
              throw new ApiException(
                  409, "This session changed in another tab. Reload it before continuing.");
            if (db.count("SELECT count(*) FROM trading_replayevent WHERE session_id=?", id) >= 1000)
              throw new ApiException(429, "This session has reached its action limit.");
            engine.apply(state, data, s(row, "scenario"), uuid5(id, key.toString()));
            if ("share".equals(data.get("action"))) {
              if (row.get("shared_token") == null)
                row.put("shared_token", UUID.randomUUID().toString());
              row.put("share_notes", data.getOrDefault("include_notes", false));
            } else if ("unshare".equals(data.get("action"))) {
              row.put("shared_token", null);
              row.put("share_notes", false);
            }
            db.update(
                "UPDATE trading_replaysession SET state=?::jsonb,shared_token=?::uuid,share_notes=?,updated_at=clock_timestamp() WHERE id=?",
                write(state),
                row.get("shared_token"),
                row.get("share_notes"),
                id);
            db.update(
                "INSERT INTO trading_replayevent(session_id,key,fingerprint,action,payload,created_at) VALUES (?,?,?,?,?::jsonb,clock_timestamp())",
                id,
                key,
                digest,
                data.get("action"),
                write(data));
          }
          return obj("session", engine.serialize(row, false), "replayed", event != null);
        });
  }

  List<Map<String, Object>> events(String id) {
    return db.rows(
        "SELECT * FROM trading_replayevent WHERE session_id=?::uuid ORDER BY created_at,id", id);
  }

  Map<String, Object> shared(UUID token) {
    var row = db.one("SELECT * FROM trading_replaysession WHERE shared_token=?", token);
    if (row == null || !b(map(row.get("state")), "finished"))
      throw new ApiException(404, "This recap is unavailable or its sharing link was revoked.");
    return obj("session", engine.serialize(row, true));
  }

  Map<String, Object> comparison(String account, UUID first, UUID second) {
    if (first.equals(second)) throw new ApiException(400, "Choose two different attempts.");
    return db.tx(
        () -> {
          var rows =
              db.rows(
                  "SELECT * FROM trading_replaysession WHERE account_id=?::uuid AND id IN (?,?) ORDER BY id FOR UPDATE",
                  account,
                  first,
                  second);
          if (rows.size() != 2)
            throw new ApiException(404, "An attempt was not found in your workspace.");
          var byId = new HashMap<String, Map<String, Object>>();
          for (var row : rows) byId.put(s(row, "id"), row);
          var a = byId.get(first.toString());
          var b = byId.get(second.toString());
          if (!Json.b(map(a.get("state")), "finished") || !Json.b(map(b.get("state")), "finished"))
            throw new ApiException(409, "Finish both attempts before comparing their decisions.");
          if (!a.get("scenario").equals(b.get("scenario"))
              || n(a, "scenario_version") != n(b, "scenario_version"))
            throw new ApiException(400, "Choose attempts from the same scenario and version.");
          if (n(a, "scenario_version") != 1)
            throw new ApiException(409, "Comparison is unavailable for this scenario version.");
          int cutoff = Math.min(i(map(a.get("state")), "step"), i(map(b.get("state")), "step"));
          var attempts = new ArrayList<Map<String, Object>>();
          for (var row : List.of(a, b))
            attempts.add(engine.trace(row, cutoff, events(s(row, "id"))));
          return comparisonResponse(s(a, "scenario"), cutoff, attempts, false);
        });
  }

  private Map<String, Object> comparisonResponse(
      String scenario, int cutoff, List<Map<String, Object>> attempts, boolean example) {
    int common = 0;
    var a = maps(attempts.get(0).get("decisions"));
    var b = maps(attempts.get(1).get("decisions"));
    while (common < Math.min(a.size(), b.size())
        && fingerprint(a.get(common).get("choice"))
            .equals(fingerprint(b.get(common).get("choice")))) common++;
    for (var attempt : attempts)
      for (var decision : maps(attempt.get("decisions"))) decision.remove("choice");
    var response =
        obj(
            "scenario",
            scenario,
            "title",
            map(engine.catalog.get(scenario)).get("title"),
            "cutoff",
            cutoff,
            "clock",
            engine.clock(cutoff),
            "shared_decisions",
            common,
            "attempts",
            attempts,
            "different_conditions",
            !attempts.get(0).get("friction").equals(attempts.get(1).get("friction")));
    if (example) response.put("example", true);
    return response;
  }

  private final class Example {
    final String id;
    final Map<String, Object> state = engine.initial("sudden-selloff", "standard");
    final List<Map<String, Object>> events = new ArrayList<>();

    Example(int index) {
      id = uuid5(Identity.URL_NAMESPACE, "lot-scripted-comparison-" + index).toString();
    }

    void record(Map<String, Object> body) {
      var data = new LinkedHashMap<>(body);
      data.put("revision", state.get("revision"));
      UUID key = uuid5(uuid(id), Integer.toString(events.size()));
      events.add(
          obj(
              "id",
              "example-" + id + "-" + events.size(),
              "key",
              key.toString(),
              "payload",
              copy(data),
              "fingerprint",
              fingerprint(data)));
      engine.apply(state, data, "sudden-selloff", uuid5(uuid(id), key.toString()));
    }

    void order(int step, String side, String kind, int quantity, int limit, String reason) {
      while (n(state, "step") < step)
        record(obj("action", "advance", "count", Math.min(5, step - n(state, "step"))));
      record(
          obj(
              "action",
              "order",
              "side",
              side,
              "kind",
              kind,
              "quantity",
              quantity,
              "limit",
              limit,
              "reason",
              reason));
    }

    Map<String, Object> finish() {
      while (n(state, "step") < 59)
        record(obj("action", "advance", "count", Math.min(5, 59 - n(state, "step"))));
      return engine.trace(
          obj(
              "id",
              id,
              "scenario",
              "sudden-selloff",
              "state",
              state,
              "created_at",
              "2026-01-01T00:00:00Z"),
          59,
          events);
    }
  }

  Map<String, Object> example() {
    var a = new Example(0);
    a.order(0, "buy", "market", 50, 0, "Start small while the outlook is unchanged.");
    a.order(14, "buy", "market", 150, 0, "Add to the position after the opening rise.");
    a.order(19, "buy", "limit", 50, 10120, "Add only if the price returns to my entry.");
    a.order(26, "sell", "market", 100, 0, "Reduce exposure after the revised outlook.");
    var b = new Example(1);
    b.order(0, "buy", "market", 50, 0, "Start small and reassess as new information arrives.");
    b.order(14, "sell", "market", 30, 0, "Reduce the position before the next update.");
    b.order(20, "sell", "market", 20, 0, "Exit the remaining position after guidance changes.");
    return comparisonResponse(
        "sudden-selloff", 59, new ArrayList<>(List.of(a.finish(), b.finish())), true);
  }

  Map<String, Object> counters() {
    var sessions = db.rows("SELECT account_id,state FROM trading_replaysession");
    long trades = 0, finished = 0, full = 0;
    var accounts = new HashMap<String, Integer>();
    for (var row : sessions) {
      var state = map(row.get("state"));
      if (engine.orders(state).stream().anyMatch(o -> n(o, "executed") > 0)) trades++;
      if (b(state, "finished")) finished++;
      if (b(state, "finished") && n(state, "step") == 59) full++;
      accounts.merge(s(row, "account_id"), 1, Integer::sum);
    }
    return obj(
        "starts",
        sessions.size(),
        "sessions_with_fills",
        trades,
        "finished",
        finished,
        "full_day_finishes",
        full,
        "early_finishes",
        finished - full,
        "workspaces_with_repeat_sessions",
        accounts.values().stream().filter(v -> v > 1).count(),
        "unique_workspaces",
        accounts.size(),
        "note",
        "Counts describe workspaces, including disposable verification sessions; they are not verified people or retention cohorts.");
  }
}
