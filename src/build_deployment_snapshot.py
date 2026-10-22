"""Bundle a compact authenticated STAMP research snapshot for Vercel Python Functions.

Run by GitHub Actions once per UTC hour. No secrets, token or GitHub API required.
"""
import base64,json,pathlib,sys,zlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from private_dashboard import build

def generate(root=ROOT):
 # Build from actual checked-in research data, not a previously embedded module.
 data=build()
 data.pop("live_quote",None)  # Public ticker is fetched independently at request time.
 data["source"]="deployment_snapshot"
 payload=json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":")).encode("utf-8")
 encoded=base64.b64encode(zlib.compress(payload,9)).decode("ascii")
 dest=root/"src"/"deployment_snapshot.py"
 dest.write_text('"""Auto-generated authenticated STAMP research snapshot; do not edit."""\nCOMPRESSED_JSON = '+repr(encoded)+'\n',encoding="utf-8")
 print("Embedded STAMP snapshot:",len(payload),"raw bytes;",len(encoded),"encoded bytes; observed",data.get("observed_utc"))
 return dest

if __name__=="__main__":generate()
