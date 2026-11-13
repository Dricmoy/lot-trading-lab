package com.lot;

import static com.lot.Json.*;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.*;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;

@Service
final class MatchingEngine {
  private final Semaphore permits = new Semaphore(8);
  private final MeterRegistry metrics;

  MatchingEngine(MeterRegistry metrics) {
    this.metrics = metrics;
  }

  Map<String, Object> book(long price) {
    return run("book " + price);
  }

  Map<String, Object> match(Map<String, Object> order, long price) {
    return run(
        "match "
            + order.get("side")
            + " "
            + order.get("kind")
            + " "
            + order.get("quantity")
            + " "
            + order.get("limit")
            + " "
            + price);
  }

  private Map<String, Object> run(String command) {
    Process child = null;
    boolean acquired = false;
    try {
      long waitStarted = System.nanoTime();
      acquired = permits.tryAcquire(2, TimeUnit.SECONDS);
      metrics
          .timer("lot.matching.permit.wait", "acquired", Boolean.toString(acquired))
          .record(System.nanoTime() - waitStarted, TimeUnit.NANOSECONDS);
      if (!acquired)
        throw new ApiException(503, "The execution service is busy. Retry the same request.");
      Timer.Sample spawned = Timer.start(metrics);
      String outcome = "error";
      try {
        child =
            new ProcessBuilder(Identity.env("LOT_MATCHING_BINARY", "matching/build/lot-matching"))
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start();
        try (var out = child.getOutputStream()) {
          out.write((command + "\n").getBytes(StandardCharsets.US_ASCII));
        }
        if (!child.waitFor(3, TimeUnit.SECONDS)) {
          child.destroyForcibly();
          throw new ApiException(503, "Execution timed out. No funds were changed.");
        }
        byte[] bytes = child.getInputStream().readNBytes(65537);
        if (child.exitValue() != 0 || bytes.length > 65536)
          throw new ApiException(
              503, "The execution service rejected its input. No funds were changed.");
        var result = decode(bytes);
        outcome = "ok";
        return result;
      } finally {
        spawned.stop(
            Timer.builder("lot.matching.subprocess")
                .description("C++ matcher round trip: process start, stdin, wait, stdout decode")
                .tag("outcome", outcome)
                .register(metrics));
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new ApiException(503, "Execution was interrupted. Retry the same request.");
    } catch (java.io.IOException e) {
      throw new ApiException(503, "The execution service is unavailable. No funds were changed.");
    } finally {
      if (child != null && child.isAlive()) child.destroyForcibly();
      if (acquired) permits.release();
    }
  }

  static Map<String, Object> decode(byte[] bytes) {
    try {
      Map<String, Object> result =
          MAPPER
              .readerFor(Map.class)
              .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
              .readValue(bytes);
      if (result != null) return result;
    } catch (JacksonException e) {
      // The executable is a service boundary; parser details stay out of API responses.
    }
    throw new ApiException(503, "Execution data was invalid. No funds were changed.");
  }
}
