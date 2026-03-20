
import logging

from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass


import numpy as np


from langchain_core.messages import HumanMessage, AIMessage

from chat_app.services import logging_utils as lu 

from rag_vectorstore.services.vdb_services import get_embeddings_model
from .chatUtils import cosine_similarity

logger = logging.getLogger(__name__)

# ---- Helper functions for TransitionScorer ----
def clamp01(x: float) -> float:
    # clamp values between 0 and 1
    return max(0.0, min(1.0, float(x)))

def cos_sim_normalized(cos_sim: float) -> float:
    # cosine similarity is usually [-1, 1]; map to [0, 1]
    return clamp01((float(cos_sim) + 1.0) / 2.0)

def dissim_from_cos(cos_sim: float) -> float:
    # dissimilarity in [0,1]
    return 1.0 - cos_sim_normalized(cos_sim)


@dataclass
class TransitionWeights:
    """
    Weights are values between 0 and 1, and should sum to 1.0
    They control the importance of each component in the final transition score.
    """
    WA: float = 0.33   # alignment of user responses with transition criteria
    WTC: float = 0.33  # turn cost (increase with number of user turns)
    WBC: float = 0.33  # user vs assistant response mismatch (might indicate disengagement)


class TransitionScorer:
    """
    Rule-based transition scorer.

    - Components (D, TC, BC) are each computed in [0,1].
    - Final transition score is the weighted sum of the components
    - Force transition after max_turns is reached.
    """

    def __init__(
        self,
        *,
        max_turns: int = 5,
        weights: Optional[TransitionWeights] = None,
        last_k_pairs: Optional[int] = None, # number of last user/assistant pairs to consider
        cache_embeddings: bool = True,
    ):
        self.max_turns = int(max_turns)
        self.weights = weights or TransitionWeights()
        self.last_k_pairs = last_k_pairs
        self.cache_embeddings = cache_embeddings
        self._emb_cache: Dict[str, List[float]] = {}

    # ---- embeddings / similarity ----
    def _embed(self, text: str) -> List[float]:
        text = text or ""
        if self.cache_embeddings and text in self._emb_cache:
            return self._emb_cache[text]

        model = get_embeddings_model()
        vec = model.embed_query(text)  # List[float]

        if self.cache_embeddings:
            self._emb_cache[text] = vec
        return vec

    def _cos_sim(self, a: str, b: str) -> float:
        va = self._embed(a)
        vb = self._embed(b)
        return cosine_similarity(va, vb)

    # ---- helpers for fetching history ----
    def _get_user_utts(self, state_history: List[Any]) -> List[str]:
        """Return all user utterances in the given state."""
        return [str(m.content) for m in state_history if isinstance(m, HumanMessage)]

    def _count_user_turns(self, state_history: List[Any]) -> int:
        return len([m for m in state_history if isinstance(m, HumanMessage)])

    def _get_pairs(self, state_history: List[Any]) -> List[Tuple[str, str]]:
        """
        Pair HumanMessage followed by AIMessage (in-order).
        """
        pairs: List[Tuple[str, str]] = []
        pending_user: Optional[str] = None

        for m in state_history:
            if isinstance(m, HumanMessage):
                pending_user = str(m.content)
            elif isinstance(m, AIMessage) and pending_user is not None:
                pairs.append((pending_user, str(m.content)))
                pending_user = None

        return pairs

    # ---- different scoring components ----
    def compute_components(
        self,
        *,
        tc_text: str,
        state_history: List[Any],
    ) -> Dict[str, float]:
        """
        Returns:
          dict with keys among {"A","TC","BC"}, each are values between 0 and 1.

        A  = alignment similarity between transition signal text and ALL user utterances in this state
        TC = turn-cost starts from 0 and ramps up to 1 at max_turns
        BC = A block comparison score that measures average dissimilarity between user and assistant responses (per turn)
        """
        comps: Dict[str, float] = {}

        user_utts = self._get_user_utts(state_history)
        n_turns = len(user_utts)

        # Alignment A (similarity directly)
        if self.weights.WA > 0:
            user_blob = "\n".join(u.strip() for u in user_utts if str(u).strip()).strip()
            if not user_blob:
                D = 0.0
            else:
                cos_sim = self._cos_sim(tc_text, user_blob)
                D = cos_sim_normalized(cos_sim) 
            comps["A"] = clamp01(D)

        # Turn cost TC
        if self.weights.WTC > 0:
            if self.max_turns <= 1:
                TC = 1.0
            else:
                TC = (max(1, n_turns) - 1) / (self.max_turns - 1)
            comps["TC"] = clamp01(TC)

        # Block comparison BC (dissimilarity between user vs assistant responses)
        if self.weights.WBC > 0:
            pairs = self._get_pairs(state_history)
            if self.last_k_pairs is not None and self.last_k_pairs > 0:
                pairs = pairs[-self.last_k_pairs:]

            if not pairs:
                BC = 0.0
            else:
                dissims = []
                for u, a in pairs:
                    cos_sim = self._cos_sim(u, a)
                    dissims.append(dissim_from_cos(cos_sim))  # [0,1]
                BC = float(np.mean(dissims))
            comps["BC"] = clamp01(BC)

        return comps

    def compute_transition_score(self, components: Dict[str, float]) -> float:
        """
        weighted sum of the scores
        """
        score = 0.0

        if "A" in components and self.weights.WA > 0.0:
            score += self.weights.WA * components["A"]
        if "TC" in components and self.weights.WTC > 0.0:
            score += self.weights.WTC * components["TC"]
        if "BC" in components and self.weights.WBC > 0.0:
            score += self.weights.WBC * components["BC"]

        return score

    # ---- decision logic ----
    def should_force_transition(self, state_history: List[Any]) -> bool:
        """
        Hard guarantee: after max_turns user turns, transition must happen.
        """
        return self._count_user_turns(state_history) >= self.max_turns

    def should_transition(
        self,
        *,
        t_score: float,
        state_history: List[Any],
        threshold: float,
    ) -> bool:
        """
        Transition decision with hard max-turn override.
        """
        if self.should_force_transition(state_history):
            print("Forced transition due to max allowed turns")
            return True
        return t_score >= threshold

    def reset_cache(self) -> None:
        self._emb_cache.clear()