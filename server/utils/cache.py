"""
Ask Twice — 缓存管理（MVP 内存缓存）
"""
import hashlib
import time


class MemoryCache:
    """简单的内存缓存，后续可替换为 Redis"""

    def __init__(self, ttl: int = 1800, max_size: int = 500):
        self._cache: dict[str, dict] = {}
        self._ttl = ttl
        self._max_size = max_size

    def _make_key(self, text: str) -> str:
        return hashlib.md5(text.encode()).hexdigest()

    def get(self, text: str) -> dict | None:
        key = self._make_key(text)
        entry = self._cache.get(key)
        if not entry:
            return None
        if time.time() - entry["ts"] > self._ttl:
            del self._cache[key]
            return None
        return entry["data"]

    def set(self, text: str, data: dict):
        key = self._make_key(text)
        # 超出容量时清理最旧的
        if len(self._cache) >= self._max_size:
            oldest = sorted(self._cache.items(), key=lambda x: x[1]["ts"])
            for k, _ in oldest[: len(oldest) // 4]:
                del self._cache[k]
        self._cache[key] = {"data": data, "ts": time.time()}

    def clear(self):
        self._cache.clear()


# 全局缓存实例
cache = MemoryCache()
