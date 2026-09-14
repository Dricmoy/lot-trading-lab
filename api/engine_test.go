package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http/httptest"
	"testing"
)

func TestPrivateAccessRequiresServerToken(t *testing.T) {
	token := "test-owner-access-token-at-least-32-characters"
	t.Setenv("LOT_OWNER_ACCESS_TOKEN", token)
	r := httptest.NewRequest("GET", "/api/engine", nil)
	if privateAccess(r) {
		t.Fatal("anonymous request is private")
	}
	r.Header.Set("X-Lot-Market-Token", token)
	if privateAccess(r) {
		t.Fatal("owner login token accepted as internal token")
	}
	sum := sha256.Sum256([]byte("lot-engine:" + token))
	r.Header.Set("X-Lot-Market-Token", hex.EncodeToString(sum[:]))
	if !privateAccess(r) {
		t.Fatal("valid server token rejected")
	}
	t.Setenv("LOT_OWNER_ACCESS_TOKEN", "")
	if privateAccess(r) {
		t.Fatal("unconfigured private mode enabled")
	}
}
