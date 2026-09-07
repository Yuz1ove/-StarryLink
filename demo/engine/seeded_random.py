from __future__ import annotations

import hashlib


class SeededRandom:
    """Portable xorshift32 PRNG; never delegates core decisions to random.Random."""

    def __init__(self, seed: str | int):
        digest = hashlib.sha256(str(seed).encode("utf-8")).digest()
        self.state = int.from_bytes(digest[:4], "big") or 0x6D2B79F5

    def next_u32(self) -> int:
        value = self.state & 0xFFFFFFFF
        value ^= (value << 13) & 0xFFFFFFFF
        value ^= value >> 17
        value ^= (value << 5) & 0xFFFFFFFF
        self.state = value & 0xFFFFFFFF
        return self.state

    def random(self) -> float:
        return self.next_u32() / 4294967296.0

    def uniform(self, low: float, high: float) -> float:
        return low + (high - low) * self.random()
