"""One market source path for quotes, candles and projections across hosting regions."""
import datetime as dt,json,time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from urllib.parse import urlencode
from urllib.request import Request,urlopen
try:from src import multi_asset as assets
except ImportError:import multi_asset as assets

@lru_cache(maxsize=8)
def _snapshot(pair,venue,bucket):return assets.snapshot(pair,venue or None)
@lru_cache(maxsize=64)
def _quote(pair,venue,bucket):return assets.quote_snapshot(pair,venue)
@lru_cache(maxsize=2)
def _universe(bucket):
    d=assets.universe(timeout=6)
    return dict(d,venues={p:['MEXC'] for p in d['pairs']},sources={'MEXC':{'status':'ok','count':d['count'],'transport':'worker_gateway'}})
def serve(kind,pair='',venue=''):
    if kind=='universe':return _universe(int(time.time()//300))
    pair=assets.symbol(pair)
    if kind=='snapshot':return _snapshot(pair,venue,int(time.time()//15))
    if kind=='quote':return _quote(pair,venue,int(time.time()//3))
    raise ValueError('unknown_market_operation')
def fetch_gateway(kind,pair='',venue=''):
    if kind not in ('snapshot','quote','universe'):raise ValueError('unknown_market_operation')
    if kind!='universe':pair=assets.symbol(pair)
    if venue and venue not in assets.VENUES:raise ValueError('unsupported_venue')
    url='https://stamp-autonomous-worker.onrender.com/market/'+kind+'?'+urlencode({'symbol':pair,'venue':venue})
    with urlopen(Request(url,headers={'Accept':'application/json','User-Agent':'STAMP-Market-Gateway'}),timeout=8) as response:raw=response.read(2000001)
    if len(raw)>2000000:raise ValueError('oversized_market_response')
    result=json.loads(raw)
    if kind!='universe' and (result.get('symbol')!=pair or venue and result.get('venue')!=venue):raise ValueError('market_source_mismatch')
    result['transport']='worker_gateway'
    return result

def snapshot(pair,venue=None):
    pair=assets.symbol(pair)
    try:return fetch_gateway('snapshot',pair,venue or '')
    except (OSError,ValueError,TypeError,KeyError):return assets.snapshot(pair,venue)
def quote(pair,venue):
    pair=assets.symbol(pair)
    try:return fetch_gateway('quote',pair,venue)
    except (OSError,ValueError,TypeError,KeyError):return assets.quote_snapshot(pair,venue)
def catalog():
    with ThreadPoolExecutor(max_workers=2) as pool:
        tasks=[pool.submit(assets.dashboard_universe),pool.submit(fetch_gateway,'universe')]
        results=[]
        for task in tasks:
            try:results.append(task.result())
            except (OSError,ValueError,KeyError,TypeError):pass
    if not results:raise OSError('all_exchange_catalogs_unavailable')
    venues={};sources={}
    for result in results:
        for pair,listed in result.get('venues',{}).items():
            if assets.ALLOWED.fullmatch(pair):venues[pair]=sorted(set(venues.get(pair,[]))|set(listed))
        for name,status in result.get('sources',{}).items():
            if name not in sources or status.get('status')=='ok':sources[name]=status
    if not venues:raise OSError('empty_catalog')
    return {'pairs':sorted(venues),'count':len(venues),'venues':venues,'sources':sources,'source':'connected USDT exchange listings','retrieved_at_utc':dt.datetime.now(dt.timezone.utc).isoformat()}
