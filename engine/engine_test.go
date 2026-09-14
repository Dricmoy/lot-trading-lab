package engine

import (
	"testing"
	"time"
)

func TestPriceTimePriority(t *testing.T) {
	book := Book{Asks: []Level{{105, 2, 3}, {100, 2, 2}, {100, 3, 1}}}
	r, e := Match(Request{Side: "buy", Kind: "market", Quantity: 4}, book)
	if e != nil || r.Total != 400 || len(r.Fills) != 2 || r.Fills[0].Quantity != 3 {
		t.Fatalf("price-time priority failed: %+v %v", r, e)
	}
}
func TestSellHighestBid(t *testing.T) {
	r, _ := Match(Request{Side: "sell", Kind: "market", Quantity: 2}, Book{Bids: []Level{{99, 2, 0}, {102, 2, 1}}})
	if r.Total != 204 {
		t.Fatal(r)
	}
}
func TestLimitPartial(t *testing.T) {
	r, _ := Match(Request{Side: "buy", Kind: "limit", Quantity: 5, Limit: 100}, Book{Asks: []Level{{100, 2, 0}, {101, 8, 1}}})
	if r.Status != "partial" || r.Quantity != 2 || r.Total != 200 {
		t.Fatal(r)
	}
}
func TestNonCrossingLimit(t *testing.T) {
	r, _ := Match(Request{Side: "buy", Kind: "limit", Quantity: 1, Limit: 90}, OrderBook(100))
	if r.Status != "cancelled" || r.Total != 0 {
		t.Fatal(r)
	}
}
func TestInvalidOrders(t *testing.T) {
	for _, r := range []Request{{Side: "buy", Kind: "market", Quantity: -1}, {Side: "bad", Kind: "market", Quantity: 1}, {Side: "buy", Kind: "limit", Quantity: 1, Limit: 0}, {Side: "buy", Kind: "market", Quantity: 10001}} {
		if _, err := Match(r, OrderBook(100)); err == nil {
			t.Fatal("accepted invalid order", r)
		}
	}
}
func TestMarketDeterministic(t *testing.T) {
	now := time.Unix(100, 0)
	a, b := Markets(now), Markets(now)
	if a[0].Price != b[0].Price || len(a) != 8 || len(a[0].History) != 96 {
		t.Fatal("invalid simulated market")
	}
}
