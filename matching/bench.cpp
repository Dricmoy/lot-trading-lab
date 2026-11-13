// In-process microbenchmark of the matching core (no process start, no I/O).
#include <benchmark/benchmark.h>

#include "book.hpp"

static void BM_BuildBook(benchmark::State& state) {
    for (auto _ : state) {
        auto bids = levels(11845, false), asks = levels(11845, true);
        benchmark::DoNotOptimize(bids.data());
        benchmark::DoNotOptimize(asks.data());
    }
}
BENCHMARK(BM_BuildBook);

// Quantity 25 crosses two levels (the k6 "engine" order); 10000 sweeps all eight.
static void BM_MarketBuy(benchmark::State& state) {
    const auto asks = levels(11845, true);
    for (auto _ : state) {
        auto r = match(asks, true, false, state.range(0), 0);
        benchmark::DoNotOptimize(r.total);
    }
    state.SetItemsProcessed(state.iterations());
}
BENCHMARK(BM_MarketBuy)->Arg(1)->Arg(25)->Arg(10000);

static void BM_LimitSellStopsEarly(benchmark::State& state) {
    const auto bids = levels(11845, false);
    for (auto _ : state) {
        auto r = match(bids, false, true, 10000, 11840);
        benchmark::DoNotOptimize(r.total);
    }
    state.SetItemsProcessed(state.iterations());
}
BENCHMARK(BM_LimitSellStopsEarly);

BENCHMARK_MAIN();
