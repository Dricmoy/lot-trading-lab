package engine

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAlpacaPricesHistoryAndCache(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("APCA-API-KEY-ID") != "paper" || r.Header.Get("APCA-API-SECRET-KEY") != "secret" || r.URL.Query().Get("feed") != "iex" {
			t.Error("missing credentials or explicit IEX feed")
		}
		if strings.HasSuffix(r.URL.Path, "snapshots") {
			data := map[string]any{}
			for _, s := range seeds {
				data[s.symbol] = map[string]any{"latestTrade": map[string]any{"p": 123.456, "t": "2026-09-11T19:59:00Z"}, "prevDailyBar": map[string]any{"c": 120.25}}
			}
			json.NewEncoder(w).Encode(data)
		} else {
			json.NewEncoder(w).Encode(map[string]any{"bars": []map[string]any{{"c": 123.4, "t": "2026-09-11T19:55:00Z"}, {"c": 123.1, "t": "2026-09-11T19:50:00Z"}, {"c": 120, "t": "2026-09-10T19:55:00Z"}}})
		}
	}))
	defer server.Close()
	p := &Alpaca{Client: server.Client(), BaseURL: server.URL, Key: "paper", Secret: "secret"}
	assets, err := p.Markets(context.Background(), "NVDA", true)
	if err != nil {
		t.Fatal(err)
	}
	a := assets[0]
	if a.Price != 12346 || a.Previous != 12025 || len(a.History) != 2 || a.History[0] != 12310 || a.HistoryTimes[1] != "2026-09-11T19:55:00Z" {
		t.Fatalf("bad normalized data: %+v", a)
	}
	assets[0].History[0] = 1
	again, err := p.Markets(context.Background(), "NVDA", true)
	if err != nil || calls != 2 || again[0].History[0] != 12310 {
		t.Fatal("cache not isolated or reused")
	}
	// Expired quotes fail closed instead of silently serving synthetic/stale values.
	p.quotesAt = time.Now().Add(-time.Minute)
	server.Close()
	if _, err = p.Markets(context.Background(), "NVDA", true); err == nil {
		t.Fatal("expected outage error")
	}
}
func TestAlpacaRejectsIncompleteQuotesAndHTTPFailure(t *testing.T) {
	for _, status := range []int{200, 401, 403, 429, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status); w.Write([]byte(`{}`)) }))
			defer server.Close()
			p := &Alpaca{Client: server.Client(), BaseURL: server.URL, Key: "paper", Secret: "secret"}
			if _, err := p.Markets(context.Background(), "NVDA", true); err == nil {
				t.Fatal("expected incomplete/error response to fail")
			}
		})
	}
}
