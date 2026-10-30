"""Contract-scoped DEX liquidity; never confuse liquidity, turnover and market cap."""
import math
CONTRACT="EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc"

def number(value):
    try:
        n=float(value);return n if math.isfinite(n) and n>=0 else None
    except (ValueError,TypeError):return None

def summarize(pairs,observed=None):
    unique={}
    for pair in pairs if isinstance(pairs,list) else []:
        if not isinstance(pair,dict) or pair.get("chainId")!="solana":continue
        if CONTRACT not in ((pair.get("baseToken") or {}).get("address"),(pair.get("quoteToken") or {}).get("address")):continue
        address=pair.get("pairAddress")
        liquidity=number((pair.get("liquidity") or {}).get("usd"))
        if address and liquidity is not None:unique[address]=(pair,liquidity)
    ordered=sorted(unique.values(),key=lambda p:p[1],reverse=True)
    caps=[(number(p.get("marketCap")),liquidity) for p,liquidity in ordered if (p.get("baseToken") or {}).get("address")==CONTRACT]
    cap=next((value for value,_ in caps if value is not None),None)
    return dict(liquidity_usd=sum(liquidity for _,liquidity in ordered) if ordered else None,
        market_cap_usd=cap,pools=len(ordered),observed_utc=observed,source="DexScreener · identified Solana pools",
        status="measured" if ordered else "unavailable",label="observed DEX pool liquidity; not CEX order book depth",
        market_cap_policy="provider marketCap for the exact base mint; FDV is never substituted")
