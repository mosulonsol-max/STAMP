"""Bounded public-source evidence. Unavailable never means zero or no event."""
import datetime as dt,json,math,os,pathlib
from concurrent.futures import ThreadPoolExecutor
import requests
CONTRACT="EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc"
HOUR=3600000
ROOT=pathlib.Path(__file__).resolve().parents[1]

def utc():return dt.datetime.now(dt.timezone.utc).isoformat()

def get(url,params=None):
    try:
        r=requests.get(url,params=params,timeout=10,headers={"User-Agent":"STAMP-evidence/2","Accept":"application/json"})
        r.raise_for_status();return r.json(),None
    except Exception as exc:return None,type(exc).__name__

def rpc(method,params):
    # Independent public fallback improves availability; never expose a private URL.
    configured=os.getenv("SOLANA_RPC_URL","").strip()
    endpoints=list(dict.fromkeys([configured or "https://api.mainnet-beta.solana.com","https://solana-rpc.publicnode.com"]))
    errors=[]
    for endpoint in endpoints:
        try:
            r=requests.post(endpoint,json={"jsonrpc":"2.0","id":1,"method":method,"params":params},timeout=8)
            r.raise_for_status();d=r.json()
            if d.get("error"):
                errors.append("RPC_"+str(d["error"].get("code","error")));continue
            if "result" not in d:errors.append("missing_rpc_result");continue
            return d["result"],None
        except Exception as exc:errors.append(type(exc).__name__)
    return None,"all_providers_failed:"+",".join(errors)

def returns(cs):
    out={}
    for a,b in zip(cs,cs[1:]):
        try:
            if b["t"]-a["t"]==HOUR and a["c"]>0 and b["c"]>0:out[b["t"]+HOUR]=math.log(b["c"]/a["c"])
        except (KeyError,TypeError,ValueError):continue
    return out

def correlation(left,right):
    a=returns(left);b=returns(right);keys=sorted(a.keys()&b.keys())[-168:]
    result={"status":"insufficient_aligned_returns","samples":len(keys),"method":"Pearson log returns, exact hourly timestamps, no forward fill"}
    if len(keys)<48:return result
    xs=[a[k] for k in keys];ys=[b[k] for k in keys];xm=sum(xs)/len(xs);ym=sum(ys)/len(ys)
    den=math.sqrt(sum((x-xm)**2 for x in xs)*sum((y-ym)**2 for y in ys))
    if not den:return dict(result,status="constant_return_series")
    r=max(-1,min(1,sum((x-xm)*(y-ym) for x,y in zip(xs,ys))/den));clipped=max(-.999999,min(.999999,r))
    z=math.atanh(clipped);error=1.96/math.sqrt(len(keys)-3)
    return dict(result,status="measured",coefficient=r,fisher_95=[math.tanh(z-error),math.tanh(z+error)],
        aligned_through_utc=dt.datetime.fromtimestamp(keys[-1]/1000,dt.timezone.utc).isoformat(),
        warning="Descriptive association, not causation. Fisher interval assumes independent samples; serial dependence can widen uncertainty.")

def market_context(snapshot,root=ROOT):
    from monitor import candles
    stamp=json.loads((root/"data/candles/1h.json").read_text())
    folder=root/"data/context_candles";folder.mkdir(exist_ok=True)
    def one(symbol):
        url="https://api.mexc.com/api/v3/klines";raw,error=get(url,{"symbol":symbol+"USDT","interval":"60m","limit":500})
        result={"source":"MEXC "+symbol+"USDT 1h","retrieved_at_utc":utc(),"error":error}
        if error:return symbol,dict(result,status="unavailable")
        incoming=candles({"data":raw},HOUR);path=folder/(symbol+".json")
        old=json.loads(path.read_text()) if path.exists() else []
        merged={int(c["t"]):c for c in old+incoming};series=[merged[k] for k in sorted(merged)][-5000:]
        path.write_text(json.dumps(series,separators=(",",":"))+"\n")
        return symbol,dict(result,**correlation(stamp,series))
    with ThreadPoolExecutor(max_workers=4) as pool:correlations=dict(pool.map(one,("BTC","ETH","SOL","ZEC")))
    return {"at_utc":utc(),"correlations":correlations,"derivatives":{"status":"no_verified_instrument",
        "reason":"No derivative contract has been verified against this Solana mint; OI/funding must not be invented from spot volume."}}

