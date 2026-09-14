package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"lot/engine"
	"net/http"
	"os"
	"time"
)

var marketProvider = engine.NewAlpaca()

func privateAccess(r *http.Request) bool {
	secret := os.Getenv("LOT_OWNER_ACCESS_TOKEN")
	if len(secret) < 32 {
		return false
	}
	digest := sha256.Sum256([]byte("lot-engine:" + secret))
	return hmac.Equal([]byte(r.Header.Get("X-Lot-Market-Token")), []byte(hex.EncodeToString(digest[:])))
}

func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	markets := engine.Markets(time.Now())
	source := "simulated"
	symbol := r.URL.Query().Get("symbol")
	if symbol == "" {
		symbol = "NVDA"
	}
	known := false
	for _, a := range markets {
		if a.Symbol == symbol {
			known = true
		}
	}
	if !known {
		http.Error(w, `{"error":"Unknown symbol"}`, 400)
		return
	}
	if privateAccess(r) {
		var err error
		markets, err = marketProvider.Markets(r.Context(), symbol, r.Method == http.MethodGet)
		if err != nil {
			w.WriteHeader(503)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		source = "alpaca-iex"
	}
	if r.Method == http.MethodGet {
		symbol := r.URL.Query().Get("symbol")
		if symbol == "" {
			symbol = "NVDA"
		}
		for _, a := range markets {
			if a.Symbol == symbol {
				json.NewEncoder(w).Encode(map[string]any{"assets": markets, "book": engine.OrderBook(a.Price), "as_of": time.Now().UTC().Format(time.RFC3339), "source": source, "engine": "Go"})
				return
			}
		}
		http.Error(w, `{"error":"Unknown symbol"}`, 400)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, `{"error":"Method not allowed"}`, 405)
		return
	}
	var req engine.Request
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid order"}`, 400)
		return
	}
	for _, a := range markets {
		if a.Symbol == req.Symbol {
			result, err := engine.Match(req, engine.OrderBook(a.Price))
			if err != nil {
				w.WriteHeader(400)
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}
			json.NewEncoder(w).Encode(result)
			return
		}
	}
	http.Error(w, `{"error":"Unknown symbol"}`, 400)
}
