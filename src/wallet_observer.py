"""Read-only Solana wallet observations. Never accepts a private key or signs trades."""
import datetime as dt
from decimal import Decimal
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen

ALPHABET="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
TOKEN_PROGRAMS=("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
STAMP_MINT="EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc"
_CACHE={}
_LOCK=threading.Lock()


def public_key(address):
    if not isinstance(address,str) or not 32<=len(address)<=44 or any(c not in ALPHABET for c in address):
        raise ValueError("invalid_public_address")
    value=0
    for char in address:value=value*58+ALPHABET.index(char)
    raw=b"\0"*(len(address)-len(address.lstrip("1")))+value.to_bytes((value.bit_length()+7)//8,"big")
    if len(raw)!=32:raise ValueError("invalid_public_address")
    return address


def rpc(method,params):
    endpoint=os.getenv("SOLANA_RPC_URL","https://api.mainnet-beta.solana.com")
    if not endpoint.startswith("https://"):raise ValueError("invalid_rpc_configuration")
    body=json.dumps({"jsonrpc":"2.0","id":1,"method":method,"params":params}).encode()
    request=Request(endpoint,data=body,headers={"Content-Type":"application/json","User-Agent":"STAMP-wallet-observer/1.0"})
    with urlopen(request,timeout=8) as response:raw=response.read(750001)
    if len(raw)>750000:raise ValueError("oversized_rpc_response")
    payload=json.loads(raw)
    if not isinstance(payload,dict) or payload.get("error") or "result" not in payload:raise ValueError("rpc_unavailable")
    return payload["result"]


def observe(address):
    owner=public_key(address)
    with _LOCK:
        cached=_CACHE.get(owner)
        if cached and time.monotonic()-cached[0]<15:return cached[1]
    with ThreadPoolExecutor(max_workers=3) as pool:
        balance=pool.submit(rpc,"getBalance",[owner,{"commitment":"confirmed"}])
        accounts=[pool.submit(rpc,"getTokenAccountsByOwner",[owner,{"programId":program},{"encoding":"jsonParsed","commitment":"confirmed"}])
                  for program in TOKEN_PROGRAMS]
        lamports=balance.result().get("value")
        if type(lamports) is not int or lamports<0:raise ValueError("invalid_balance")
        positions={}
        for task in accounts:
            result=task.result()
            for item in result.get("value",[]):
                info=(((item.get("account") or {}).get("data") or {}).get("parsed") or {}).get("info") or {}
                mint=info.get("mint");amount=info.get("tokenAmount") or {}
                if not isinstance(mint,str):continue
                try:public_key(mint)
                except ValueError:continue
                raw=amount.get("amount");decimals=amount.get("decimals")
                if not isinstance(raw,str) or not raw.isdigit() or type(decimals) is not int or not 0<=decimals<=18:continue
                if int(raw)>0:
                    row=positions.setdefault(mint,{"mint":mint,"raw_amount":0,"decimals":decimals})
                    if row["decimals"]==decimals:row["raw_amount"]+=int(raw)
    tokens=[]
    for row in positions.values():
        tokens.append({"mint":row["mint"],"amount":str(Decimal(row["raw_amount"])/10**row["decimals"]),
                       "raw_amount":str(row["raw_amount"]),"decimals":row["decimals"]})
    tokens.sort(key=lambda row:(row["mint"]!=STAMP_MINT,-int(row["raw_amount"])))
    result={"address":owner,"observed_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
            "source":"Solana JSON-RPC confirmed","sol":str(Decimal(lamports)/10**9),
            "stamp":next((row["amount"] for row in tokens if row["mint"]==STAMP_MINT),"0"),
            "tokens":tokens[:25],"token_count":len(tokens),"mode":"read_only",
            "execution":"disabled_no_signer","profit_loss":None}
    with _LOCK:_CACHE[owner]=(time.monotonic(),result)
    return result
