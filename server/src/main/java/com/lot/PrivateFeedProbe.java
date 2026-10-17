package com.lot;

import static com.lot.Json.*;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Opt-in deployment verification. Logs counts only; never submits provider orders. */
@Component
final class PrivateFeedProbe implements ApplicationRunner {
  private final MarketData market;

  PrivateFeedProbe(MarketData market) {
    this.market = market;
  }

  @Override
  public void run(ApplicationArguments args) {
    if (!"1".equals(System.getenv("LOT_VERIFY_PRIVATE"))) return;
    try {
      var quotes = market.market(true, "HOOD");
      var assets = maps(quotes.get("assets"));
      var selected =
          assets.stream().filter(a -> "HOOD".equals(a.get("symbol"))).findFirst().orElseThrow();
      var news = market.news("HOOD");
      System.out.println(
          "LOT_PRIVATE_FEED_CHECK "
              + write(
                  obj(
                      "status",
                      "ok",
                      "source",
                      quotes.get("source"),
                      "assets",
                      assets.size(),
                      "bars",
                      ((java.util.List<?>) selected.get("history")).size(),
                      "articles",
                      ((java.util.List<?>) news.get("articles")).size(),
                      "matching_engine",
                      "C++")));
    } catch (Exception e) {
      System.out.println(
          "LOT_PRIVATE_FEED_CHECK "
              + write(obj("status", "unavailable", "error_type", e.getClass().getSimpleName())));
    }
  }
}
