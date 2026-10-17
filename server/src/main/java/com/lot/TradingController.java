package com.lot;

import static com.lot.Json.*;

import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
final class TradingController {
  final Identity identity;
  final Database db;
  final Accounts accounts;
  final MarketData market;
  final PortfolioHistory history;

  TradingController(
      Identity identity,
      Database db,
      Accounts accounts,
      MarketData market,
      PortfolioHistory history) {
    this.identity = identity;
    this.db = db;
    this.accounts = accounts;
    this.market = market;
    this.history = history;
  }

  @GetMapping("/health")
  Map<String, Object> health() {
    db.count("SELECT 1");
    return obj(
        "status",
        "ok",
        "service",
        "Spring Boot ledger",
        "language",
        "Java",
        "matching_engine",
        "C++",
        "market_data",
        "simulated");
  }

  @GetMapping("/account")
  Map<String, Object> account(HttpServletRequest request, HttpServletResponse response) {
    Object csrf = request.getAttribute(CsrfToken.class.getName());
    if (csrf instanceof CsrfToken t) t.getToken();
    var c = identity.context(request);
    String id = c.accountId();
    if (id == null) id = db.tx(() -> accounts.create(true, null, null));
    if (c.user() == null && !c.owner()) identity.guestCookie(response, id);
    return accounts.serialize(id);
  }

  @PostMapping("/orders")
  Map<String, Object> place(
      @RequestBody Map<String, Object> body,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      HttpServletRequest request,
      HttpServletResponse response) {
    var c = identity.require(request);
    var result = accounts.place(c.accountId(), body, uuid(key));
    response.setStatus(Boolean.TRUE.equals(result.get("replayed")) ? 200 : 201);
    return result;
  }

  @PostMapping("/orders/settle")
  Map<String, Object> settle(HttpServletRequest request) {
    return accounts.settle(identity.require(request).accountId());
  }

  @PostMapping("/orders/cancel")
  Map<String, Object> cancel(@RequestBody Map<String, Object> data, HttpServletRequest request) {
    return accounts.cancel(identity.require(request).accountId(), uuid(data.get("order_id")));
  }

  @PostMapping("/orders/journal")
  Map<String, Object> journal(@RequestBody Map<String, Object> data, HttpServletRequest request) {
    return accounts.reflect(
        identity.require(request).accountId(),
        uuid(data.get("order_id")),
        text(data.getOrDefault("reflection", ""), "a reflection", false));
  }

  @PostMapping("/reset")
  Map<String, Object> reset(HttpServletRequest request) {
    return accounts.reset(identity.require(request).accountId());
  }

  @PostMapping("/preferences")
  Map<String, Object> preferences(
      @RequestBody Map<String, Object> data, HttpServletRequest request) {
    return accounts.preferences(identity.require(request).accountId(), data);
  }

  @PostMapping("/connect")
  Map<String, Object> connect(
      @RequestBody Map<String, Object> data,
      HttpServletRequest request,
      HttpServletResponse response) {
    String configured = Identity.env("LOT_OWNER_ACCESS_TOKEN", "");
    Object token = data.get("token");
    if (identity.ownerId() == null
        || !(token instanceof String t)
        || !java.security.MessageDigest.isEqual(
            t.getBytes(java.nio.charset.StandardCharsets.UTF_8),
            configured.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
      throw new ApiException(403, "Private access token is invalid.");
    return db.tx(
        () -> {
          String id = identity.ownerId().toString();
          db.update(
              "INSERT INTO trading_account(id,cash,cash_anchor,created_at,watchlist,history_epoch,revision) VALUES (?::uuid,10000000,10000000,clock_timestamp(),'[]'::jsonb,?::uuid,0) ON CONFLICT(id) DO NOTHING",
              id,
              UUID.randomUUID().toString());
          var user = identity.context(request).user();
          identity.login(request, response, user, id, true);
          return accounts.serialize(id);
        });
  }

  @GetMapping("/market")
  Map<String, Object> market(
      @RequestParam(defaultValue = "NVDA") String symbol, HttpServletRequest request) {
    var c = identity.require(request);
    var data = market.market(c.owner(), symbol);
    history.observe(c.accountId(), data);
    return data;
  }

  @GetMapping("/engine")
  Map<String, Object> engine(@RequestParam(defaultValue = "NVDA") String symbol) {
    return market.market(false, symbol);
  }

  @PostMapping("/engine")
  Map<String, Object> execute(@RequestBody Map<String, Object> data) {
    if (!Set.of("symbol", "side", "kind", "quantity", "limit").containsAll(data.keySet()))
      throw new ApiException(400, "Invalid order.");
    var order = accounts.validateOrder(data);
    return market.execute(false, order);
  }

  @GetMapping("/portfolio/history")
  Map<String, Object> history(
      @RequestParam(defaultValue = "7") int days, HttpServletRequest request) {
    return history.get(identity.require(request).accountId(), days);
  }

  @GetMapping("/news")
  Map<String, Object> news(
      @RequestParam(defaultValue = "NVDA") String symbol, HttpServletRequest request) {
    return identity.context(request).owner()
        ? market.news(symbol)
        : obj("articles", List.of(), "available", false);
  }
}
