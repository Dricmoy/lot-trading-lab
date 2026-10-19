package com.lot;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PortfolioHistoryTest {
  private List<Map<String, Object>> points(int count) {
    var points = new ArrayList<Map<String, Object>>();
    for (int index = 0; index < count; index++)
      points.add(
          Json.obj(
              "time",
              Instant.EPOCH.plusSeconds(index * 60L).toString(),
              "value",
              10000L,
              "benchmark",
              10000L));
    return points;
  }

  @ParameterizedTest
  @ValueSource(ints = {0, 1, 2, 239, 240})
  void leavesSmallHistoriesUnchanged(int count) {
    var points = points(count);
    assertEquals(points, PortfolioHistory.sample(points));
  }

  @ParameterizedTest
  @ValueSource(ints = {241, 479, 480, 4999, 5000})
  void boundsLongHistoriesAndKeepsOriginalOrderedEndpoints(int count) {
    var points = points(count);
    var selected = PortfolioHistory.sample(points);
    assertTrue(selected.size() <= 240, "Selected " + selected.size() + " points");
    assertSame(points.getFirst(), selected.getFirst());
    assertSame(points.getLast(), selected.getLast());
    var previous = Instant.MIN;
    for (var point : selected) {
      var time = Instant.parse(Json.s(point, "time"));
      assertTrue(time.isAfter(previous));
      assertSame(points.get((int) (time.getEpochSecond() / 60)), point);
      previous = time;
    }
  }

  @Test
  void keepsBothSeriesBriefExtremes() {
    var points = points(5000);
    points.get(1).put("value", 5000L);
    points.get(2).put("value", 15000L);
    points.get(3).put("benchmark", 20000L);
    points.get(4).put("benchmark", 3000L);
    var selected = PortfolioHistory.sample(points);
    for (int index = 1; index <= 4; index++) assertTrue(selected.contains(points.get(index)));
  }

  @Test
  void keepsDrawdownPeakBeforeTheTroughEvenWithALaterHigherBucketPeak() {
    var points = points(5000);
    points.get(1).put("value", 11000L);
    points.get(2).put("value", 5500L);
    points.get(3).put("value", 12000L);
    var selected = PortfolioHistory.sample(points);
    assertTrue(selected.contains(points.get(1)), "The actual drawdown peak must remain visible");
    assertTrue(selected.contains(points.get(2)), "The actual drawdown trough must remain visible");
  }

  @Test
  void selectionIsDeterministicAndDoesNotMutateInputs() {
    var random = new Random(19);
    var points = points(5000);
    for (var point : points) {
      point.put("value", random.nextLong(1, 50000));
      point.put("benchmark", random.nextLong(1, 50000));
    }
    var frozen = points.stream().map(Map::copyOf).toList();
    assertEquals(PortfolioHistory.sample(frozen), PortfolioHistory.sample(frozen));
    assertEquals(points, frozen);
    var selected = PortfolioHistory.sample(frozen);
    assertEquals(drawdown(frozen), drawdown(selected), 1e-12);
    for (int bucket = 0; bucket < 59; bucket++) {
      var slice =
          frozen.subList(
              1 + (frozen.size() - 2) * bucket / 59, 1 + (frozen.size() - 2) * (bucket + 1) / 59);
      for (String series : List.of("value", "benchmark")) {
        var comparator = Comparator.<Map<String, Object>>comparingLong(p -> Json.n(p, series));
        assertTrue(selected.contains(Collections.min(slice, comparator)));
        assertTrue(selected.contains(Collections.max(slice, comparator)));
      }
    }
    assertTrue(selected.size() <= 240);
  }

  private double drawdown(List<Map<String, Object>> points) {
    long peak = Json.n(points.getFirst(), "value");
    double result = 0;
    for (var point : points) {
      long value = Json.n(point, "value");
      peak = Math.max(peak, value);
      result = Math.max(result, (peak - value) / (double) Math.max(1, peak));
    }
    return result;
  }
}
