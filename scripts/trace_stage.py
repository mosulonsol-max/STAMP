"""Record stage results and same-run artifact handoffs observed at file open."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = {
    "data/latest.json", "data/learning_controller.json", "data/candle_quality.json",
    "data/forecast_journal.jsonl", "data/forecast_activity.json",
    "data/forecast_scorecard.json", "data/model_registry.json",
    "data/model_diagnosis.json", "data/multi_asset_forecasts.json",
    "data/evidence_sources.json", "data/candles/15m.json",
    "data/candles/1h.json", "data/candles/4h.json", "data/candles/1d.json",
}


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def fingerprint(path):
    try:
        with path.open("rb") as source:
            return {"sha256": hashlib.file_digest(source, "sha256").hexdigest(),
                    "bytes": os.fstat(source.fileno()).st_size}
    except OSError:
        return None


def observe(read_log, script, args):
    # Use the same argv and script directory as direct Python execution.
    sys.argv = [script, *args]
    sys.path[0] = str(Path(script).resolve().parent)
    paths = {str(ROOT / name): name for name in ARTIFACTS}
    seen = set()
    recording = False
    with open(read_log, "w", encoding="utf-8") as log:
        def record_open(event, args):
            nonlocal recording
            if recording or event != "open":
                return
            path, mode, flags = args
            if not isinstance(path, str) or flags & (os.O_WRONLY | os.O_RDWR):
                return
            name = paths.get(os.path.abspath(path))
            if not name:
                return
            recording = True
            try:
                content = fingerprint(ROOT / name)
                if content and (name, content["sha256"]) not in seen:
                    seen.add((name, content["sha256"]))
                    log.write(json.dumps({"artifact": name, "observed_utc": utc_now(), **content}) + "\n")
                    log.flush()
            finally:
                recording = False

        sys.addaudithook(record_open)
        runpy.run_path(script, run_name="__main__")


def main():
    stage, *command = sys.argv[1:]
    directory = Path(os.environ["RUNNER_TEMP"])
    trace = directory / "stamp-stage-trace.jsonl"
    reads = directory / f"stamp-reads-{stage}.jsonl"
    previous = [json.loads(line) for line in trace.read_text().splitlines()] if trace.exists() else []
    before = {name: fingerprint(ROOT / name) for name in ARTIFACTS}
    start = utc_now()
    if len(command) >= 2 and command[0] in {"python", "python3"} and command[1].endswith(".py"):
        command = [command[0], __file__, "--observe", str(reads), *command[1:]]
    result = subprocess.run(command, check=False)
    finished = utc_now()
    outputs = []
    if result.returncode == 0:
        for name in sorted(ARTIFACTS):
            content = fingerprint(ROOT / name)
            if content and content != before[name]:
                outputs.append({"artifact": name, **content})
    handoffs = []
    for line in reads.read_text().splitlines() if reads.exists() else ():
        event = json.loads(line)
        latest_writer = next((entry for entry in reversed(previous)
                              if any(item["artifact"] == event["artifact"] for item in entry.get("outputs", []))), None)
        if latest_writer and any(item["artifact"] == event["artifact"] and item["sha256"] == event["sha256"]
                                 for item in latest_writer["outputs"]):
            handoffs.append({"from": latest_writer["stage"], "to": stage, **event})
    record = {"stage": stage, "started_utc": start, "finished_utc": finished,
              "status": "success" if result.returncode == 0 else "failure",
              "outputs": outputs, "handoffs": handoffs}
    with trace.open("a", encoding="utf-8") as output:
        output.write(json.dumps(record) + "\n")
    return result.returncode


if __name__ == "__main__":
    if sys.argv[1] == "--observe":
        observe(sys.argv[2], sys.argv[3], sys.argv[4:])
    else:
        sys.exit(main())
