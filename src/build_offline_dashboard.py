"""Generate a single-file STAMP archive for download behind GitHub authentication.

Never rely on an exact asset URL: production HTML cache-busts script/style assets.
"""
import json,pathlib,re
from private_dashboard import build
ROOT=pathlib.Path(__file__).resolve().parents[1]
def generate(root=ROOT):
 template=(root/"dashboard"/"private.html").read_text(encoding="utf-8")
 css=(root/"dashboard"/"private.css").read_text(encoding="utf-8")
 js=(root/"dashboard"/"private.js").read_text(encoding="utf-8")
 data=build()
 data["source"]="offline_snapshot"
 payload=json.dumps(data,allow_nan=False,separators=(",",":")).replace("&","\\u0026").replace("<","\\u003c").replace(">","\\u003e")
 template,styles=re.subn(r'<link\s+rel="stylesheet"\s+href="/assets/style\.css(?:\?[^"]*)?"\s*/?>',lambda m:"<style>"+css+"</style>",template,count=1)
 template,scripts=re.subn(r'<script\s+src="/assets/app\.js(?:\?[^"]*)?"\s+defer></script>',lambda m:'<script type="application/json" id="stamp-snapshot">'+payload+'</script><script>'+js+'</script>',template,count=1)
 if styles!=1 or scripts!=1 or 'id="stamp-snapshot"' not in template:
  raise ValueError("Offline template integration failed: expected exactly one CSS and JS asset")
 dest=root/"dashboard"/"private-offline.html"
 dest.write_text(template,encoding="utf-8")
 return dest
if __name__=="__main__":print(generate())
