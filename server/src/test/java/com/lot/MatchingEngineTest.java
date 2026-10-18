package com.lot;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MatchingEngineTest {
  @Test
  void acceptsOneObjectWithTrailingWhitespace() {
    var expected =
        Json.obj("fills", java.util.List.of(), "quantity", 0, "total", 0, "status", "cancelled");
    assertEquals(
        expected,
        MatchingEngine.decode((Json.write(expected) + "\n ").getBytes(StandardCharsets.UTF_8)));
  }

  @ParameterizedTest
  @ValueSource(strings = {"", " ", "{", "null", "[]", "42", "\"text\"", "{} {}", "{} garbage"})
  void rejectsInvalidResponsesWithSafeServiceError(String output) {
    var error =
        assertThrows(
            ApiException.class,
            () -> MatchingEngine.decode(output.getBytes(StandardCharsets.UTF_8)));
    assertEquals(503, error.status);
    assertEquals("Execution data was invalid. No funds were changed.", error.getMessage());
  }

  @Test
  void rejectsInvalidUtf8WithoutReplacingBytes() {
    byte[] output = {'{', '"', 'x', '"', ':', '"', (byte) 0xc3, (byte) 0x28, '"', '}'};
    assertEquals(503, assertThrows(ApiException.class, () -> MatchingEngine.decode(output)).status);
  }
}
