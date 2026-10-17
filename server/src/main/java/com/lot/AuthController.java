package com.lot;

import static com.lot.Json.*;

import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.mail.*;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
final class AuthController {
  final Identity identity;
  final Database db;
  final Accounts accounts;
  final JavaMailSender mail;

  AuthController(Identity identity, Database db, Accounts accounts, JavaMailSender mail) {
    this.identity = identity;
    this.db = db;
    this.accounts = accounts;
    this.mail = mail;
  }

  private Map<String, Object> response(Map<String, Object> user, String account) {
    return obj(
        "user",
        Identity.userInfo(user),
        "account",
        account == null ? null : accounts.serialize(account));
  }

  @GetMapping("/session")
  Map<String, Object> session(HttpServletRequest request) {
    Object csrf = request.getAttribute(CsrfToken.class.getName());
    if (csrf instanceof CsrfToken token) token.getToken();
    var c = identity.context(request);
    return response(c.user(), c.user() == null ? null : c.accountId());
  }

  @PostMapping("/signup")
  Map<String, Object> signup(
      @RequestBody Map<String, Object> data, HttpServletRequest request, HttpServletResponse res) {
    var context = identity.context(request);
    if (context.user() != null)
      throw new ApiException(409, "Sign out before creating another account.");
    String email = identity.email(data);
    Object name = data.get("name");
    if (!(name instanceof String text) || text.isBlank() || text.length() > 100)
      throw new ApiException(400, "Enter your name, up to 100 characters.");
    String password = identity.password(data, email, text);
    identity.limited(request, "signup", email, 5);
    try {
      return db.tx(
          () -> {
            var user =
                db.one(
                    "INSERT INTO auth_user(username,email,first_name,password,is_superuser,is_staff,is_active,last_name,date_joined) VALUES (?,?,?,?,false,false,true,'',clock_timestamp()) RETURNING *",
                    email,
                    email,
                    text.strip(),
                    Identity.encodePassword(password));
            String account = null;
            if (context.accountId() != null && !context.owner()) {
              var guest = db.lockAccount(context.accountId());
              if (guest.get("user_id") == null) {
                db.update(
                    "UPDATE trading_account SET user_id=? WHERE id=?::uuid",
                    user.get("id"),
                    context.accountId());
                account = context.accountId();
              }
            }
            if (account == null) account = accounts.create(false, user.get("id"), null);
            identity.login(request, res, user, null, true);
            res.setStatus(200);
            return response(user, account);
          });
    } catch (DuplicateKeyException e) {
      throw new ApiException(409, "That email already has an account. Sign in to continue.");
    }
  }

  @PostMapping("/login")
  Map<String, Object> login(
      @RequestBody Map<String, Object> data, HttpServletRequest request, HttpServletResponse res) {
    String email = identity.email(data);
    Object password = data.get("password");
    if (!(password instanceof String p) || p.length() > 256)
      throw new ApiException(400, "Check your email and password.");
    identity.limited(request, "login", email, 10);
    var user = db.one("SELECT * FROM auth_user WHERE username=? AND is_active=true", email);
    boolean valid = user != null && Identity.checkPassword(p, s(user, "password"));
    if (user == null) Identity.pbkdf2(p, "lot-unknown-user", 1_000_000);
    if (!valid) throw new ApiException(401, "The email or password is incorrect.");
    return db.tx(
        () -> {
          var a = db.one("SELECT id FROM trading_account WHERE user_id=?", user.get("id"));
          String id = a == null ? accounts.create(false, user.get("id"), null) : s(a, "id");
          identity.login(request, res, user, null, !Boolean.FALSE.equals(data.get("remember")));
          db.update("UPDATE auth_user SET last_login=clock_timestamp() WHERE id=?", user.get("id"));
          return response(user, id);
        });
  }

  @PostMapping("/logout")
  Map<String, Object> logout(HttpServletRequest request, HttpServletResponse res) {
    identity.logout(request, res);
    return obj("user", null, "account", null);
  }

  @PostMapping("/password")
  Map<String, Object> change(
      @RequestBody Map<String, Object> data, HttpServletRequest request, HttpServletResponse res) {
    var c = identity.context(request);
    if (c.user() == null) throw new ApiException(401, "Sign in to change your password.");
    identity.limited(request, "password", s(c.user(), "username"), 10);
    return db.tx(
        () -> {
          var user = db.one("SELECT * FROM auth_user WHERE id=? FOR UPDATE", c.user().get("id"));
          if (!(data.get("current_password") instanceof String old)
              || !Identity.checkPassword(old, s(user, "password")))
            throw new ApiException(400, "Your current password is incorrect.");
          String password = identity.password(data, s(user, "email"), s(user, "first_name")),
              encoded = Identity.encodePassword(password);
          db.update("UPDATE auth_user SET password=? WHERE id=?", encoded, user.get("id"));
          user.put("password", encoded);
          db.update("DELETE FROM lot_java_session WHERE user_id=?", user.get("id"));
          identity.login(request, res, user, c.owner() ? c.accountId() : null, true);
          return obj("message", "Your password has been changed.");
        });
  }

