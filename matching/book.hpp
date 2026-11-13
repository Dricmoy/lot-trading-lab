// Matching core shared by the lot-matching executable and its microbenchmark.
#pragma once
#include <algorithm>
#include <cstdint>
#include <deque>
#include <iterator>
#include <map>
#include <string>
#include <vector>

struct Level { std::int64_t price, quantity; int sequence; };

inline std::vector<Level> levels(std::int64_t price, bool asks) {
    std::vector<Level> out;
    out.reserve(8);
    for (int i=0;i<8;++i) out.push_back({price+(asks?1:-1)*(i*3+1),asks?10+(i*23)%71:12+(i*17)%63,i});
    return out;
}

struct MatchResult { std::vector<Level> fills; std::int64_t remaining, total; };

// Price-time priority against one side of the book; a limit stops at the first level beyond it.
inline MatchResult match(const std::vector<Level>& book, bool buy, bool limit_order,
                         std::int64_t quantity, std::int64_t limit) {
    std::map<std::int64_t,std::deque<Level>> index;
    for(auto level:book)index[level.price].push_back(level);
    MatchResult r{{},quantity,0};
    while(!index.empty()&&r.remaining>0){
        auto it=buy?index.begin():std::prev(index.end());
        auto &fifo=it->second;
        auto level=fifo.front();fifo.pop_front();
        if(limit_order&&((buy&&level.price>limit)||(!buy&&level.price<limit)))break;
        auto amount=std::min(r.remaining,level.quantity);
        r.fills.push_back({level.price,amount,0});r.remaining-=amount;r.total+=amount*level.price;
        if(fifo.empty())index.erase(it);
    }
    return r;
}
