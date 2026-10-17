package com.lot;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

/** Canonical encodings preserve the fingerprints of pre-migration Python events. */
@SuppressWarnings("unchecked")
final class Json {
  static final JsonMapper MAPPER = JsonMapper.builder().build();

  static Map<String, Object> obj(Object... pairs) {
    var out = new LinkedHashMap<String, Object>();
    for (int i = 0; i < pairs.length; i += 2) out.put((String) pairs[i], pairs[i + 1]);
    return out;
  }

  static Map<String, Object> map(Object value) {
    return (Map<String, Object>) value;
  }

  static List<Map<String, Object>> maps(Object value) {
    return (List<Map<String, Object>>) value;
  }

  static Map<String, Object> parse(String text) {
    return MAPPER.readValue(text, Map.class);
  }

  static String write(Object value) {
    return MAPPER.writeValueAsString(value);
  }

  static Map<String, Object> copy(Map<String, Object> value) {
    return parse(write(value));
  }

  static long n(Object value) {
    return ((Number) value).longValue();
  }

  static long n(Map<String, Object> value, String key) {
    return n(value.get(key));
  }

  static int i(Map<String, Object> value, String key) {
    return Math.toIntExact(n(value, key));
  }

  static String s(Map<String, Object> value, String key) {
    return (String) value.get(key);
  }

  static boolean b(Map<String, Object> value, String key) {
    return Boolean.TRUE.equals(value.get(key));
  }

  static boolean integer(Object value) {
    return value instanceof Integer || value instanceof Long;
  }

  static boolean oneOf(Object value, String... choices) {
    return value instanceof String && Arrays.asList(choices).contains(value);
  }

  static String canonical(Object value, boolean spaces) {
    if (value == null) return "null";
    if (value instanceof String text) {
      var out = new StringBuilder("\"");
      for (char c : text.toCharArray())
        switch (c) {
          case '"' -> out.append("\\\"");
          case '\\' -> out.append("\\\\");
          case '\b' -> out.append("\\b");
          case '\f' -> out.append("\\f");
          case '\n' -> out.append("\\n");
          case '\r' -> out.append("\\r");
          case '\t' -> out.append("\\t");
          default -> {
            if (c < 32 || c > 126) out.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else out.append(c);
          }
        }
      return out.append('"').toString();
    }
    if (value instanceof Map<?, ?> m) {
      var parts = new ArrayList<String>();
      m.keySet().stream()
          .map(Object::toString)
          .sorted()
          .forEach(
              k ->
                  parts.add(
                      canonical(k, spaces) + (spaces ? ": " : ":") + canonical(m.get(k), spaces)));
      return "{" + String.join(spaces ? ", " : ",", parts) + "}";
    }
    if (value instanceof List<?> list)
      return "["
          + String.join(spaces ? ", " : ",", list.stream().map(v -> canonical(v, spaces)).toList())
          + "]";
    return value.toString();
  }

  static byte[] digest(String algorithm, byte[] bytes) {
    try {
      return MessageDigest.getInstance(algorithm).digest(bytes);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  static String hash(String text) {
    return HexFormat.of().formatHex(digest("SHA-256", text.getBytes(StandardCharsets.UTF_8)));
  }

  static String fingerprint(Object value) {
    return hash(canonical(value, false));
  }

  static UUID uuid5(UUID namespace, String text) {
    var buffer =
        java.nio.ByteBuffer.allocate(16)
            .putLong(namespace.getMostSignificantBits())
            .putLong(namespace.getLeastSignificantBits());
    byte[] name = text.getBytes(StandardCharsets.UTF_8),
        bytes = Arrays.copyOf(buffer.array(), 16 + name.length);
    System.arraycopy(name, 0, bytes, 16, name.length);
    byte[] digest = digest("SHA-1", bytes);
    digest[6] = (byte) ((digest[6] & 15) | 80);
    digest[8] = (byte) ((digest[8] & 63) | 128);
    var result = java.nio.ByteBuffer.wrap(digest);
    return new UUID(result.getLong(), result.getLong());
  }

  static UUID uuid(Object raw) {
    try {
      String value = (String) raw;
      UUID id = UUID.fromString(value);
      if (!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
      return id;
    } catch (Exception e) {
      throw new ApiException(400, "A valid UUID is required.");
    }
  }

  static String text(Object raw, String label, boolean required) {
    if (!(raw instanceof String s)
        || s.codePointCount(0, s.length()) > 1200
        || (required && s.isBlank()))
      throw new ApiException(400, "Enter " + label + ", up to 1,200 characters.");
    return s.strip();
  }
}