def burn_instructions(transaction):
    if not isinstance(transaction,dict) or not isinstance(transaction.get("meta"),dict) or transaction["meta"].get("err") is not None:return []
    meta=transaction["meta"];message=(transaction.get("transaction") or {}).get("message") or {}
    keys=[k.get("pubkey") if isinstance(k,dict) else k for k in message.get("accountKeys",[])]
    mint_by_account={}
    for balance in meta.get("preTokenBalances",[])+meta.get("postTokenBalances",[]):
        idx=balance.get("accountIndex")
        if isinstance(idx,int) and idx<len(keys):mint_by_account[keys[idx]]=balance.get("mint")
    instructions=list(message.get("instructions",[]))
    for group in meta.get("innerInstructions",[]):instructions.extend(group.get("instructions",[]))
    result=[]
    for i,ins in enumerate(instructions):
        if not isinstance(ins,dict):continue
        parsed=ins.get("parsed")
        if not isinstance(parsed,dict):continue
        info=parsed.get("info")
        if not isinstance(info,dict):continue
        if ins.get("program") not in ("spl-token","spl-token-2022") or parsed.get("type") not in ("burn","burnChecked"):continue
        mint=info.get("mint") or mint_by_account.get(info.get("account"))
        if mint!=CONTRACT:continue
        token=info.get("tokenAmount") or {}
        amount=info.get("amount") or token.get("amount")
        if amount is not None:result.append({"instruction_index":i,"amount_raw":str(amount),"account":info.get("account"),"mint":mint})
    return result

