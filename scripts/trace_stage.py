"""Record the actual start, finish and result of one workflow command."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    stage, *command = sys.argv[1:]
    trace = Path(os.environ["RUNNER_TEMP"]) / "stamp-stage-trace.jsonl"
    start = utc_now()
    result = subprocess.run(command, check=False)
    record = {"stage": stage, "started_utc": start, "finished_utc": utc_now(),
              "status": "success" if result.returncode == 0 else "failure"}
    with trace.open("a", encoding="utf-8") as output:
        output.write(json.dumps(record) + "\n")
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
