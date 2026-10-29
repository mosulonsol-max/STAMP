"""Exact-contract public news discovery, with a persistent first-seen archive.

Search results are mentions, not verified project announcements or price causes.
Publication time is never replaced by retrieval time to make old news look new.
"""
import datetime as dt,email.utils,hashlib,json,xml.etree.ElementTree as ET
from urllib.parse import urlencode
import requests
CONTRACT="EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc"

def collect(root):
    now=dt.datetime.now(dt.timezone.utc)
    url="https://news.google.com/rss/search?"+urlencode({"q":'"'+CONTRACT+'"',"hl":"en-US","gl":"US","ceid":"US:en"})
    result={"retrieved_at_utc":now.isoformat(),"contract":CONTRACT,"search_url":url,"status":"unavailable","mentions":[],"error":None}
    archive=root/"data/news_journal.jsonl";known={}
    if archive.exists():
        for line in archive.read_text().splitlines():
            if line.strip():
                entry=json.loads(line);known[entry["id"]]=entry
    try:
        response=requests.get(url,timeout=10,headers={"User-Agent":"STAMP-contract-research/2"});response.raise_for_status()
        if len(response.content)>1000000 or b"<!DOCTYPE" in response.content.upper():raise ValueError("invalid_feed")
        doc=ET.fromstring(response.content)
        for item in doc.findall("./channel/item")[:20]:
            title=item.findtext("title") or "";link=item.findtext("link") or "";pub=item.findtext("pubDate")
            if not link.startswith("https://"):continue
            key=hashlib.sha256((link+title).encode()).hexdigest()
            try:published=email.utils.parsedate_to_datetime(pub).astimezone(dt.timezone.utc).isoformat()
            except (ValueError,TypeError,AttributeError):published=None
            entry=known.get(key) or {"id":key,"title":title,"url":link,"publication_at_utc":published,
                "first_seen_at_utc":now.isoformat(),"verification_status":"search_mention_unverified",
                "query_contract":CONTRACT,"source":"Google News exact-contract search"}
            if key not in known:
                with archive.open("a") as f:f.write(json.dumps(entry,ensure_ascii=False)+"\n")
                known[key]=entry
            result["mentions"].append(entry)
        result["status"]="searched"
    except Exception as exc:result["error"]=type(exc).__name__
    result["warning"]="An exact-contract search result still needs direct-source verification. No results do not establish that no news exists."
    return result
