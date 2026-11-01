"""Generate an evidence-labelled responsive STAMP research dashboard."""
import datetime as dt
import html
import json
import math
import pathlib
from pine_parity import signals

ROOT=pathlib.Path(__file__).resolve().parents[1]
HORIZONS=("1h","4h","24h","7d")
def read(root,name):
    try:return json.loads((root/"data"/name).read_text())
    except (OSError,ValueError):return {}
def safe(value):
    return html.escape(str(value if value is not None else "Unavailable"))
def number(value,places=4):
    try:
        v=float(value)
        if not math.isfinite(v):return "Unavailable"
        return f"{v:,.{places}f}"
    except (ValueError,TypeError):return "Unavailable"
def time_label(s):
    try:return dt.datetime.fromisoformat(str(s).replace("Z","+00:00")).strftime("%d %b %Y · %H:%M UTC")
    except (ValueError,TypeError):return "Unavailable"
def freshness(s,minutes=15):
    try:
        v=dt.datetime.fromisoformat(str(s).replace("Z","+00:00"))
        age=(dt.datetime.now(dt.timezone.utc)-v).total_seconds()
        return "CURRENT SNAPSHOT" if 0<=age<=minutes*60 else "STALE SNAPSHOT"
    except (ValueError,TypeError):return "UNVERIFIED"
