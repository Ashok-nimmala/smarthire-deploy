"""
cache.py
--------
DynamoDB-backed cache and rate limiter. No Redis and no in-process dict, so both
survive a cold start and stay correct across concurrent invocations.

Two uses:
1. LLM response cache — hash(prompt) -> JSON, 24h TTL. Cuts cost and latency.
2. Rate limiter — atomic counter inside a fixed window.

(An earlier build also kept a JWT blacklist and an FCM token here. This build
has neither: sessions are opaque rows that simply expire, and there are no
notifications at all.)

The table has PK cache_key (S) and DynamoDB TTL on expires_at. Expiry is ALSO
checked on read, because a TTL sweep can lag by up to 48 hours.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Callable, Optional

from botocore.exceptions import ClientError

from db import T, _from_ddb, _to_ddb, ttl_from_now


def _hash_key(namespace: str, payload: Any) -> str:
    """Stable hash of any JSON-serialisable payload."""
    body = json.dumps(payload, sort_keys=True, default=str)
    return f"{namespace}:{hashlib.sha256(body.encode()).hexdigest()[:32]}"


def get(cache_key: str) -> Optional[dict]:
    try:
        item = T("cache").get_item(Key={"cache_key": cache_key}).get("Item")
    except ClientError:
        return None
    if not item:
        return None
    if int(item.get("expires_at", 0)) < int(time.time()):
        return None      # TTL sweeps are eventual; enforce on read
    return _from_ddb(item.get("value"))


def put(cache_key: str, value: dict, ttl_seconds: int = 86400) -> None:
    try:
        T("cache").put_item(Item={
            "cache_key": cache_key,
            "value": _to_ddb(value),
            "expires_at": ttl_from_now(ttl_seconds),
        })
    except ClientError as e:
        print(f"cache put failed for {cache_key[:40]}: {e}")


def delete(cache_key: str) -> None:
    try:
        T("cache").delete_item(Key={"cache_key": cache_key})
    except ClientError:
        pass


def get_or_compute(namespace: str, payload: Any, compute: Callable[[], dict],
                   ttl_seconds: int = 86400) -> dict:
    """
    Cache lookup, else compute and store. Logs hit/miss so the LLM cache ratio is
    visible in CloudWatch (spec section 18).
    """
    key = _hash_key(namespace, payload)
    hit = get(key)
    if hit is not None:
        print(f"cache HIT {namespace}")
        return hit
    print(f"cache MISS {namespace}")
    result = compute()
    if isinstance(result, dict):
        put(key, result, ttl_seconds)
    return result


# ---------------------------------------------------------------------------
# Rate limiter — fixed window, atomic counter
# ---------------------------------------------------------------------------

def check_rate(bucket: str, limit: int, window_seconds: int) -> bool:
    """
    True when the caller is under the limit, False when it has been exceeded.

    A single atomic UpdateItem does both the increment and the window bookkeeping:
    `hits` is incremented with ADD, and `window_start` is stamped once with
    if_not_exists. When the stamped window has already elapsed we overwrite the
    row and start a fresh one, so a stale row cannot lock a caller out forever.

    Fails OPEN: a DynamoDB problem must not block real traffic.
    """
    key = f"ratelimit:{bucket}"
    now = int(time.time())
    try:
        r = T("cache").update_item(
            Key={"cache_key": key},
            UpdateExpression=(
                "SET window_start = if_not_exists(window_start, :now), "
                "expires_at = if_not_exists(expires_at, :exp) ADD hits :one"
            ),
            ExpressionAttributeValues={
                ":now": now, ":exp": now + window_seconds, ":one": 1,
            },
            ReturnValues="ALL_NEW",
        )
        attrs = r["Attributes"]
        started = int(attrs.get("window_start", now))
        hits = int(attrs.get("hits", 1))

        if now - started >= window_seconds:
            # The window elapsed. Reset it and count this call as the first.
            T("cache").put_item(Item={
                "cache_key": key, "hits": 1,
                "window_start": now, "expires_at": now + window_seconds,
            })
            return True
        return hits <= limit
    except ClientError as e:
        print(f"rate limiter degraded for {bucket}: {e}")
        return True
