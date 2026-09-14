package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
	_ "time/tzdata"
)

// Alpaca only reads market data. It never calls a brokerage/order endpoint.
type Alpaca struct {
	Client               *http.Client
	BaseURL, Key, Secret string
	mu                   sync.Mutex
	quotes               []Asset
	quotesAt             time.Time
	charts               map[string]chartCache
}
type chartCache struct {
	Prices []int64
	Times  []string
	At     time.Time
}

func NewAlpaca() *Alpaca {
	return &Alpaca{Client: &http.Client{Timeout: 7 * time.Second}, BaseURL: "https://data.alpaca.markets", Key: os.Getenv("ALPACA_API_KEY_ID"), Secret: os.Getenv("ALPACA_API_SECRET_KEY"), charts: make(map[string]chartCache)}
}
func (p *Alpaca) get(ctx context.Context, path string, out any) error {
	if p.Key == "" || p.Secret == "" {
		return fmt.Errorf("Alpaca credentials are not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.BaseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("APCA-API-KEY-ID", p.Key)
	req.Header.Set("APCA-API-SECRET-KEY", p.Secret)
	res, err := p.Client.Do(req)
	if err != nil {
		return fmt.Errorf("Alpaca market data is unreachable")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("Alpaca market data returned HTTP %d", res.StatusCode)
	}
	if err = json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(out); err != nil {
		return fmt.Errorf("Alpaca returned invalid market data")
	}
	return nil
}
func cents(v float64) (int64, error) {
	if math.IsNaN(v) || math.IsInf(v, 0) || v <= 0 || v > 1000000 {
		return 0, fmt.Errorf("invalid market price")
	}
	return int64(math.Round(v * 100)), nil
}
func validTime(s string) bool { _, err := time.Parse(time.RFC3339Nano, s); return err == nil }
func (p *Alpaca) Markets(ctx context.Context, symbol string, history bool) ([]Asset, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	if len(p.quotes) == 0 || now.Sub(p.quotesAt) >= 30*time.Second {
		type snapshot struct {
			Trade struct {
				Price float64 `json:"p"`
				Time  string  `json:"t"`
			} `json:"latestTrade"`
			Previous struct {
				Close float64 `json:"c"`
			} `json:"prevDailyBar"`
		}
		data := map[string]snapshot{}
		symbols := []string{}
		for _, s := range seeds {
			symbols = append(symbols, s.symbol)
		}
		if err := p.get(ctx, "/v2/stocks/snapshots?feed=iex&symbols="+strings.Join(symbols, ","), &data); err != nil {
			return nil, err
		}
		fresh := make([]Asset, 0, len(seeds))
		for _, s := range seeds {
			v, ok := data[s.symbol]
			price, e1 := cents(v.Trade.Price)
			previous, e2 := cents(v.Previous.Close)
			if !ok || e1 != nil || e2 != nil || !validTime(v.Trade.Time) {
				return nil, fmt.Errorf("Alpaca quote incomplete for %s", s.symbol)
			}
			fresh = append(fresh, Asset{Symbol: s.symbol, Name: s.name, Sector: s.sector, Price: price, Previous: previous, History: []int64{}, QuoteTime: v.Trade.Time})
		}
		p.quotes = fresh
		p.quotesAt = now
	}
	if history {
		chart, ok := p.charts[symbol]
		if !ok || now.Sub(chart.At) >= time.Minute {
			var data struct {
				Bars []struct {
					Close float64 `json:"c"`
					Time  string  `json:"t"`
				} `json:"bars"`
			}
			params := url.Values{"feed": {"iex"}, "timeframe": {"5Min"}, "start": {now.AddDate(0, 0, -10).UTC().Format(time.RFC3339)}, "end": {now.UTC().Format(time.RFC3339)}, "limit": {"1000"}, "sort": {"desc"}, "adjustment": {"split"}}
			if err := p.get(ctx, "/v2/stocks/"+symbol+"/bars?"+params.Encode(), &data); err != nil {
				return nil, err
			}
			if len(data.Bars) == 0 {
				return nil, fmt.Errorf("Alpaca has no recent chart bars for %s", symbol)
			}
			eastern, _ := time.LoadLocation("America/New_York")
			day := ""
			chart = chartCache{At: now, Prices: []int64{}, Times: []string{}}
			for _, bar := range data.Bars {
				t, err := time.Parse(time.RFC3339Nano, bar.Time)
				if err != nil {
					return nil, fmt.Errorf("invalid chart timestamp")
				}
				local := t.In(eastern)
				minute := local.Hour()*60 + local.Minute()
				if minute < 570 || minute >= 960 {
					continue
				}
				date := local.Format("2006-01-02")
				if day == "" {
					day = date
				}
				if date != day {
					break
				}
				price, err := cents(bar.Close)
				if err != nil {
					return nil, err
				}
				chart.Prices = append(chart.Prices, price)
				chart.Times = append(chart.Times, bar.Time)
			}
			if len(chart.Prices) == 0 {
				return nil, fmt.Errorf("Alpaca has no regular-session bars for %s", symbol)
			}
			for i, j := 0, len(chart.Prices)-1; i < j; i, j = i+1, j-1 {
				chart.Prices[i], chart.Prices[j] = chart.Prices[j], chart.Prices[i]
				chart.Times[i], chart.Times[j] = chart.Times[j], chart.Times[i]
			}
			if p.charts == nil {
				p.charts = make(map[string]chartCache)
			}
			p.charts[symbol] = chart
		}
	}
	out := append([]Asset(nil), p.quotes...)
	for i := range out {
		if c, ok := p.charts[out[i].Symbol]; ok && out[i].Symbol == symbol {
			out[i].History = append([]int64(nil), c.Prices...)
			out[i].HistoryTimes = append([]string(nil), c.Times...)
		}
	}
	return out, nil
}
