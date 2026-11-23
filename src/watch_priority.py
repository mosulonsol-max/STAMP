"""A bounded, expiring queue for dashboard-selected markets."""
import threading
import time
from collections import OrderedDict

_TTL = 600
_CAPACITY = 32
_requests = OrderedDict()
_lock = threading.Lock()


def request(pair):
    with _lock:
        _requests[pair] = time.monotonic() + _TTL
        while len(_requests) > _CAPACITY:
            _requests.popitem(last=False)


def select(eligible, limit):
    now = time.monotonic()
    allowed = set(eligible)
    with _lock:
        for pair, deadline in list(_requests.items()):
            if deadline <= now:
                del _requests[pair]
        chosen = [pair for pair in _requests if pair in allowed][:limit]
        for pair in chosen:
            _requests.move_to_end(pair)
        return chosen