def build(root=ROOT):
    latest=read(root,"latest.json");health=read(root,"workflow_health.json")
    registry=read(root,"model_registry.json");learning=read(root,"learning_controller.json")
    score=read(root,"forecast_scorecard.json");activity=read(root,"forecast_activity.json")
    lab=read(root,"autonomous_lab.json");proposals=read(root,"lab_experiments.json")
    evaluations=read(root,"lab_evaluations.json");decisions=read(root,"lab_decisions.json")
    ticker=(((latest.get("raw") or {}).get("mexc") or {}).get("ticker") or {})
    quote=ticker.get("data") or {}
    observed=ticker.get("retrieved_at_utc") or (latest.get("raw") or {}).get("collected_at_utc")
    try:candles=json.loads((root/"data/candles/1h.json").read_text())
    except (OSError,ValueError):candles=[]
    candles=[c for c in candles if isinstance(c,dict) and all(k in c for k in ("t","o","h","l","c"))][-160:]
    values=[float(c["c"]) for c in candles if float(c["c"])>0]
    if len(values)>=2:
        low=min(values);span=max(values)-low or low*.01 or 1
        points=" ".join(f"{i*1000/(len(values)-1):.1f},{250-210*(v-low)/span:.1f}" for i,v in enumerate(values))
        chart=f'<svg aria-label="Historical 1h closes" viewBox="0 0 1000 270" role="img" preserveAspectRatio="none"><defs><linearGradient id="chartfill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#42d4ba" stop-opacity=".22"/><stop offset="1" stop-color="#42d4ba" stop-opacity="0"/></linearGradient></defs><polygon fill="url(#chartfill)" points="0,270 {points} 1000,270"/><polyline fill="none" stroke="#42d4ba" stroke-width="2.6" vector-effect="non-scaling-stroke" points="{points}"/></svg>'
    else:chart='<p class="muted">No verified candle history available.</p>'
    horizons=(registry.get("horizons") or {})
    generated=[]
    for h in HORIZONS:
        state=horizons.get(h) or {};payload=(learning.get("horizons") or {}).get(h) or {}
        forecast=payload.get("forecast") or {}
        status=state.get("status") or "unavailable"
        target=number(forecast.get("predicted_price"),8)
        issued=time_label(forecast.get("created_at_utc"))
        due=time_label(forecast.get("due_at_utc"))
        generated.append(f'<article class="forecast"><div class="between"><strong>{h}</strong><span class="badge">{safe(status.upper())}</span></div><div class="target">{safe(target)}</div><div class="small">Projected price · research only</div><div class="kv"><span>Issued</span><b>{safe(issued)}</b></div><div class="kv"><span>Due</span><b>{safe(due)}</b></div><div class="kv"><span>Model</span><b>{safe(state.get("selected_model"))}</b></div></article>')
    experiments=decisions.get("decisions") or []
    experiment_rows="".join(f'<tr><td>{safe(x.get("horizon"))}</td><td>{safe(x.get("family"))}</td><td>{safe(x.get("decision"))}</td><td>{safe(x.get("evaluation_samples"))}</td></tr>' for x in experiments[:12]) or '<tr><td colspan="4">No recorded experiment decisions in this build.</td></tr>'
    status="PASS" if health.get("pipeline_passed") is True else "NOT VERIFIED"
    lab_status=(lab.get("flow") or {}).get("state") or "not archived"
    model_approved=sum(v.get("status")=="approved" for v in horizons.values())
    # Archived price never implies live streaming; existing private app handles live feeds separately.
    css="""*{box-sizing:border-box}body{margin:0;background:#080f1c;color:#e7edf7;font:14px system-ui,-apple-system,Segoe UI,Arial}.layout{display:grid;grid-template-columns:218px minmax(0,1fr);min-height:100vh}.sidebar{background:#0c1729;border-right:1px solid #263347;padding:24px 18px}.brand{font-size:24px;font-weight:900;letter-spacing:-1px;color:#fff}.brand span{color:#46dbc7}.nav{margin-top:40px;display:grid;gap:14px;color:#91a6c2}.nav a{color:inherit;text-decoration:none;padding:11px 12px;border-radius:10px}.nav a:hover,.nav a:first-child{color:#e8fffb;background:#173445}.content{max-width:1500px;width:100%;margin:auto;padding:28px 32px 50px}.between{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.muted,.small{color:#91a6c2}.small{font-size:12px}.eyebrow{text-transform:uppercase;letter-spacing:2px;color:#48d7c5;font-size:11px;font-weight:800}.title{font-size:30px;letter-spacing:-1px;margin:6px 0 8px}.notice{border:1px solid #3b4a63;background:#101e31;padding:14px 17px;border-radius:12px;margin:20px 0;color:#d3e5f3}.grid{display:grid;gap:14px}.metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.metric,.panel,.forecast{border:1px solid #23334b;border-radius:17px;background:linear-gradient(145deg,#142338,#0d192b);padding:21px;min-width:0}.metric .label{color:#98abc4;margin-bottom:12px}.metric .value{font-size:25px;font-weight:800;overflow-wrap:anywhere}.section{font-size:19px;margin:30px 0 16px}.two{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}.chart{height:300px;margin-top:20px}.chart svg{height:100%;width:100%}.forecast-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.badge{font-size:10px;border-radius:100px;padding:7px 9px;background:#2b3951;color:#b4c9e3;letter-spacing:.4px}.target{font-size:23px;font-weight:800;margin:19px 0 5px}.kv{display:flex;justify-content:space-between;gap:14px;border-top:1px solid #27384d;padding:11px 0;font-size:12px;margin-top:9px}.kv b{text-align:right;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{padding:13px 8px;text-align:left;border-bottom:1px solid #24344b}th{color:#93a9c3;font-size:12px}.healthy{color:#5ce2a9}.warning{color:#f0b76a}@media(max-width:1100px){.forecast-grid,.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.two{grid-template-columns:1fr}}@media(max-width:720px){.layout{display:block}.sidebar{padding:15px 20px;border-bottom:1px solid #263347}.nav{display:flex;overflow:auto;margin-top:12px;gap:4px}.nav a{white-space:nowrap}.content{padding:21px 16px}.metrics,.forecast-grid{grid-template-columns:1fr 1fr}.metric .value{font-size:19px}.forecast{padding:14px}}@media(max-width:420px){.metrics,.forecast-grid{grid-template-columns:1fr}}"""
    html_page=f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080f1c"><title>STAMP · Intelligence Terminal</title><style>{css}</style></head><body><div class="layout"><aside class="sidebar"><div class="brand">STAMP<span>.</span></div><div class="small">INTELLIGENCE TERMINAL</div><nav class="nav"><a href="#overview">Overview</a><a href="#predictions">Predictions</a><a href="#laboratory">AI Laboratory</a><a href="#health">System Health</a></nav><p class="small" style="margin-top:40px">Independent, evidence-gated research</p></aside><main class="content" id="overview"><div class="between"><div><div class="eyebrow">Market intelligence / Solana</div><h1 class="title">STAMP Overview</h1><div class="muted">Exact-mint tracked research · MEXC quote snapshot</div></div><span class="badge">{safe(freshness(observed))}</span></div><div class="notice">Data shown here is an archived research snapshot, not a real-time executable quote. Unapproved model outputs are experimental; no guaranteed accuracy or trading recommendation is implied. Last quote: {safe(time_label(observed))}.</div><div class="grid metrics"><div class="metric"><div class="label">STAMP / USDT</div><div class="value">${safe(number(quote.get("lastPrice"),8))}</div><div class="small">MEXC · source-timestamped</div></div><div class="metric"><div class="label">24h Change</div><div class="value">{safe(number(quote.get("priceChangePercent"),2))}%</div><div class="small">Reported by MEXC</div></div><div class="metric"><div class="label">24h Volume · USDT</div><div class="value">{safe(number(quote.get("quoteVolume"),0))}</div><div class="small">Reported by MEXC</div></div><div class="metric"><div class="label">Approved models</div><div class="value">{model_approved} / 4</div><div class="small">Internal model governor</div></div></div><div class="grid two" style="margin-top:18px"><section class="panel"><div class="between"><h2>Historical Price · 1H</h2><span class="badge">CLOSED CANDLES</span></div><div class="chart">{chart}</div><div class="small">Last {len(values)} valid closed prices · historical only</div></section><section class="panel" id="health"><div class="eyebrow">System status</div><h2 class="section">Pipeline health</h2><div class="kv"><span>Monitoring</span><b class="{'healthy' if status=='PASS' else 'warning'}">{status}</b></div><div class="kv"><span>Run timestamp</span><b>{safe(time_label(health.get("timestamp_utc")))}</b></div><div class="kv"><span>AI laboratory</span><b>{safe(lab_status)}</b></div><div class="kv"><span>Issued forecasts</span><b>{safe(score.get("forecasts_total"))}</b></div><div class="kv"><span>Live-evaluated outcomes</span><b>{safe(score.get("evaluated_total"))}</b></div><div class="kv"><span>Pending outcomes</span><b>{safe(score.get("pending_total"))}</b></div></section></div><section id="predictions"><h2 class="section">Research forecasts · All horizons</h2><div class="grid forecast-grid">{''.join(generated)}</div><p class="small">No confidence percentage is fabricated. Approval is determined by prospective independent evaluation.</p></section><section id="laboratory"><h2 class="section">Autonomous AI Laboratory</h2><div class="grid metrics"><div class="metric"><div class="label">Proposed variants</div><div class="value">{len(proposals.get("experiments") or [])}</div></div><div class="metric"><div class="label">Sandbox evaluated</div><div class="value">{safe(evaluations.get("evaluated"))}</div></div><div class="metric"><div class="label">Lab decisions</div><div class="value">{len(experiments)}</div></div><div class="metric"><div class="label">Governor state</div><div class="value" style="font-size:18px">{safe(lab_status)}</div></div></div><div class="panel" style="margin-top:15px;overflow-x:auto"><h3>Experiment decisions</h3><table><thead><tr><th>Horizon</th><th>Model family</th><th>Decision</th><th>Test samples</th></tr></thead><tbody>{experiment_rows}</tbody></table></div></section><footer class="small" style="padding-top:35px">STAMP Research Terminal · Generated {safe(time_label(dt.datetime.now(dt.timezone.utc).isoformat()))} · Research only, not financial advice</footer></main></div></body></html>"""
    out=root/"dashboard/index.html";out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(html_page,encoding="utf-8")
    return out
if __name__=="__main__":print(build())
