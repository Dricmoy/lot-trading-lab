package com.lot;

import static com.lot.Json.*;

import java.math.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
final class MarketData {
  static final List<String> SYMBOLS =
      List.of("NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOGL", "COIN", "HOOD");
  private static final String[] NAMES = {
    "NVIDIA", "Apple", "Tesla", "Microsoft", "Amazon", "Alphabet", "Coinbase", "Robinhood Markets"
  };
  private static final String[] SECTORS = {
    "Semiconductors",
    "Consumer technology",
    "Electric vehicles",
    "Software",
    "E-commerce",
    "Internet services",
    "Financial technology",
    "Financial technology"
  };
  private static final long[] PRICES = {17836, 23749, 34622, 51263, 22874, 20538, 31258, 11842},
      PREVIOUS = {17440, 23561, 35148, 50820, 22610, 20375, 31920, 11512};
  private final HttpClient client =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(7)).build();
  private List<Map<String, Object>> quotes;
  private Instant quotesAt = Instant.EPOCH;

  private record Chart(List<Long> prices, List<String> times, Instant at) {}

  private final Map<String, Chart> charts = new HashMap<>();
  final MatchingEngine engine;

  MarketData(MatchingEngine engine) {
    this.engine = engine;
  }

  static void symbol(String symbol) {
    if (!SYMBOLS.contains(symbol)) throw new ApiException(400, "Unknown symbol.");
  }

  List<Map<String, Object>> synthetic() {
    long tick = Instant.now().getEpochSecond() / 15;
    var assets = new ArrayList<Map<String, Object>>();
    for (int i = 0; i < SYMBOLS.size(); i++) {
      var history = new ArrayList<Long>();
      long price = PRICES[i] + (long) (Math.sin(tick * .31 + i) * PRICES[i] * .0008);
      for (int j = 0; j < 96; j++) {
        double wave = Math.sin(j * .24 + i) * .0018 + Math.sin(j * 1.9 + i) * .0007;
        history.add((long) (PREVIOUS[i] + (PRICES[i] - PREVIOUS[i]) * j / 95.0 + PRICES[i] * wave));
      }
      history.set(95, price);
      assets.add(
          obj(
              "symbol",
              SYMBOLS.get(i),
              "name",
              NAMES[i],
              "sector",
              SECTORS[i],
              "price",
              price,
              "previous",
              PREVIOUS[i],
              "history",
              history));
    }
    return assets;
  }

  private Map<String, Object> provider(String path) {
    String key = Identity.env("ALPACA_API_KEY_ID", ""),
        secret = Identity.env("ALPACA_API_SECRET_KEY", "");
    if (key.isBlank() || secret.isBlank())
      throw new ApiException(503, "Private market data is not configured.");
    try {
      var request =
          HttpRequest.newBuilder(URI.create("https://data.alpaca.markets" + path))
              .timeout(Duration.ofSeconds(7))
              .header("APCA-API-KEY-ID", key)
              .header("APCA-API-SECRET-KEY", secret)
              .GET()
              .build();
      var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
      try (var body = response.body()) {
        byte[] bytes = body.readNBytes(4 * 1024 * 1024 + 1);
        if (response.statusCode() != 200 || bytes.length > 4 * 1024 * 1024)
          throw new ApiException(503, "The private market feed is unavailable.");
        return parse(new String(bytes, StandardCharsets.UTF_8));
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new ApiException(503, "The market request was interrupted.");
    } catch (Exception e) {
      throw new ApiException(
          503, "The private market feed is unavailable. Please try again later.");
    }
  }

  private long cents(Object value) {
    try {
      long n =
          new BigDecimal(value.toString())
              .multiply(BigDecimal.valueOf(100))
              .setScale(0, RoundingMode.HALF_UP)
              .longValueExact();
      if (n < 25 || n > 100000000) throw new IllegalArgumentException();
      return n;
    } catch (Exception e) {
      throw new ApiException(503, "Market prices were invalid. Trading paused.");
    }
  }

  synchronized List<Map<String, Object>> privateAssets(String symbol, boolean withHistory) {
    try {
      return refreshPrivateAssets(symbol, withHistory);
    } catch (ApiException e) {
      throw e;
    } catch (RuntimeException e) {
      throw new ApiException(503, "The private market feed returned invalid data. Trading paused.");
    }
  }

  private List<Map<String, Object>> refreshPrivateAssets(String symbol, boolean withHistory) {
    Instant now = Instant.now();
    if (quotes == null || quotesAt.plusSeconds(30).isBefore(now)) {
      var data = provider("/v2/stocks/snapshots?feed=iex&symbols=" + String.join(",", SYMBOLS));
      var fresh = new ArrayList<Map<String, Object>>();
      for (int i = 0; i < SYMBOLS.size(); i++) {
        var snapshot = map(data.get(SYMBOLS.get(i)));
        if (snapshot == null) throw new ApiException(503, "The private quote is incomplete.");
        var trade = map(snapshot.get("latestTrade"));
        var previous = map(snapshot.get("prevDailyBar"));
        if (trade == null || previous == null)
          throw new ApiException(503, "The private quote is incomplete.");
        String time = s(trade, "t");
        try {
          Instant.parse(time);
        } catch (Exception e) {
          throw new ApiException(503, "The private quote timestamp is invalid.");
        }
        fresh.add(
            obj(
                "symbol",
                SYMBOLS.get(i),
                "name",
                NAMES[i],
                "sector",
                SECTORS[i],
                "price",
                cents(trade.get("p")),
                "previous",
                cents(previous.get("c")),
                "history",
                new ArrayList<>(),
                "quote_time",
                time));
      }
      quotes = fresh;
      quotesAt = now;
    }
    if (withHistory) {
      Chart chart = charts.get(symbol);
      if (chart == null || chart.at().plusSeconds(60).isBefore(now)) {
        String query =
            "feed=iex&timeframe=5Min&start="
                + URLEncoder.encode(
                    now.minus(Duration.ofDays(10)).toString(), StandardCharsets.UTF_8)
                + "&end="
                + URLEncoder.encode(now.toString(), StandardCharsets.UTF_8)
                + "&limit=1000&sort=desc&adjustment=split";
        var data = provider("/v2/stocks/" + symbol + "/bars?" + query);
        var bars = maps(data.get("bars"));
        if (bars == null) throw new ApiException(503, "Recent chart bars are unavailable.");
        var values = new ArrayList<Long>();
        var times = new ArrayList<String>();
        String day = null;
        for (var bar : bars) {
          String time = s(bar, "t");
          var local = Instant.parse(time).atZone(ZoneId.of("America/New_York"));
          int minute = local.getHour() * 60 + local.getMinute();
          if (minute < 570 || minute >= 960) continue;
          String date = local.toLocalDate().toString();
          if (day == null) day = date;
          if (!day.equals(date)) break;
          values.add(cents(bar.get("c")));
          times.add(time);
        }
        if (values.isEmpty()) throw new ApiException(503, "Regular-session bars are unavailable.");
        Collections.reverse(values);
        Collections.reverse(times);
        chart = new Chart(values, times, now);
        charts.put(symbol, chart);
      }
    }
    var result = new ArrayList<Map<String, Object>>();
    for (var original : quotes) {
      var a = new LinkedHashMap<>(original);
      Chart chart = charts.get(s(a, "symbol"));
      if (chart != null && symbol.equals(a.get("symbol"))) {
        a.put("history", chart.prices());
        a.put("history_times", chart.times());
      }
      result.add(a);
    }
    return result;
  }

  List<Map<String, Object>> assets(boolean owner, String symbol, boolean history) {
    symbol(symbol);
    return owner ? privateAssets(symbol, history) : synthetic();
  }

  long price(List<Map<String, Object>> assets, String symbol) {
    return assets.stream()
        .filter(a -> symbol.equals(a.get("symbol")))
        .mapToLong(a -> n(a, "price"))
        .findFirst()
        .orElseThrow();
  }

  Map<String, Object> market(boolean owner, String symbol) {
    var assets = assets(owner, symbol, true);
    return obj(
        "assets",
        assets,
        "book",
        engine.book(price(assets, symbol)),
        "as_of",
        Instant.now().toString(),
        "source",
        owner ? "alpaca-iex" : "simulated",
        "engine",
        "C++");
  }

  Map<String, Object> execute(boolean owner, Map<String, Object> order) {
    String symbol = s(order, "symbol");
    return engine.match(order, price(assets(owner, symbol, false), symbol));
  }

  Map<String, Object> news(String symbol) {
    symbol(symbol);
    var data =
        provider("/v1beta1/news?symbols=" + symbol + "&limit=5&sort=desc&include_content=false");
    var articles = new ArrayList<Map<String, Object>>();
    if (!(data.getOrDefault("news", List.of()) instanceof List<?>))
      throw new ApiException(503, "The news feed is unavailable.");
    for (var raw : (List<?>) data.getOrDefault("news", List.of())) {
      if (!(raw instanceof Map<?, ?>)) continue;
      var a = map(raw);
      String url = Objects.toString(a.get("url"), "");
      try {
        if (!Set.of("http", "https").contains(URI.create(url).getScheme())) continue;
      } catch (Exception e) {
        continue;
      }
      String headline = Objects.toString(a.get("headline"), ""),
          source = Objects.toString(a.get("source"), "Alpaca news");
      articles.add(
          obj(
              "id",
              Objects.toString(a.get("id"), ""),
              "headline",
              headline.substring(0, Math.min(500, headline.length())),
              "source",
              source.substring(0, Math.min(80, source.length())),
              "published_at",
              a.get("created_at"),
              "url",
              url));
      if (articles.size() == 5) break;
    }
    return obj("articles", articles, "available", true, "source", "Alpaca news", "symbol", symbol);
  }
}
