from __future__ import annotations

from abc import ABC, abstractmethod

from engine.scoring_engine import rank_candidates


class DecisionProvider(ABC):
    @abstractmethod
    def evaluate(self, decision_input: dict) -> dict:
        raise NotImplementedError


class LocalDeterministicDecisionProvider(DecisionProvider):
    provider_id = "local-deterministic-v1"

    def evaluate(self, decision_input: dict) -> dict:
        result = rank_candidates(
            decision_input["candidates"],
            decision_input["simulations"],
            decision_input.get("weights"),
        )
        result["provider"] = self.provider_id
        result["authority"] = "DETERMINISTIC_CORE"
        return result


class ARCIDecisionProvider(DecisionProvider):
    """Stable future hook. ARCI proposals must still pass local validation."""

    def evaluate(self, decision_input: dict) -> dict:
        raise RuntimeError("ARCI provider is UNCONNECTED; local deterministic provider remains authoritative")
