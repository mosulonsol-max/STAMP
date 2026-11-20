"""Bounded HTTP reads and streaming archive serialization."""
import gzip,io,json
import ijson

def encode_state(data):
    output=io.BytesIO()
    with gzip.GzipFile(fileobj=output,mode='wb',compresslevel=3,mtime=0) as zipped:
        with io.TextIOWrapper(zipped,encoding='utf-8') as text:
            json.dump(data,text,separators=(',',':'),ensure_ascii=False,allow_nan=False)
    return output.getvalue()

def decode_state(payload):
    with gzip.GzipFile(fileobj=io.BytesIO(payload),mode='rb') as zipped:
        # Parse incrementally: json.load first materializes the entire decompressed
        # UTF-8 string alongside the archive objects, exceeding small workers.
        data=next(ijson.items(zipped,'',use_float=True))
    if not isinstance(data,dict):raise ValueError('invalid_research_state')
    return data

PAIR_MAPS=('approvals','learning','feedback','validation','measurement_summary','model_selections')
def pair_states(data):
    groups={}
    for row in data.get('records') or []:
        pair=row.get('pair')
        if pair:groups.setdefault(pair,[]).append(row)
    decisions=(data.get('autonomous_review') or {}).get('decisions') or {}
    for pair,records in groups.items():
        state={key:data.get(key) for key in ('universe','loop_updated_at_utc','checked_at_utc','cycle_result','model_selection_diagnostics','settlement')}
        state.update(records=records,archive_records_total=len(data.get('records') or []),retry_pairs=[pair] if pair in (data.get('retry_pairs') or []) else [])
        for key in PAIR_MAPS:state[key]={k:v for k,v in (data.get(key) or {}).items() if k.startswith(pair+'|')}
        state['autonomous_review']={key:(data.get('autonomous_review') or {}).get(key) for key in ('checked_at_utc','policy')}
        state['autonomous_review']['decisions']={r['id']:decisions[r['id']] for r in records if r.get('id') in decisions}
        evidence=data.get('venue_evidence') or {}
        state['venue_evidence']={'retrieved_at_utc':evidence.get('retrieved_at_utc'),'pairs':{pair:evidence.get('pairs',{}).get(pair,{})}}
        yield pair,state

def publish_pair_states(conn,data):
    conn.execute('CREATE TABLE IF NOT EXISTS research_pair_state (pair TEXT PRIMARY KEY, payload BYTEA NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())')
    with conn.cursor() as cursor:
        cursor.executemany('INSERT INTO research_pair_state (pair,payload) VALUES (%s,%s) ON CONFLICT (pair) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()',((pair,encode_state(state)) for pair,state in pair_states(data)))

def load_pair(pair):
    import os
    if not os.getenv('DATABASE_URL'):
        from multi_asset_governor import load
        return next((state for key,state in pair_states(load()) if key==pair),{'records':[]})
    import psycopg
    with psycopg.connect(os.environ['DATABASE_URL'],connect_timeout=5) as conn:
        exists=conn.execute("SELECT to_regclass('public.research_pair_state')").fetchone()[0]
        if not exists:raise RuntimeError('pair_index_initializing')
        row=conn.execute('SELECT payload FROM research_pair_state WHERE pair=%s',(pair,)).fetchone()
        if row:return decode_state(row[0])
        # An unobserved pair must not trigger a full-archive decode in a request thread.
        return {'records':[]}
