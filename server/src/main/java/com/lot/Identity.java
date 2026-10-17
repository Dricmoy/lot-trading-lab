package com.lot;

import static com.lot.Json.*;

import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.zip.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

/** Database-backed opaque sessions with a bridge for existing Django identities. */
@Service
final class Identity {
  static final boolean PRODUCTION =
      System.getenv("VERCEL") != null || "production".equals(System.getenv("LOT_ENV"));
  static final String SECRET =
      env("DJANGO_SECRET_KEY", PRODUCTION ? "" : "local-development-only-lot-secret");
  static final UUID URL_NAMESPACE = UUID.fromString("6ba7b811-9dad-11d1-80b4-00c04fd430c8");
  static final SecureRandom RANDOM = new SecureRandom();
  static final long MAX_AGE = 30L * 24 * 60 * 60;
  final Database db;
  final Set<String> common = new HashSet<>();

  Identity(Database db) throws IOException {
    this.db = db;
    if (SECRET.isBlank())
      throw new IllegalStateException(
          "Production requires DJANGO_SECRET_KEY to preserve signed identities.");
    try (var in =
        new BufferedReader(
            new InputStreamReader(
                new GZIPInputStream(
                    Objects.requireNonNull(
                        getClass().getResourceAsStream("/common-passwords.txt.gz"))),
                StandardCharsets.UTF_8))) {
      in.lines().forEach(common::add);
    }
  }

  static String env(String name, String fallback) {
    String value = System.getenv(name);
    return value == null || value.isBlank() ? fallback : value;
  }

  static String publicUrl() {
    String host = System.getenv("VERCEL_PROJECT_PRODUCTION_URL");
    return env("PUBLIC_APP_URL", host == null ? "http://127.0.0.1:5173" : "https://" + host)
        .replaceAll("/$", "");
  }

  static String random() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  static String cookie(HttpServletRequest req, String name) {
    if (req.getCookies() != null)
      for (Cookie c : req.getCookies()) if (name.equals(c.getName())) return c.getValue();
    return "";
  }

  static void cookie(
      HttpServletResponse res, String name, String value, boolean httpOnly, long age) {
    var c =
        ResponseCookie.from(name, value)
            .httpOnly(httpOnly)
            .secure(PRODUCTION)
            .sameSite("Lax")
            .path("/");
    if (age >= 0) c.maxAge(Duration.ofSeconds(age));
    res.addHeader("Set-Cookie", c.build().toString());
  }

