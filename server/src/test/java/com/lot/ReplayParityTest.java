package com.lot;

import static com.lot.Json.*;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.*;

class ReplayParityTest {
  @TestFactory
  Stream<DynamicTest> frozenLegacyTransitions() throws Exception {
    var engine = new ReplayEngine();
    List<Map<String, Object>> cases;
    try (var stream =
        Objects.requireNonNull(getClass().getResourceAsStream("/replay-fixtures.json"))) {
      cases =
          maps(
              MAPPER.readValue(
                  new String(stream.readAllBytes(), StandardCharsets.UTF_8), List.class));
    }
    return cases.stream()
        .map(
            fixture ->
                DynamicTest.dynamicTest(
                    s(fixture, "scenario") + " / " + s(fixture, "friction"),
                    () -> {
                      var state = engine.initial(s(fixture, "scenario"), s(fixture, "friction"));
                      for (var event : maps(fixture.get("events"))) {
                        var data = map(event.get("data"));
                        engine.apply(
                            state,
                            data,
                            s(fixture, "scenario"),
                            uuid5(uuid(fixture.get("id")), s(event, "key")));
                        assertEquals(
                            canonical(event.get("state"), false),
                            canonical(state, false),
                            "State after " + data.get("action"));
                        var expected = map(event.get("metrics"));
                        var actual = engine.metrics(state, s(fixture, "scenario"));
                        for (String name : expected.keySet()) {
                          if (expected.get(name) instanceof Number value)
                            assertEquals(
                                value.doubleValue(),
                                ((Number) actual.get(name)).doubleValue(),
                                1e-10,
                                name);
                          else assertEquals(expected.get(name), actual.get(name), name);
                        }
                      }
                    }));
  }

  @Test
  void unicodeCanonicalEncoding() {
    assertEquals(
        "{\"a\":\"caf\\u00e9 \\ud83e\\udded\",\"b\":1}",
        canonical(obj("b", 1, "a", "café 🧭"), false));
    assertEquals("{\"a\": 1, \"b\": 2}", canonical(obj("b", 2L, "a", 1), true));
  }

  @Test
  void uuidFiveMatchesStandard() {
    assertEquals(
        "21f7f8de-8051-5b89-8680-0195ef798b6a",
        uuid5(UUID.fromString("6ba7b810-9dad-11d1-80b4-00c04fd430c8"), "www.widgets.com")
            .toString());
  }

  @Test
  void rejectsFractionalOrBooleanOrderSizes() throws Exception {
    var e = new ReplayEngine();
    for (Object quantity : List.of(1.5, true, -1, 10001)) {
      var state = e.initial("steady-climb", "standard");
      assertThrows(
          ApiException.class,
          () ->
              e.apply(
                  state,
                  obj(
                      "action",
                      "order",
                      "side",
                      "buy",
                      "kind",
                      "market",
                      "quantity",
                      quantity,
                      "reason",
                      "A plan"),
                  "steady-climb",
                  UUID.randomUUID()));
    }
  }

  @Test
  void limitedMarketLiquidityCannotRegenerateWithinMoment() throws Exception {
    var e = new ReplayEngine();
    var s = e.initial("steady-climb", "standard");
    e.apply(
        s,
        obj(
            "action",
            "order",
            "side",
            "buy",
            "kind",
            "market",
            "quantity",
            100,
            "reason",
            "First order"),
        "steady-climb",
        UUID.randomUUID());
    e.apply(
        s,
        obj(
            "action",
            "order",
            "side",
            "buy",
            "kind",
            "market",
            "quantity",
            100,
            "reason",
            "Second order"),
        "steady-climb",
        UUID.randomUUID());
    assertEquals(100, n(s, "shares"));
    assertEquals("cancelled", e.orders(s).getLast().get("status"));
  }

  @Test
  void publicSerializationExcludesPrivateNotes() throws Exception {
    var e = new ReplayEngine();
    var s = e.initial("steady-climb", "standard");
    e.apply(
        s,
        obj(
            "action",
            "order",
            "side",
            "buy",
            "kind",
            "market",
            "quantity",
            1,
            "reason",
            "private plan"),
        "steady-climb",
        UUID.randomUUID());
    var row =
        obj(
            "id",
            UUID.randomUUID().toString(),
            "scenario",
            "steady-climb",
            "scenario_version",
            1,
            "state",
            s,
            "share_notes",
            false,
            "created_at",
            "2026-01-01T00:00:00Z");
    var result = e.serialize(row, true);
    assertNull(result.get("id"));
    assertEquals("", e.orders(result).getFirst().get("reason"));
    assertEquals("private plan", e.orders(s).getFirst().get("reason"));
    assertEquals(1, ((List<?>) result.get("prices")).size());
  }

  @Test
  void immutableScenarioPathsHaveExpectedBounds() throws Exception {
    var e = new ReplayEngine();
    for (String scenario : e.catalog.keySet()) {
      assertEquals(10000, e.price(scenario, 0));
      assertEquals("09:30", e.clock(0));
      assertEquals("16:00", e.clock(59));
    }
  }
}
