from __future__ import annotations

import struct
import uuid
import zlib
from dataclasses import asdict, dataclass, field
from typing import Any, Literal


Layer = Literal["ground", "sea", "air", "space"]
Health = Literal["healthy", "degraded", "failed", "recovering"]


@dataclass(frozen=True)
class NetworkNode:
    id: str
    type: str
    layer: Layer
    lat: float
    lng: float
    status: Health = "healthy"
    altitude: float | None = None
    capacityKbps: float = 1000
    latencyMs: float = 10
    reliability: float = 0.99
    powerRemaining: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["position"] = {
            "lat": value.pop("lat"),
            "lng": value.pop("lng"),
            "altitude": value.pop("altitude"),
        }
        return value


@dataclass(frozen=True)
class NetworkLink:
    id: str
    source: str
    target: str
    medium: Literal["fiber", "5g", "wifi", "lora", "satellite", "mesh"]
    latencyMs: float
    bandwidthKbps: float
    packetLoss: float
    reliability: float
    status: Health = "healthy"
    bidirectional: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Incident:
    id: str
    type: str
    severity: float
    startedAt: str
    affectedArea: dict[str, Any]
    affectedNodes: tuple[str, ...]
    demandMultiplier: float
    affectedLinks: tuple[str, ...] = ()
    weatherDegradation: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["affectedNodes"] = list(self.affectedNodes)
        value["affectedLinks"] = list(self.affectedLinks)
        return value


@dataclass(frozen=True)
class EmergencyMessage:
    """Fixed 53-byte StarryLink emergency packet.

    Layout (network byte order):
      magic[4], version[1], UUID[16], epoch_ms[8], latitude_e6[4],
      longitude_e6[4], accuracy_m[2], category[1], priority[1], ttl_s[2],
      reserved[6], crc32[4].
    """

    id: str
    category: Literal["medical", "trapped", "unable_to_call", "other"]
    timestamp: int
    lat: float
    lng: float
    priority: int
    ttl: int
    accuracy: int = 0

    MAGIC = b"SLV1"
    VERSION = 1
    FORMAT_WITHOUT_CRC = ">4sB16sQiiHBBH6s"
    FORMAT = ">4sB16sQiiHBBH6sI"
    CATEGORY_CODES = {"medical": 1, "trapped": 2, "unable_to_call": 3, "other": 255}

    def _uuid_bytes(self) -> bytes:
        try:
            return uuid.UUID(self.id).bytes
        except ValueError:
            return uuid.uuid5(uuid.NAMESPACE_URL, f"starrylink:{self.id}").bytes

    def serialize(self) -> bytes:
        without_crc = struct.pack(
            self.FORMAT_WITHOUT_CRC,
            self.MAGIC,
            self.VERSION,
            self._uuid_bytes(),
            max(0, int(self.timestamp)),
            int(round(self.lat * 1_000_000)),
            int(round(self.lng * 1_000_000)),
            max(0, min(65535, int(self.accuracy))),
            self.CATEGORY_CODES[self.category],
            max(0, min(255, int(self.priority))),
            max(0, min(65535, int(self.ttl))),
            b"\0" * 6,
        )
        crc = zlib.crc32(without_crc) & 0xFFFFFFFF
        packet = without_crc + struct.pack(">I", crc)
        if len(packet) != self.payload_bytes:
            raise AssertionError(f"Emergency packet must be {self.payload_bytes} bytes, got {len(packet)}")
        return packet

    @property
    def payload_bytes(self) -> int:
        return struct.calcsize(self.FORMAT)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "category": self.category,
            "timestamp": self.timestamp,
            "location": {"lat": self.lat, "lng": self.lng, "accuracy": self.accuracy},
            "priority": self.priority,
            "ttl": self.ttl,
            "payloadBytes": self.payload_bytes,
            "serialization": "SLV1 fixed binary, network byte order, CRC32",
            "packetHex": self.serialize().hex(),
        }