  static byte[] hmac(String keySalt, String value) {
    try {
      byte[] key = digest("SHA-256", (keySalt + SECRET).getBytes(StandardCharsets.UTF_8));
      var mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key, "HmacSHA256"));
      return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException(e);
    }
  }

  static String signature(String salt, String value) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(hmac(salt + "signer", value));
  }

  static long base62(String value) {
    long n = 0;
    String digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    for (char c : value.toCharArray()) {
      int i = digits.indexOf(c);
      if (i < 0) throw new IllegalArgumentException();
      n = Math.addExact(Math.multiplyExact(n, 62), i);
    }
    return n;
  }

  static String base62(long value) {
    var out = new StringBuilder();
    String digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    do {
      out.append(digits.charAt((int) (value % 62)));
      value /= 62;
    } while (value > 0);
    return out.reverse().toString();
  }

  static String signed(Object value, String salt) {
    String payload =
        Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(canonical(value, false).getBytes(StandardCharsets.UTF_8))
            + ":"
            + base62(Instant.now().getEpochSecond());
    return payload + ":" + signature(salt, payload);
  }

  static Object unsigned(String value, String salt) {
    try {
      int last = value.lastIndexOf(':');
      if (last < 1) return null;
      String payload = value.substring(0, last), sig = value.substring(last + 1);
      if (!MessageDigest.isEqual(
          sig.getBytes(StandardCharsets.US_ASCII),
          signature(salt, payload).getBytes(StandardCharsets.US_ASCII))) return null;
      int colon = payload.lastIndexOf(':');
      if (colon < 1
          || Instant.now().getEpochSecond() - base62(payload.substring(colon + 1)) > MAX_AGE)
        return null;
      String encoded = payload.substring(0, colon);
      boolean compressed = encoded.startsWith(".");
      byte[] bytes = Base64.getUrlDecoder().decode(compressed ? encoded.substring(1) : encoded);
      if (compressed) {
        try (var inflater = new InflaterInputStream(new ByteArrayInputStream(bytes))) {
          bytes = inflater.readNBytes(16385);
          if (bytes.length > 16384) return null;
        }
      }
      return MAPPER.readValue(new String(bytes, StandardCharsets.UTF_8), Object.class);
    } catch (Exception e) {
      return null;
    }
  }

  record Context(Map<String, Object> user, String accountId, boolean owner) {}

  UUID ownerId() {
    String token = env("LOT_OWNER_ACCESS_TOKEN", "");
    return token.length() < 32 ? null : uuid5(URL_NAMESPACE, "lot-owner:" + token);
  }

  boolean isOwner(String accountId) {
    return accountId != null && ownerId() != null && ownerId().toString().equals(accountId);
  }

  Context context(HttpServletRequest req) {
    String token = cookie(req, "lot_java_session");
    if (!token.isEmpty()) {
      var session =
          db.one(
              "SELECT * FROM lot_java_session WHERE token_hash=? AND expires_at>clock_timestamp()",
              hash(token));
      if (session != null) {
        Map<String, Object> user =
            session.get("user_id") == null
                ? null
                : db.one(
                    "SELECT * FROM auth_user WHERE id=? AND is_active=true",
                    session.get("user_id"));
        if (session.get("user_id") != null
            && (user == null
                || !Objects.equals(session.get("auth_hash"), hash(s(user, "password")))))
          return new Context(null, null, false);
        String privateId = (String) session.get("private_account");
        if (isOwner(privateId)) return new Context(user, privateId, true);
        if (user != null) {
          var a = db.one("SELECT id FROM trading_account WHERE user_id=?", user.get("id"));
          if (a != null) return new Context(user, s(a, "id"), false);
        }
      }
    }
    String legacy = cookie(req, "lot_session");
    if (!legacy.isBlank()) {
      var row =
          db.one(
              "SELECT session_data FROM django_session WHERE session_key=? AND expire_date>clock_timestamp()",
              legacy);
      Object decoded =
          row == null
              ? null
              : unsigned(s(row, "session_data"), "django.contrib.sessions.SessionStore");
      if (decoded instanceof Map<?, ?>) {
        var session = map(decoded);
        Map<String, Object> user = null;
        if (session.get("_auth_user_id") != null)
          try {
            user =
                db.one(
                    "SELECT * FROM auth_user WHERE id=? AND is_active=true",
                    Integer.parseInt(session.get("_auth_user_id").toString()));
            String expected =
                user == null
                    ? ""
                    : HexFormat.of()
                        .formatHex(
                            hmac(
                                "django.contrib.auth.models.AbstractBaseUser.get_session_auth_hash",
                                s(user, "password")));
            if (!Objects.equals(expected, session.get("_auth_user_hash"))) user = null;
          } catch (NumberFormatException ignored) {
          }
        String privateId = (String) session.get("lot_private_account");
        if (isOwner(privateId)) return new Context(user, privateId, true);
        if (user != null) {
          var a = db.one("SELECT id FROM trading_account WHERE user_id=?", user.get("id"));
          if (a != null) return new Context(user, s(a, "id"), false);
        }
      }
    }
    Object guest = unsigned(cookie(req, "lot_account"), "lot-account");
    if (guest instanceof String id)
      try {
        var account =
            db.one(
                "SELECT id FROM trading_account WHERE id=?::uuid AND user_id IS NULL",
                uuid(id).toString());
        if (account != null && !isOwner(id)) return new Context(null, id, false);
      } catch (ApiException ignored) {
      }
    return new Context(null, null, false);
  }

  Context require(HttpServletRequest request) {
    var c = context(request);
    if (c.accountId() == null) throw new ApiException(401, "Open your workspace first.");
    return c;
  }

  void guestCookie(HttpServletResponse response, String accountId) {
    cookie(response, "lot_account", signed(accountId, "lot-account"), true, MAX_AGE);
  }

  void revokeCurrent(HttpServletRequest request) {
    String java = cookie(request, "lot_java_session"), legacy = cookie(request, "lot_session");
    if (!java.isBlank()) db.update("DELETE FROM lot_java_session WHERE token_hash=?", hash(java));
    if (!legacy.isBlank()) db.update("DELETE FROM django_session WHERE session_key=?", legacy);
  }

  void login(
      HttpServletRequest request,
      HttpServletResponse response,
      Map<String, Object> user,
      String privateAccount,
      boolean remember) {
    revokeCurrent(request);
    String token = random();
    db.update(
        "INSERT INTO lot_java_session(token_hash,user_id,private_account,auth_hash,expires_at) VALUES (?,?,?::uuid,?,clock_timestamp()+interval '30 days')",
        hash(token),
        user == null ? null : user.get("id"),
        privateAccount,
        user == null ? null : hash(s(user, "password")));
    cookie(response, "lot_java_session", token, true, remember ? MAX_AGE : -1);
    cookie(response, "lot_session", "", true, 0);
    cookie(response, "lot_account", "", true, 0);
  }

  void logout(HttpServletRequest req, HttpServletResponse res) {
    revokeCurrent(req);
    for (String name : List.of("lot_java_session", "lot_session", "lot_account"))
      cookie(res, name, "", true, 0);
  }

  static Map<String, Object> userInfo(Map<String, Object> user) {
    return user == null ? null : obj("name", user.get("first_name"), "email", user.get("email"));
  }

  String email(Map<String, Object> data) {
    Object raw = data.get("email");
    if (!(raw instanceof String e)
        || e.strip().length() > 150
        || !e.strip().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
      throw new ApiException(400, "Enter a valid email address.");
    return e.strip().toLowerCase(Locale.ROOT);
  }

  String password(Map<String, Object> data, String email, String name) {
    Object raw = data.get("password");
    if (!(raw instanceof String p) || p.codePointCount(0, p.length()) < 10 || p.length() > 256)
      throw new ApiException(400, "Enter a password between 10 and 256 characters.");
    String lower = p.toLowerCase(Locale.ROOT);
    if (p.matches("[0-9]+") || common.contains(lower.strip()))
      throw new ApiException(400, "Choose a stronger password.");
    for (String part : (email + " " + name).toLowerCase(Locale.ROOT).split("[\\W_]+"))
      if (part.length() >= 4 && (lower.contains(part) || part.contains(lower)))
        throw new ApiException(400, "Your password is too similar to your account information.");
    return p;
  }

  static String encodePassword(String password) {
    String salt = random().substring(0, 22);
    return "pbkdf2_sha256$1000000$"
        + salt
        + "$"
        + Base64.getEncoder().encodeToString(pbkdf2(password, salt, 1_000_000));
  }

  static byte[] pbkdf2(String password, String salt, int iterations) {
    try {
      return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
          .generateSecret(
              new PBEKeySpec(
                  password.toCharArray(), salt.getBytes(StandardCharsets.UTF_8), iterations, 256))
          .getEncoded();
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException(e);
    }
  }

  static boolean checkPassword(String password, String encoded) {
    try {
      String[] p = encoded.split("\\$", 4);
      int it = Integer.parseInt(p[1]);
      if (!p[0].equals("pbkdf2_sha256") || it < 1 || it > 5_000_000) return false;
      return MessageDigest.isEqual(pbkdf2(password, p[2], it), Base64.getDecoder().decode(p[3]));
    } catch (Exception e) {
      return false;
    }
  }

  void limited(HttpServletRequest request, String action, String identity, int maximum) {
    // Socket peer only; accepting arbitrary forwarded headers would bypass throttles.
    for (var pair :
        List.of(
            Map.entry(request.getRemoteAddr(), 40),
            Map.entry(identity.isBlank() ? request.getRemoteAddr() : identity, maximum))) {
      boolean blocked =
          db.tx(
              () -> {
                String key = hash(action + ":" + pair.getKey());
                db.update(
                    "INSERT INTO trading_auththrottle(key,attempts,started_at) VALUES (?,0,clock_timestamp()) ON CONFLICT(key) DO NOTHING",
                    key);
                var row = db.one("SELECT * FROM trading_auththrottle WHERE key=? FOR UPDATE", key);
                boolean expired =
                    Instant.parse(s(row, "started_at")).isBefore(Instant.now().minusSeconds(900));
                int attempts = expired ? 1 : i(row, "attempts") + 1;
                db.update(
                    "UPDATE trading_auththrottle SET attempts=?,started_at=CASE WHEN ? THEN clock_timestamp() ELSE started_at END WHERE key=?",
                    attempts,
                    expired,
                    key);
                return attempts > pair.getValue();
              });
      if (blocked)
        throw new ApiException(429, "Too many attempts. Please try again in 15 minutes.");
    }
  }
}
