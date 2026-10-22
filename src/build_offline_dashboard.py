"""Generate a single-file, offline, GitHub-login-protected STAMP dashboard snapshot."""
import json,pathlib
from private_dashboard import build
ROOT=pathlib.Path(__file__).resolve().parents[1]
def generate(root=ROOT):
 template=(root/"dashboard"/"private.html").read_text(encoding="utf-8")
 css=(root/"dashboard"/"private.css").read_text(encoding="utf-8")
 js=(root/"dashboard"/"private.js").read_text(encoding="utf-8")
 data=build()
 data["source"]="offline_snapshot"
 payload=json.dumps(data,allow_nan=False,separators=(",",":")).replace("&","\\u0026").replace("<","\\u003c").replace(">","\\u003e")
 template=template.replace('<link rel="stylesheet" href="/assets/style.css">',"<style>"+css+"</style>")
 template=template.replace('<script src="/assets/app.js" defer></script>','<script type="application/json" id="stamp-snapshot">'+payload+'</script><script>'+js+'</script>')
 if 'id="stamp-snapshot"' not in template:raise ValueError("Offline template integration failed")
 dest=root/"dashboard"/"private-offline.html"
 dest.write_text(template,encoding="utf-8")
 return dest
if __name__=="__main__":print(generate())
