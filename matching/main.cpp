#include <chrono>
#include <cstdint>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "book.hpp"

void print_levels(const std::vector<Level>& values) {
    std::cout << '[';
    bool comma=false;
    for (auto v:values) {
        if(comma)std::cout << ',';
        comma=true;
        std::cout << "{\"price\":"<<v.price<<",\"quantity\":"<<v.quantity<<",\"sequence\":"<<v.sequence<<'}';
    }
    std::cout << ']';
}
int main() {
    std::string line;
    if(!std::getline(std::cin,line)||line.size()>512)return 2;
    std::istringstream input(line);
    std::string mode,side,kind,extra;
    std::int64_t quantity=0,limit=0,price=0;
    input>>mode;
    if(mode=="book")input>>price;
    else if(mode=="match")input>>side>>kind>>quantity>>limit>>price;
    else return 2;
    if(!input || (input>>extra) || price<25 || price>100000000)return 2;
    if(mode=="match" && (quantity<1||quantity>10000||(side!="buy"&&side!="sell")||(kind!="market"&&kind!="limit")||(kind=="limit"&&(limit<1||limit>100000000))))return 2;
    const auto started=std::chrono::steady_clock::now();
    auto bids=levels(price,false),asks=levels(price,true);
    MatchResult matched{{},quantity,0};
    if(mode=="match")matched=match(side=="buy"?asks:bids,side=="buy",kind=="limit",quantity,limit);
    const auto& fills=matched.fills;
    const auto remaining=matched.remaining,total=matched.total;
    if(mode=="match"){
        std::cout<<"{\"fills\":[";
        for(std::size_t i=0;i<fills.size();++i){if(i)std::cout<<',';std::cout<<"{\"price\":"<<fills[i].price<<",\"quantity\":"<<fills[i].quantity<<'}';}
        auto status=remaining==quantity?"cancelled":remaining?"partial":"filled";
        auto us=std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-started).count();
        std::cout<<"],\"quantity\":"<<quantity-remaining<<",\"total\":"<<total<<",\"status\":\""<<status<<"\",\"duration_us\":"<<us<<",\"algorithm\":\"Price-time priority - ordered price levels\",\"book\":";
    }
    std::cout<<"{\"bids\":";print_levels(bids);std::cout<<",\"asks\":";print_levels(asks);std::cout<<'}';
    if(mode=="match")std::cout<<'}';
    std::cout<<'\n';
}
