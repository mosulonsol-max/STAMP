"""Timestamped economic, political and crypto headlines with prospective scoring."""
import datetime as dt
from concurrent.futures import ThreadPoolExecutor, as_completed
from email.utils import parsedate_to_datetime
import hashlib
import json
import math
import re
import time
import xml.etree.ElementTree as ET
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

UTC = dt.timezone.utc
HORIZON_MS = {"15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000}
GDELT = "https://api.gdeltproject.org/api/v2/doc/doc?"
QUERIES = {
    "macro_politics": '("Federal Reserve" OR Powell OR inflation OR CPI OR PPI OR GDP OR employment OR "jobs report" OR "interest rates" OR "bond yields" OR oil OR OPEC OR tariffs OR sanctions OR election OR parliament OR war OR ceasefire OR "central bank" OR treasury)',
    "digital_assets": '(cryptocurrency OR Bitcoin OR Ethereum OR "digital assets" OR "crypto regulation" OR "crypto ETF" OR blockchain OR Solana OR exchange hack)',
}
GOOGLE_QUERIES = {
    "macro_politics": "Federal Reserve inflation interest rates jobs report tariffs sanctions election war oil markets",
    "digital_assets": "Bitcoin cryptocurrency crypto regulation ETF exchange hack Solana Ethereum",
}
POSITIVE = {"beat", "beats", "cut", "cuts", "cutting", "eases", "easing", "approved", "approval", "adopts", "adoption", "surge", "surges", "inflow", "inflows", "ceasefire", "peace", "rebound", "recover", "recovery", "growth", "grows", "deal", "agreement", "support", "supports", "lower", "falls", "falling"}
NEGATIVE = {"miss", "misses", "hike", "hikes", "tightening", "ban", "bans", "banned", "rejects", "rejected", "outflow", "outflows", "hack", "hacked", "exploit", "war", "attack", "attacks", "sanction", "sanctions", "tariff", "tariffs", "crash", "crashes", "drop", "drops", "rises", "surge", "surges", "default", "defaults", "crisis", "escalation", "higher"}
MACRO = {"federal reserve", "powell", "interest rate", "rate cut", "rate hike", "inflation", "cpi", "ppi", "jobs report", "employment", "payrolls", "unemployment", "treasury", "central bank", "gdp", "recession", "tariff", "trade war", "oil price", "opec", "bond yield", "jobless claims", "retail sales"}
POLITICAL = {"election", "president", "congress", "parliament", "sanction", "sanctions", "war", "ceasefire", "military", "government", "geopolitical", "trade deal", "tariffs"}
CRYPTO = {"bitcoin", "btc", "ethereum", "ether", "crypto", "cryptocurrency", "digital asset", "sec", "etf", "blockchain", "solana", "exchange hack"}
ASSETS = {
    "BTC": ("bitcoin", "btc"), "ETH": ("ethereum", "ether", "eth"),
    "SOL": ("solana", "sol"), "XRP": ("xrp", "ripple"),
    "ZEC": ("zcash", "zec"), "DOGE": ("dogecoin", "doge"),
    "BNB": ("binance", "bnb"), "ADA": ("cardano", "ada"),
    "TON": ("toncoin", "ton"), "TRX": ("tron", "trx"),
}
WORD = re.compile(r"[a-z0-9]+")


def _get(query):
    params = urlencode({"query": query, "mode": "ArtList", "format": "json", "sort": "DateDesc", "maxrecords": 75, "timespan": "6h"})
    request = Request(GDELT + params, headers={"User-Agent": "STAMP-Market-News/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=12) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("news_response_too_large")
    payload = json.loads(raw)
    return payload.get("articles", []) if isinstance(payload, dict) else []


def _get_google(query, name, now):
    params = urlencode({"q": "(" + query + ") when:6h", "hl": "en-US", "gl": "US", "ceid": "US:en"})
    request = Request("https://news.google.com/rss/search?" + params,
                      headers={"User-Agent": "STAMP-Market-News/1.0", "Accept": "application/rss+xml, application/xml"})
    with urlopen(request, timeout=10) as response:
        raw = response.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError("news_feed_too_large")
    root = ET.fromstring(raw)
    articles = []
    for item in root.findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        publisher = item.find("source")
        source_url = publisher.attrib.get("url", "") if publisher is not None else ""
        domain = urlparse(source_url or link).hostname or ""
        published = parsedate_to_datetime(item.findtext("pubDate") or "")
        if published.tzinfo is None:
            published = published.replace(tzinfo=UTC)
        article = {"title": title.rsplit(" - ", 1)[0] if publisher is not None else title,
                   "url": link, "domain": domain, "seendate": published.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")}
        normalized = _normalize_article(article, "Google News · " + name, now, "published_at_source")
        if normalized:
            articles.append(normalized)
    return articles


def _time(value):
    if not isinstance(value, str):
        return None
    try:
        return dt.datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC).isoformat()
    except ValueError:
        return None


def _category(title):
    text = title.lower()
    result = []
    if any(term in text for term in MACRO):
        result.append("economic")
    if any(term in text for term in POLITICAL):
        result.append("political")
    if any(term in text for term in CRYPTO):
        result.append("digital_assets")
    return result


def _sentiment(title):
    tokens = WORD.findall(title.lower())
    positive = sum(token in POSITIVE for token in tokens)
    negative = sum(token in NEGATIVE for token in tokens)
    total = positive + negative
    return max(-1.0, min(1.0, (positive - negative) / max(1, total)))


def _normalize_article(article, query_name, now, timestamp_type="seen_by_gdelt"):
    title = str(article.get("title") or "").strip()
    url = str(article.get("url") or "").strip()
    when = _time(article.get("seendate"))
    domain = str(article.get("domain") or "").lower().strip()
    categories = _category(title)
    if not title or not url.startswith("https://") or not when or not domain or not categories:
        return None
    age_hours = (now - dt.datetime.fromisoformat(when)).total_seconds() / 3600
    if age_hours < -0.1 or age_hours > 6.1:
        return None
    identity = hashlib.sha256((domain + "\n" + title.lower()).encode()).hexdigest()[:24]
    return {"id": identity, "title": title[:360], "url": url[:1600], "domain": domain,
            "seen_at_utc": when, "query": query_name, "categories": categories,
            "timestamp_type": timestamp_type, "headline_sentiment": _sentiment(title)}


def _similar(left, right):
    a, b = set(WORD.findall(left.lower())), set(WORD.findall(right.lower()))
    return len(a & b) / max(1, len(a | b))


def _clusters(articles):
    clusters = []
    for article in sorted(articles, key=lambda row: row["seen_at_utc"], reverse=True):
        match = next((group for group in clusters if _similar(article["title"], group[0]["title"]) >= 0.55), None)
        if match is None:
            clusters.append([article])
        elif article["domain"] not in {row["domain"] for row in match}:
            match.append(article)
    confirmed = []
    for group in clusters:
        domains = sorted({row["domain"] for row in group})
        if len(domains) < 2:
            continue
        scores = [row["headline_sentiment"] for row in group]
        confirmed.append({"id": hashlib.sha256("|".join(sorted(row["id"] for row in group)).encode()).hexdigest()[:24],
                          "title": group[0]["title"], "url": group[0]["url"],
                          "seen_at_utc": group[0]["seen_at_utc"], "domains": domains,
                          "categories": sorted({item for row in group for item in row["categories"]}),
                          "sentiment": sum(scores) / len(scores), "reports": len(group),
                          "corroborated": True})
    return confirmed


def refresh(previous=None, now=None, force=False):
    """Fetch a bounded six-hour feed. A fetch failure never takes the market worker down."""
    now = now or dt.datetime.now(UTC)
    previous = previous if isinstance(previous, dict) else {}
    last_fetch = previous.get("checked_at_utc")
    try:
        recent = previous.get("status") != "unavailable" and last_fetch and (now - dt.datetime.fromisoformat(last_fetch)).total_seconds() < 900
    except (TypeError, ValueError):
        recent = False
    if recent and not force:
        return previous
    articles, sources, errors = [], [], {}
    tasks = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for name, query in QUERIES.items():
            tasks[pool.submit(_get, query)] = ("GDELT · " + name, "gdelt", name)
        for name, query in GOOGLE_QUERIES.items():
            tasks[pool.submit(_get_google, query, name, now)] = ("Google News · " + name, "google", name)
        for task in as_completed(tasks):
            label, provider, name = tasks[task]
            try:
                result = task.result()
                normalized = result if provider == "google" else [item for row in result if isinstance(row, dict)
                                                                    if (item := _normalize_article(row, name, now)) is not None]
                sources.append({"name": label, "status": "ok", "articles": len(normalized)})
                articles.extend(normalized)
            except Exception as exc:
                errors[label] = type(exc).__name__
                sources.append({"name": label, "status": "unavailable", "articles": 0})
    merged = {row["id"]: row for row in (previous.get("articles") or []) if isinstance(row, dict) and row.get("id")}
    merged.update({row["id"]: row for row in articles})
    cutoff = now - dt.timedelta(hours=6)
    saved = [row for row in merged.values()
             if row.get("seen_at_utc") and cutoff <= dt.datetime.fromisoformat(row["seen_at_utc"]) <= now + dt.timedelta(minutes=5)]
    saved.sort(key=lambda row: row["seen_at_utc"], reverse=True)
    successful_sources = sum(source["status"] == "ok" for source in sources)
    return {"source": "GDELT DOC API + Google News RSS", "checked_at_utc": now.isoformat(),
            "last_successful_fetch_utc": now.isoformat() if successful_sources else previous.get("last_successful_fetch_utc"),
            "status": "ok" if successful_sources == len(sources) else "partial" if successful_sources else "unavailable",
            "sources": sources, "errors": errors, "articles": saved[:240],
            "corroborated": _clusters(saved)[:80], "analysis": "Headline-keyword sentiment; source corroboration requires a similar headline from two independent domains. This is not article-content fact checking."}


def pair_signal(snapshot, pair, reference_at_utc=None):
    reference = dt.datetime.fromisoformat(reference_at_utc) if reference_at_utc else dt.datetime.now(UTC)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=UTC)
    base = pair[:-4].upper() if pair.endswith("USDT") else pair.upper()
    terms = ASSETS.get(base, (base.lower(),))
    values, articles, categories = [], [], set()
    checked = snapshot.get("last_successful_fetch_utc")
    try:
        source_current = snapshot.get("status") in ("ok", "partial") and bool(checked) and (dt.datetime.now(UTC) - dt.datetime.fromisoformat(checked)).total_seconds() <= 3600
    except (TypeError, ValueError):
        source_current = False
    if not source_current:
        return {"signal": 0.0, "stories": 0, "corroborated_stories": 0, "domains": [],
                "categories": [], "article_ids": [], "as_of_utc": reference.isoformat(),
                "status": "news_source_stale"}
    for story in (snapshot.get("corroborated") or []):
        try:
            published = dt.datetime.fromisoformat(story["seen_at_utc"])
            hours = max(0, (reference - published).total_seconds() / 3600)
            title = story["title"].lower()
        except (KeyError, TypeError, ValueError):
            continue
        if hours > 6 or hours < -0.1:
            continue
        kinds = set(story.get("categories") or [])
        asset_match = any(re.search(r"\b" + re.escape(term) + r"\b", title) for term in terms)
        relevant = asset_match or bool(kinds & {"economic", "political", "digital_assets"})
        if not relevant:
            continue
        direct = 1.0 if asset_match else 0.8 if "digital_assets" in kinds else 0.6
        decay = math.exp(-hours / 2.5)
        weight = direct * decay * min(1.5, 1 + 0.1 * max(0, len(story.get("domains") or []) - 2))
        values.append((float(story.get("sentiment") or 0), weight))
        categories.update(kinds)
        articles.append(story)
    denominator = sum(weight for _, weight in values)
    score = sum(value * weight for value, weight in values) / denominator if denominator else 0.0
    return {"signal": round(max(-1, min(1, score)), 6), "stories": len(articles),
            "corroborated_stories": len(articles), "domains": sorted({d for row in articles for d in row.get("domains", [])}),
            "categories": sorted(categories), "article_ids": [row["id"] for row in articles[:12]],
            "as_of_utc": reference.isoformat(), "status": "available" if articles else "no_corroborated_relevant_news"}


def _fit(rows):
    denominator = sum(row["news_signal"] ** 2 for row in rows) + 12
    coefficient = sum(row["news_signal"] * row["residual"] for row in rows) / denominator
    residual_limit = sorted(abs(row["residual"]) for row in rows)[max(0, math.ceil(0.9 * len(rows)) - 1)]
    return max(-residual_limit, min(residual_limit, coefficient))


def evaluate_model(records, frame):
    """Walk-forward test a news correction against each forecast's stored candle-only baseline."""
    rows = []
    seen = set()
    for record in records:
        outcome, feature = record.get("outcome"), record.get("features") or {}
        news = feature.get("news") or {}
        try:
            if record.get("frame") != frame or frame not in HORIZON_MS or not outcome or not news.get("corroborated_stories"):
                continue
            if record.get("id") in seen:
                continue
            reference = float(record["reference_price"])
            actual = float(outcome["actual_price"])
            predicted = float(record["predicted_price"])
            baseline_error = math.log(actual / reference) ** 2
            forecast_error = math.log(actual / predicted) ** 2
            base = float(feature["base_predicted_log_return"])
            due = dt.datetime.fromisoformat(record["due_at_utc"])
            issued = dt.datetime.fromisoformat(record["reference_at_utc"])
            signal = float(news["signal"])
            measured = dt.datetime.fromisoformat(outcome["measured_at_utc"])
            if due.tzinfo is None or issued.tzinfo is None or measured.tzinfo is None:
                continue
            if abs((due - issued).total_seconds() * 1000 - HORIZON_MS[frame]) > 1000 or measured < due - dt.timedelta(seconds=1):
                continue
            if reference <= 0 or actual <= 0 or predicted <= 0 or not all(map(math.isfinite, (base, signal, actual, reference, predicted))):
                continue
            if not math.isclose(forecast_error, float(outcome["squared_log_error"]), rel_tol=1e-7, abs_tol=1e-12):
                continue
            if not math.isclose(baseline_error, float(outcome["baseline_squared_log_error"]), rel_tol=1e-7, abs_tol=1e-12):
                continue
            seen.add(record.get("id"))
            rows.append({"pair": record["pair"], "issued": issued, "due": due,
                         "news_signal": max(-1, min(1, signal)),
                         "residual": math.log(actual / reference) - base})
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
    rows.sort(key=lambda row: (row["issued"], row["pair"]))
    # Avoid counting overlapping target windows for the same pair as independent evidence.
    independent, last_due = [], {}
    for row in rows:
        if row["issued"] < last_due.get(row["pair"], dt.datetime.min.replace(tzinfo=UTC)):
            continue
        independent.append(row)
        last_due[row["pair"]] = row["due"]
    scored = []
    for index, row in enumerate(independent):
        past = [item for item in independent[:index] if item["due"] <= row["issued"]]
        if len(past) < 60:
            continue
        coefficient = _fit(past)
        scored.append({"pair": row["pair"], "issued": row["issued"],
                       "actual": row["residual"], "adjustment": coefficient * row["news_signal"]})
    base_mae = sum(abs(row["actual"]) for row in scored) / len(scored) if scored else None
    adjusted_mae = sum(abs(row["actual"] - row["adjustment"]) for row in scored) / len(scored) if scored else None
    pairs = len({row["pair"] for row in scored})
    days = len({row["issued"].date() for row in scored})
    improvement = (1 - adjusted_mae / base_mae) if base_mae and adjusted_mae is not None else None
    ready = len(scored) >= 30 and pairs >= 5 and days >= 20 and improvement is not None and improvement >= 0.05
    matured = [row for row in independent if row["due"] <= dt.datetime.now(UTC)]
    beta = _fit(matured) if len(matured) >= 60 else 0.0
    return {"status": "validated" if ready else "collecting_prospective_evidence",
            "used_in_directional_forecast": bool(ready), "coefficient": beta if ready else 0.0,
            "training_samples": len(matured), "walk_forward_samples": len(scored),
            "independent_pairs": pairs, "independent_days": days,
            "baseline_residual_mae": base_mae, "news_adjusted_residual_mae": adjusted_mae,
            "holdout_improvement": improvement, "updated_at_utc": dt.datetime.now(UTC).isoformat(),
            "minimum_requirements": {"walk_forward_samples": 30, "pairs": 5, "days": 20, "improvement": 0.05}}


def apply_model(snapshot, record_list, pair, frame, base_prediction, reference, reference_at_utc):
    model = (snapshot.get("models") or {}).get(frame) or evaluate_model(record_list, frame)
    observation = pair_signal(snapshot, pair, reference_at_utc)
    base_log = math.log(base_prediction / reference) if base_prediction > 0 and reference > 0 else 0.0
    effect = model["coefficient"] * observation["signal"] if model["used_in_directional_forecast"] else 0.0
    effect = max(-0.02, min(0.02, effect))
    return reference * math.exp(base_log + effect), {
        "analysis": observation, "model": model, "base_predicted_log_return": base_log,
        "applied_log_return_adjustment": effect,
        "used_in_directional_forecast": model["used_in_directional_forecast"]}


def public_snapshot(snapshot, pair=None):
    snapshot = snapshot if isinstance(snapshot, dict) else {}
    stories = list(snapshot.get("corroborated") or [])
    corroborated = snapshot.get("corroborated") or []
    # Keep single-source reports visible with an explicit label. They remain
    # excluded from pair_signal and therefore cannot steer forecasts.
    for article in snapshot.get("articles") or []:
        if not isinstance(article, dict):
            continue
        duplicate = any(_similar(article.get("title", ""), story.get("title", "")) >= 0.55
                        and article.get("domain") in (story.get("domains") or [])
                        for story in corroborated)
        if duplicate:
            continue
        stories.append({"id": article.get("id"), "title": article.get("title"),
                        "url": article.get("url"), "seen_at_utc": article.get("seen_at_utc"),
                        "timestamp_type": article.get("timestamp_type"),
                        "domains": [article.get("domain")] if article.get("domain") else [],
                        "categories": article.get("categories") or [],
                        "sentiment": article.get("headline_sentiment", 0.0),
                        "reports": 1, "corroborated": False})
    stories.sort(key=lambda row: row.get("seen_at_utc") or "", reverse=True)
    models = snapshot.get("models") or {}
    return {"source": snapshot.get("source", "GDELT DOC API + Google News RSS"),
            "checked_at_utc": snapshot.get("checked_at_utc"),
            "last_successful_fetch_utc": snapshot.get("last_successful_fetch_utc"),
            "status": snapshot.get("status", "unavailable"),
            "sources": snapshot.get("sources") or [], "errors": snapshot.get("errors") or {}, "analysis": snapshot.get("analysis"),
            "stories": stories[:20], "models": models,
            "pair_signal": pair_signal(snapshot, pair) if pair else None}
