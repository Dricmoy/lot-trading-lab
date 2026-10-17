package com.lot;

import static com.lot.Json.*;

import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
final class ReplayController {
  final Identity identity;
  final ReplayService replay;

  ReplayController(Identity identity, ReplayService replay) {
    this.identity = identity;
    this.replay = replay;
  }

  @GetMapping("/replay")
  Map<String, Object> catalog(HttpServletRequest request) {
    return replay.catalog(identity.require(request).accountId());
  }

  @PostMapping("/replay")
  Map<String, Object> start(
      @RequestBody Map<String, Object> data,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      HttpServletRequest request,
      HttpServletResponse response) {
    var result = replay.start(identity.require(request).accountId(), data, uuid(key));
    response.setStatus(201);
    return result;
  }

  @GetMapping("/replay/{id}")
  Map<String, Object> detail(@PathVariable UUID id, HttpServletRequest request) {
    return replay.detail(identity.require(request).accountId(), id);
  }

  @PostMapping("/replay/{id}")
  Map<String, Object> action(
      @PathVariable UUID id,
      @RequestBody Map<String, Object> data,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      HttpServletRequest request) {
    return replay.act(identity.require(request).accountId(), id, data, uuid(key));
  }

  @GetMapping("/replay/shared/{token}")
  Map<String, Object> shared(@PathVariable UUID token) {
    return replay.shared(token);
  }

  @GetMapping("/replay/compare")
  Map<String, Object> comparison(
      @RequestParam String first, @RequestParam String second, HttpServletRequest request) {
    return replay.comparison(identity.require(request).accountId(), uuid(first), uuid(second));
  }

  @GetMapping("/replay/compare/example")
  Map<String, Object> example() {
    return replay.example();
  }

  @PostMapping("/learning-metrics")
  Map<String, Object> metrics(HttpServletRequest request) {
    if (!identity.context(request).owner())
      throw new ApiException(403, "Private workspace required.");
    return replay.counters();
  }
}
