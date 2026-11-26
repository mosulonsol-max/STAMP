"""Bounded HTTP reads and streaming archive serialization."""
import gzip,io,json
import ijson
from array import array


def _json_default(value):
    if isinstance(value,array):return value.tolist()
    raise TypeError(f'unsupported archive value: {type(value).__name__}')

def encode_state(data):
    output=io.BytesIO()
    with gzip.GzipFile(fileobj=output,mode='wb',compresslevel=3,mtime=0) as zipped:
        with io.TextIOWrapper(zipped,encoding='utf-8') as text:
            json.dump(data,text,separators=(',',':'),ensure_ascii=False,allow_nan=False,default=_json_default)
    return output.getvalue()

def decode_state(payload, *, skip_review=False):
    # Share repeated JSON field names inside this decode. The table is local
    # and capped so growing archive identifiers cannot accumulate across cycles.
    field_names = {}
    values = {}

    class ArchiveMap(dict):
        __slots__ = ()

        def __setitem__(self, key, value):
            if "|" not in key and len(key) <= 48 and len(field_names) < 512:
                key = field_names.setdefault(key, key)
            if key in ("pair", "frame", "model_version", "method", "validation_at_issue",
                       "model_origin", "reference_at_utc", "due_at_utc", "target_at_utc",
                       "measured_at_utc", "reason", "status") and isinstance(value, str):
                if len(values) < 32768:
                    value = values.setdefault(value, value)
            super().__setitem__(key, value)

    with gzip.GzipFile(fileobj=io.BytesIO(payload),mode='rb') as zipped:
        # Parse incrementally: json.load first materializes the entire decompressed
        # UTF-8 string alongside the archive objects, exceeding small workers.
        if skip_review:
            # The governor recreates every review from the original forecasts.
            # Skip this derived map before allocating its Python objects.
            events = (item for item in ijson.parse(zipped, use_float=True)
                      if item[0] != 'autonomous_review'
                      and not item[0].startswith('autonomous_review.')
                      and item != ('', 'map_key', 'autonomous_review'))
            data = next(ijson.items(events, '', map_type=ArchiveMap))
        else:
            data = next(ijson.items(zipped,'',use_float=True,map_type=ArchiveMap))
    if not isinstance(data,dict):raise ValueError('invalid_research_state')
    # ijson assigns a list to its parent before emitting its elements.
    # Compact each feature vector only after the parser has filled it.
    for record in data.get("records", ()):
        features = record.get("features")
        if isinstance(features, dict) and isinstance(features.get("recent_returns"), list):
            try:
                features["recent_returns"] = array("d", features["recent_returns"])
            except (TypeError, OverflowError):
                pass
    return data

ARCHIVE_CHUNK_SIZE = 256 * 1024


def prepare_archive_chunks(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS research_state_chunks (
            position INTEGER PRIMARY KEY, revision TIMESTAMPTZ NOT NULL,
            payload BYTEA NOT NULL
        )
    """)


def read_archive(conn, revision):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT payload FROM research_state_chunks
            WHERE revision=%s ORDER BY position
        """, (revision,))
        chunks = [row[0] for row in cursor]
    if chunks:
        return decode_state(b"".join(chunks), skip_review=True)
    # The original snapshot remains readable until the first chunked commit.
    row = conn.execute("SELECT payload FROM research_state_compact WHERE id=1").fetchone()
    return decode_state(row[0], skip_review=True)


def write_archive(conn, data):
    payload = encode_state(data)
    revision = conn.execute("""
        UPDATE research_state_compact SET updated_at=clock_timestamp()
        WHERE id=1 RETURNING updated_at
    """).fetchone()[0]
    with conn.cursor() as cursor:
        cursor.executemany("""
            INSERT INTO research_state_chunks(position,revision,payload) VALUES (%s,%s,%b)
            ON CONFLICT (position) DO UPDATE
            SET revision=EXCLUDED.revision,payload=EXCLUDED.payload
        """, ((position, revision, payload[offset:offset + ARCHIVE_CHUNK_SIZE])
              for position, offset in enumerate(range(0, len(payload), ARCHIVE_CHUNK_SIZE))))
    conn.execute("DELETE FROM research_state_chunks WHERE revision<>%s", (revision,))


PAIR_MAPS=('approvals','learning','feedback','validation','measurement_summary','model_selections','forecast_adaptation','peer_model_overrides')
def pair_states(data):
    groups={}
    for row in data.get('records') or []:
        pair=row.get('pair')
        if pair:groups.setdefault(pair,[]).append(row)
    decisions=(data.get('autonomous_review') or {}).get('decisions') or {}
    for pair,records in groups.items():
        state={key:data.get(key) for key in ('universe','loop_updated_at_utc','checked_at_utc','cycle_result','model_selection_diagnostics','settlement','peer_models')}
        state.update(records=records,archive_records_total=len(data.get('records') or []),retry_pairs=[pair] if pair in (data.get('retry_pairs') or []) else [])
        for key in PAIR_MAPS:state[key]={k:v for k,v in (data.get(key) or {}).items() if k.startswith(pair+'|')}
        state['autonomous_review']={key:(data.get('autonomous_review') or {}).get(key) for key in ('checked_at_utc','policy')}
        state['autonomous_review']['decisions']={r['id']:decisions[r['id']] for r in records if r.get('id') in decisions}
        evidence=data.get('venue_evidence') or {}
        state['venue_evidence']={'retrieved_at_utc':evidence.get('retrieved_at_utc'),'pairs':{pair:evidence.get('pairs',{}).get(pair,{})}}
        yield pair,state

def publish_pair_states(conn,data):
    conn.execute('CREATE TABLE IF NOT EXISTS research_pair_state (pair TEXT PRIMARY KEY, payload BYTEA NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())')
    conn.execute("INSERT INTO research_pair_state(pair,payload) VALUES ('__peer_models__',%b) ON CONFLICT (pair) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()", (encode_state({'records':[], 'peer_models':data.get('peer_models',{}), 'loop_updated_at_utc':data.get('loop_updated_at_utc')}),))
    conn.execute("INSERT INTO research_pair_state(pair,payload) VALUES ('__market_news__',%b) ON CONFLICT (pair) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()", (encode_state({'records':[], 'news_intelligence':data.get('news_intelligence',{}), 'loop_updated_at_utc':data.get('loop_updated_at_utc')}),))
    with conn.cursor() as cursor:
        cursor.executemany('INSERT INTO research_pair_state (pair,payload) VALUES (%s,%b) ON CONFLICT (pair) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()',((pair,encode_state(state)) for pair,state in pair_states(data)))

def load_pair(pair):
    import os
    if not os.getenv('DATABASE_URL'):
        from multi_asset_governor import load
        return next((state for key,state in pair_states(load()) if key==pair),{'records':[]})
    import psycopg
    with psycopg.connect(os.environ['DATABASE_URL'],connect_timeout=5) as conn:
        exists=conn.execute("SELECT to_regclass('public.research_pair_state')").fetchone()[0]
        if not exists:raise RuntimeError('pair_index_initializing')
        row=conn.execute("""
            SELECT payload FROM research_pair_state
            WHERE pair=%s OR pair='__peer_models__'
            ORDER BY (pair=%s) DESC LIMIT 1
        """,(pair,pair)).fetchone()
        return decode_state(row[0]) if row else {'records':[]}