  @PostMapping("/forgot")
  Map<String, Object> forgot(@RequestBody Map<String, Object> data, HttpServletRequest request) {
    String email = identity.email(data);
    identity.limited(request, "forgot", email, 3);
    if (Identity.PRODUCTION && Identity.env("EMAIL_HOST", "").isBlank())
      throw new ApiException(
          503, "Password recovery is temporarily unavailable. Please try again later.");
    var user = db.one("SELECT * FROM auth_user WHERE username=? AND is_active=true", email);
    if (user != null) {
      String token = Identity.random();
      String uid =
          Base64.getUrlEncoder()
              .withoutPadding()
              .encodeToString(user.get("id").toString().getBytes(StandardCharsets.UTF_8));
      db.update(
          "INSERT INTO lot_java_reset(token_hash,user_id,auth_hash,expires_at) VALUES (?,?,?,clock_timestamp()+interval '1 hour')",
          hash(token),
          user.get("id"),
          hash(s(user, "password")));
      String link = Identity.publicUrl() + "/reset-password?uid=" + uid + "&token=" + token;
      String body =
          "Hi "
              + user.get("first_name")
              + ",\n\nUse this link to choose a new password:\n"
              + link
              + "\n\nThe link expires in one hour and can be used once. If you didn't request it, you can ignore this email.\n\nLot";
      try {
        if (!Identity.PRODUCTION && Identity.env("EMAIL_HOST", "").isBlank()) {
          Files.createDirectories(Path.of(".mailbox"));
          Files.writeString(
              Path.of(".mailbox", UUID.randomUUID() + ".log"),
              "Subject: Reset your Lot password\nTo: " + email + "\n\n" + body,
              StandardCharsets.UTF_8,
              StandardOpenOption.CREATE_NEW);
        } else {
          var message = new SimpleMailMessage();
          message.setFrom(Identity.env("DEFAULT_FROM_EMAIL", "Lot <accounts@localhost>"));
          message.setTo(email);
          message.setSubject("Reset your Lot password");
          message.setText(body);
          mail.send(message);
        }
      } catch (Exception e) {
        throw new ApiException(503, "We couldn't send the email. Please try again later.");
      }
    }
    return obj("message", "If an account uses that email, a reset link is on its way.");
  }

  private boolean legacyReset(Map<String, Object> user, String token) {
    try {
      // Legacy backend.settings inherited Django's America/Chicago TIME_ZONE.
      // Django tokens count naive local seconds since 2001, not Unix seconds.
      String[] parts = token.split("-", 2);
      long time = Long.parseLong(parts[0], 36);
      long age =
          java.time.temporal.ChronoUnit.SECONDS.between(
                  LocalDateTime.of(2001, 1, 1, 0, 0),
                  LocalDateTime.now(ZoneId.of("America/Chicago")))
              - time;
      if (age < 0 || age > 3600) return false;
      String last = "";
      if (user.get("last_login") != null) {
        var local =
            Instant.parse(s(user, "last_login"))
                .atOffset(ZoneOffset.UTC)
                .toLocalDateTime()
                .withNano(0);
        last =
            local.toLocalDate()
                + " "
                + String.format(
                    Locale.ROOT,
                    "%02d:%02d:%02d",
                    local.getHour(),
                    local.getMinute(),
                    local.getSecond());
      }
      String value = user.get("id") + s(user, "password") + last + time + s(user, "email");
      String full =
          HexFormat.of()
              .formatHex(
                  Identity.hmac("django.contrib.auth.tokens.PasswordResetTokenGenerator", value));
      var expected = new StringBuilder();
      for (int i = 0; i < full.length(); i += 2) expected.append(full.charAt(i));
      return java.security.MessageDigest.isEqual(
          expected.toString().getBytes(StandardCharsets.US_ASCII),
          parts[1].getBytes(StandardCharsets.US_ASCII));
    } catch (Exception e) {
      return false;
    }
  }

  @PostMapping("/reset")
  Map<String, Object> reset(
      @RequestBody Map<String, Object> data, HttpServletRequest request, HttpServletResponse res) {
    String invalid = "This reset link is invalid or has expired. Request a new one.";
    if (!(data.get("uid") instanceof String uid)
        || !(data.get("token") instanceof String token)
        || token.length() > 200) throw new ApiException(400, invalid);
    int id;
    try {
      id = Integer.parseInt(new String(Base64.getUrlDecoder().decode(uid), StandardCharsets.UTF_8));
    } catch (Exception e) {
      throw new ApiException(400, invalid);
    }
    return db.tx(
        () -> {
          var user = db.one("SELECT * FROM auth_user WHERE id=? AND is_active=true FOR UPDATE", id);
          if (user == null) throw new ApiException(400, invalid);
          var reset =
              db.one(
                  "SELECT * FROM lot_java_reset WHERE token_hash=? AND user_id=? AND used_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE",
                  hash(token),
                  id);
          if (reset == null
              ? !legacyReset(user, token)
              : !Objects.equals(reset.get("auth_hash"), hash(s(user, "password"))))
            throw new ApiException(400, invalid);
          String password = identity.password(data, s(user, "email"), s(user, "first_name"));
          db.update(
              "UPDATE auth_user SET password=? WHERE id=?", Identity.encodePassword(password), id);
          if (reset != null)
            db.update(
                "UPDATE lot_java_reset SET used_at=clock_timestamp() WHERE token_hash=?",
                hash(token));
          db.update("DELETE FROM lot_java_session WHERE user_id=?", id);
          identity.logout(request, res);
          return obj("message", "Your password has been reset. Sign in with your new password.");
        });
  }
}
