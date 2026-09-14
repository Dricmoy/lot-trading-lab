// Package engine implements deterministic market simulation and price-time matching.
package engine

import (
	"container/heap"
	"fmt"
	"math"
	"time"
)

type Asset struct {
	Symbol       string   `json:"symbol"`
	Name         string   `json:"name"`
	Sector       string   `json:"sector"`
	Price        int64    `json:"price"`
	Previous     int64    `json:"previous"`
	History      []int64  `json:"history"`
	QuoteTime    string   `json:"quote_time,omitempty"`
	HistoryTimes []string `json:"history_times,omitempty"`
}
type Level struct {
	Price    int64 `json:"price"`
	Quantity int64 `json:"quantity"`
	Sequence int   `json:"sequence"`
}
type Book struct {
	Bids []Level `json:"bids"`
	Asks []Level `json:"asks"`
}
type Request struct {
	Symbol   string `json:"symbol"`
	Side     string `json:"side"`
	Kind     string `json:"kind"`
	Quantity int64  `json:"quantity"`
	Limit    int64  `json:"limit"`
}
type Fill struct {
	Price    int64 `json:"price"`
	Quantity int64 `json:"quantity"`
}
type Result struct {
	Fills     []Fill `json:"fills"`
	Quantity  int64  `json:"quantity"`
	Total     int64  `json:"total"`
	Status    string `json:"status"`
	Duration  int64  `json:"duration_us"`
	Book      Book   `json:"book"`
	Algorithm string `json:"algorithm"`
}

var seeds = []struct {
	symbol, name, sector string
	price, previous      int64
}{
	{"NVDA", "NVIDIA", "Semiconductors", 17836, 17440},
	{"AAPL", "Apple", "Consumer technology", 23749, 23561},
	{"TSLA", "Tesla", "Electric vehicles", 34622, 35148},
	{"MSFT", "Microsoft", "Software", 51263, 50820},
	{"AMZN", "Amazon", "E-commerce", 22874, 22610},
	{"GOOGL", "Alphabet", "Internet services", 20538, 20375},
	{"COIN", "Coinbase", "Financial technology", 31258, 31920},
	{"HOOD", "Robinhood Markets", "Financial technology", 11842, 11512},
}

func Markets(now time.Time) []Asset {
	assets := make([]Asset, 0, len(seeds))
	tick := now.Unix() / 15
	for i, s := range seeds {
		history := make([]int64, 96)
		for j := range history {
			progress := float64(j) / 95
			wave := math.Sin(float64(j)*0.24+float64(i))*0.0018 + math.Sin(float64(j)*1.9+float64(i))*0.0007
			history[j] = int64(float64(s.previous) + float64(s.price-s.previous)*progress + float64(s.price)*wave)
		}
		price := s.price + int64(math.Sin(float64(tick)*0.31+float64(i))*float64(s.price)*0.0008)
		history[95] = price
		assets = append(assets, Asset{Symbol: s.symbol, Name: s.name, Sector: s.sector, Price: price, Previous: s.previous, History: history})
	}
	return assets
}

func OrderBook(price int64) Book {
	b := Book{Bids: []Level{}, Asks: []Level{}}
	for i := 0; i < 8; i++ {
		spread := int64(i*3 + 1)
		b.Bids = append(b.Bids, Level{price - spread, int64(12 + (i*17)%63), i})
		b.Asks = append(b.Asks, Level{price + spread, int64(10 + (i*23)%71), i})
	}
	return b
}

type queue struct {
	levels []Level
	buy    bool
}

func (q queue) Len() int { return len(q.levels) }
func (q queue) Less(i, j int) bool {
	a, b := q.levels[i], q.levels[j]
	if a.Price == b.Price {
		return a.Sequence < b.Sequence
	}
	if q.buy {
		return a.Price < b.Price
	}
	return a.Price > b.Price
}
func (q queue) Swap(i, j int) { q.levels[i], q.levels[j] = q.levels[j], q.levels[i] }
func (q *queue) Push(x any)   { q.levels = append(q.levels, x.(Level)) }
func (q *queue) Pop() any {
	n := len(q.levels)
	x := q.levels[n-1]
	q.levels = q.levels[:n-1]
	return x
}

func Match(req Request, book Book) (Result, error) {
	start := time.Now()
	out := Result{Fills: []Fill{}, Book: book, Algorithm: "Price-time priority · binary heap"}
	if req.Quantity < 1 || req.Quantity > 10000 {
		return out, fmt.Errorf("quantity must be between 1 and 10,000 shares")
	}
	if req.Side != "buy" && req.Side != "sell" {
		return out, fmt.Errorf("invalid order side")
	}
	if req.Kind != "market" && req.Kind != "limit" {
		return out, fmt.Errorf("invalid order type")
	}
	if req.Kind == "limit" && (req.Limit <= 0 || req.Limit > 100000000) {
		return out, fmt.Errorf("invalid limit price")
	}
	levels := book.Asks
	if req.Side == "sell" {
		levels = book.Bids
	}
	q := &queue{append([]Level(nil), levels...), req.Side == "buy"}
	heap.Init(q)
	remaining := req.Quantity
	for q.Len() > 0 && remaining > 0 {
		level := heap.Pop(q).(Level)
		if req.Kind == "limit" && ((req.Side == "buy" && level.Price > req.Limit) || (req.Side == "sell" && level.Price < req.Limit)) {
			break
		}
		amount := min(remaining, level.Quantity)
		out.Fills = append(out.Fills, Fill{level.Price, amount})
		out.Quantity += amount
		out.Total += amount * level.Price
		remaining -= amount
	}
	out.Status = "filled"
	if out.Quantity == 0 {
		out.Status = "cancelled"
	} else if remaining > 0 {
		out.Status = "partial"
	}
	out.Duration = time.Since(start).Microseconds()
	return out, nil
}
