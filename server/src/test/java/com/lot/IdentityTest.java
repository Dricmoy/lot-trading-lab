package com.lot;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class IdentityTest {
  @Test
  void passwordBoundsCountUnicodeCharactersLikeDjango() throws Exception {
    var identity = new Identity(null);
    String password = "Fixture-" + "🌱".repeat(130);
    assertTrue(password.length() > 256);
    assertEquals(
        password,
        identity.password(Json.obj("password", password), "person@example.test", "Example"));
    assertThrows(
        ApiException.class,
        () ->
            identity.password(
                Json.obj("password", "🌱".repeat(257)), "person@example.test", "Example"));
    assertTrue(Identity.checkPassword(password, Identity.encodePassword(password)));
  }

  @Test
  void pbkdf2UsesDjangoCompatibleRepresentation() {
    String password = "Public fixture only 47!";
    String encoded = Identity.encodePassword(password);
    assertTrue(encoded.startsWith("pbkdf2_sha256$1000000$"));
    assertTrue(Identity.checkPassword(password, encoded));
    assertFalse(Identity.checkPassword("wrong password", encoded));
  }

  @Test
  void signedGuestsRoundTripAndRejectTampering() {
    String id = "d38a2ba4-69b6-4f3a-b983-a95bb3f4f37d";
    String signed = Identity.signed(id, "lot-account");
    assertEquals(id, Identity.unsigned(signed, "lot-account"));
    assertNull(Identity.unsigned(signed + "x", "lot-account"));
    assertNull(Identity.unsigned(signed, "wrong-salt"));
  }

  @Test
  void timestampsRoundTrip() {
    for (long time : new long[] {0, 1, 61, 62, 1792204061L})
      assertEquals(time, Identity.base62(Identity.base62(time)));
  }

  @Test
  void malformedPasswordsFailClosed() {
    for (String encoded :
        new String[] {
          "",
          "x",
          "pbkdf2_sha256$99999999999$salt$hash",
          "pbkdf2_sha256$0$salt$hash",
          "other$1000$salt$hash"
        }) assertFalse(Identity.checkPassword("password", encoded));
  }
}