def onchain(root=ROOT):
    now=utc();result={"retrieved_at_utc":now,"contract":CONTRACT,"source":"Solana finalized JSON-RPC","errors":{}}
    methods={"supply":("getTokenSupply",[CONTRACT,{"commitment":"finalized"}]),
             "largest":("getTokenLargestAccounts",[CONTRACT,{"commitment":"finalized"}]),
             "mint":("getAccountInfo",[CONTRACT,{"encoding":"jsonParsed","commitment":"finalized"}]),
             "signatures":("getSignaturesForAddress",[CONTRACT,{"limit":12,"commitment":"finalized"}])}
    with ThreadPoolExecutor(max_workers=4) as pool:
        fetched=dict(zip(methods,pool.map(lambda v:rpc(*v),methods.values())))
    for name,(data,error) in fetched.items():
        result[name]=data
        if error:result["errors"][name]=error
    supply=(result.get("supply") or {}).get("value") or {};result["supply_raw"]=supply.get("amount");result["decimals"]=supply.get("decimals")
    # Largest accounts are not necessarily distinct people: pools, custody and
    # multiple accounts owned by the same wallet remain explicitly unidentified.
    largest=(result.get("largest") or {}).get("value") or []
    total=int(supply["amount"]) if supply.get("amount","").isdigit() else None
    result["top_accounts"]=[{"token_account":x.get("address"),"amount_raw":x.get("amount"),
        "supply_share":int(x["amount"])/total if total and str(x.get("amount","")).isdigit() else None} for x in largest]
    mint=(result.get("mint") or {}).get("value") or {};program=mint.get("owner")
    result["holders"]={"status":"unavailable","count":None}
    if program:
        accounts,error=rpc("getProgramAccounts",[program,{"encoding":"jsonParsed","commitment":"finalized","withContext":True,"filters":[{"memcmp":{"offset":0,"bytes":CONTRACT}}]}])
        if error:result["errors"]["holders"]=error
        else:
            values=accounts.get("value") if isinstance(accounts,dict) else accounts
            if isinstance(values,list):
                owners={};positive=0
                for a in values:
                    info=(((a.get("account") or {}).get("data") or {}).get("parsed") or {}).get("info") or {}
                    amount=str((info.get("tokenAmount") or {}).get("amount",""))
                    if info.get("mint")==CONTRACT and amount.isdigit() and int(amount)>0 and info.get("owner"):
                        owners[info["owner"]]=owners.get(info["owner"],0)+int(amount);positive+=1
                result["top_wallets"]=[{"owner":owner,"amount_raw":str(amount),"supply_share":amount/total if total else None,"identity":"unattributed_owner_including_pools_and_custody"} for owner,amount in sorted(owners.items(),key=lambda x:x[1],reverse=True)[:20]]
                result["holders"]={"status":"measured","count":len(owners),"positive_token_accounts":positive,"slot":accounts.get("context",{}).get("slot") if isinstance(accounts,dict) else None,
                    "definition":"Unique owners of positive finalized token accounts; exchange customers cannot be counted individually."}
    history=root/"data/onchain_history.jsonl";previous=None
    if history.exists():
        for line in reversed(history.read_text().splitlines()):
            entry=json.loads(line)
            if entry.get("supply_raw") is not None:previous=entry;break
    result["supply_change_raw"]=int(result["supply_raw"])-int(previous["supply_raw"]) if result.get("supply_raw") and previous else None
    result["holders_change"]=result["holders"]["count"]-previous["holders"]["count"] if result["holders"]["count"] is not None and previous and (previous.get("holders") or {}).get("count") is not None else None
    burned=root/"data/verified_burns.jsonl";known=set()
    if burned.exists():known={json.loads(x)["id"] for x in burned.read_text().splitlines() if x.strip()}
    burns=[];signatures=result.pop("signatures",None) or [];examined=0
    for event in signatures[:6]:
        if event.get("err") is not None:continue
        signature=event.get("signature")
        tx,error=rpc("getTransaction",[signature,{"encoding":"jsonParsed","commitment":"finalized","maxSupportedTransactionVersion":0}])
        if error:
            result["errors"]["burn_transactions"]=error;continue
        if not tx:continue
        examined+=1
        for burn in burn_instructions(tx):
            burn.update(id=signature+":"+str(burn["instruction_index"]),signature=signature,event_time_unix=tx.get("blockTime"),retrieved_at_utc=now)
            burns.append(burn)
            if burn["id"] not in known:
                with burned.open("a") as f:f.write(json.dumps(burn)+"\n")
                known.add(burn["id"])
    result["burns"]={"status":"partial_recent_scan" if examined else "unavailable","transactions_examined":examined,"events":burns,
        "warning":"Recent mint-address signatures are not a complete historical burn index. No event in this sample does not establish a halt."}
    result["status"]="measured" if supply else "unavailable"
    if supply:
        with history.open("a") as f:f.write(json.dumps({k:result[k] for k in ("retrieved_at_utc","supply_raw","decimals","holders")})+"\n")
    return result

def collect(snapshot,root=ROOT):
    from contract_news import collect as collect_news
    with ThreadPoolExecutor(max_workers=3) as pool:
        c=pool.submit(market_context,snapshot,root);o=pool.submit(onchain,root);n=pool.submit(collect_news,root)
        context=c.result();chain=o.result();discovered_news=n.result()
    # Existing developer-repository attribution has not been independently
    # verified against the mint. Never turn those commits into confirmed news.
    project=snapshot.get("raw",{}).get("project") or {}
    news={"status":"partial","contract":CONTRACT,"retrieved_at_utc":utc(),
        "repository_events":project.get("data") or [],"repository_attribution":"unverified_against_contract",
        "social_news_status":"no_authenticated_or_verified_feed","verified_causal_events":[],
        "discovery":discovered_news,"reason":"Developer commits and name-matched posts do not establish a price catalyst; require a direct source and contract identity."}
    snapshot["analysis"].update(market_context=context,onchain=chain,news=news)
    (root/"data/evidence_sources.json").write_text(json.dumps({"market_context":context,"onchain":chain,"news":news},ensure_ascii=False,indent=2)+"\n")
    return snapshot

if __name__=="__main__":
    path=ROOT/"data/latest.json";snapshot=collect(json.loads(path.read_text()));path.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"onchain":snapshot["analysis"]["onchain"]["status"],"correlations":{k:v["status"] for k,v in snapshot["analysis"]["market_context"]["correlations"].items()}}))
