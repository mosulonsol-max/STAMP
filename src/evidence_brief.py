"""Explain measured market behavior without inventing causal news or confidence."""
import math

def finite(value):
    try:
        x=float(value);return x if math.isfinite(x) else None
    except (ValueError,TypeError):return None

def compose(payload):
    market=payload.get("market") or {};facts=[];inferences=[]
    when=payload.get("observed_utc");price=finite(market.get("price"));change=finite(market.get("change"))
    def fact(ar,en,source="MEXC",at=when):facts.append(dict(ar=ar,en=en,source=source,observed_utc=at))
    if price is not None:fact(f"آخر سعر مرجعي {price:.8f} دولار؛ أفضل شراء {market.get('bid')} وأفضل بيع {market.get('ask')}. لقطة التنفيذ تختلف عن آخر سعر.",f"Last reference price ${price:.8f}; bid {market.get('bid')}, ask {market.get('ask')}. Last price is not an execution quote.")
    if change is not None:fact(f"التغير خلال 24 ساعة {change*100:+.2f}%.",f"24h price change {change*100:+.2f}%.")
    candles=(payload.get("candles") or {}).get("1h") or []
    if len(candles)>=2 and candles[-1]["t"]-candles[-2]["t"]==3600000:
        ret=(candles[-1]["c"]/candles[-2]["c"]-1)*100
        fact(f"آخر شمعة ساعة مغلقة تغيرت {ret:+.2f}%؛ هذا تغير مكتمل وليس حركة الشمعة الجارية.",f"Last completed hourly close changed {ret:+.2f}%; the current open candle is excluded.")
    trades=market.get("trades") or {};buy=finite(trades.get("aggressive_buy_notional_usdt"));sell=finite(trades.get("aggressive_sell_notional_usdt"))
    if buy is not None and sell is not None:
        fact(f"عينة الصفقات المنفذة: شراء مبادر ${buy:,.2f} وبيع مبادر ${sell:,.2f}؛ عينة وليست صافي الأموال الداخلة.",f"Executed trade sample: aggressive buys ${buy:,.2f}, sells ${sell:,.2f}; sampled turnover, not net capital inflow.",at=market.get("trades_at_utc") or when)
        side="شراء" if buy>sell else "بيع" if sell>buy else "متوازن"
        inferences.append(dict(ar=f"ترجيح العينة نحو {side} قد يفسر ضغطًا قصير المدى، لكنه لا يثبت سبب الحركة أو اتجاهها التالي.",en="Sampled aggressor imbalance can indicate short-term pressure; it does not establish a catalyst or the next direction."))
    news=payload.get("news") or {}
    if not news.get("verified_causal_events"):
        inferences.append(dict(ar="لم يُثبت خبر مباشر يسبب الحركة الحالية. المؤشرات والارتباطات لا تثبت السبب.",en="No directly verified catalyst establishes the cause of this move; indicators and correlation are not causation."))
    levels={}
    if len(candles)>=21:
        levels={"support":min(c["l"] for c in candles[-21:-1]),"resistance":max(c["h"] for c in candles[-21:-1]),
                "basis":"previous 20 completed 1h candles; descriptive structure, not an order or forecast"}
    forecasts=payload.get("forecasts") or {}
    reports=[r for r in forecasts.values() if isinstance(r,dict)]
    return dict(observed_utc=when,facts=facts,inferences=inferences,levels=levels,
        forecast_summary={"visible_experiments":sum(bool(r.get("forecast")) for r in reports),
            "approved_research_horizons":sum(bool(r.get("champion")) for r in reports),
            "warning":"A displayed experiment is not an approved trading model or a calibrated success probability."},
        prior_outcome=next((r for r in (payload.get("forecast_review") or {}).get("rows",[]) if r.get("status") in ("evaluated","evaluated_historical")),None))
