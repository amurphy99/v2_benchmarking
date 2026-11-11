import re
import numpy as np
import difflib
from typing import Any, List, Optional, Dict
from dataclasses import dataclass, field

import logging
from chat_app.services import logging_utils as lu 

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage

logger = logging.getLogger(__name__)

@dataclass
class ChatState:
    """Group message objects by scenario for conversation and closing summaries.

    Attributes:
        current_scenario (str): State used when a method omits its scenario.
        history_by_state (Dict[str, List[Any]]): State-name to message-list mapping.
        state_trace (List[str]): Departed states in visit order; revisits may repeat.
    """

    current_scenario: str

    # state_name -> list of messages (HumanMessage/AIMessage/etc.)
    history_by_state: Dict[str, List[Any]] = field(default_factory=dict)

    # keep an ordered record of visited states
    state_trace: List[str] = field(default_factory=list)

    def _ensure_state(self, scenario: Optional[str] = None) -> str:
        """Return the effective state name and create its history list if absent.

        scenario (Optional[str]) selects a state; None or an empty string uses
        current_scenario. Mutates history_by_state and returns the str key.
        """
        scenario = scenario or self.current_scenario
        if scenario not in self.history_by_state:
            self.history_by_state[scenario] = []
        return scenario

    def get_state_history(self, scenario: Optional[str] = None) -> List[BaseMessage]:
        """Return the backing List[BaseMessage] for a state, creating it if absent.

        scenario (Optional[str]) defaults to current_scenario. The returned list
        is not a copy, so changes to it affect this ChatState.
        """
        scenario = self._ensure_state(scenario)
        return self.history_by_state[scenario]

    def add_message(self, msg: Any, scenario: Optional[str] = None) -> None:
        """Append msg (Any message object) to the state's history; return None.

        scenario (Optional[str]) defaults to current_scenario. The original
        object is stored without copying, normally as a HumanMessage or AIMessage.
        """
        scenario = self._ensure_state(scenario)
        self.history_by_state[scenario].append(msg)

    def transition_to(self, new_scenario: str) -> None:
        """Record departure and select new_scenario (str), creating its history.

        Updates state_trace and current_scenario in this ChatState; returns None.
        """
        if not self.state_trace or self.state_trace[-1] != self.current_scenario:
            self.state_trace.append(self.current_scenario)

        self.current_scenario = new_scenario
        self._ensure_state(new_scenario)


def get_user_utterances_for_state(state: ChatState, scenario: str) -> list[str]:
    """Return list[str] content from HumanMessage entries in one state.

    state (ChatState) supplies grouped history; scenario (str) selects the group.
    Looking up an unseen scenario creates an empty history list.
    """
    msgs = state.get_state_history(scenario)
    user_utts = [str(m.content) for m in msgs if isinstance(m, HumanMessage)]
    return user_utts

def extract_ts_best_match(text: str, target_header: str, threshold: float = 0.7) -> str:
    """Extract a section using a fuzzy header match when regex extraction fails.

    Args:
        text (str): Source text containing section headings and content.
        target_header (str): Heading to match using difflib similarity.
        threshold (float): Minimum matching ratio; defaults to 0.7.

    Returns:
        str: Content after the matched header's colon and subsequent lines up to
        the next blank line, or an empty string if no header reaches the threshold.
    """
    lines = text.splitlines()
    best_score = 0.0
    start_index = -1

    # Find the line that best matches the target header
    for i, line in enumerate(lines):
        # We only care about the header part, so we strip bullets/colons for comparison
        clean_line = line.strip(" :-").lower()
        target_clean = target_header.strip(" :-").lower()
        
        # Calculate similarity
        ratio = difflib.SequenceMatcher(None, clean_line, target_clean).ratio()
        
        if ratio > best_score:
            best_score = ratio
            start_index = i

    # If no line is close enough, return empty
    if best_score < threshold:
        return ""

    # Extract content: Start from the line AFTER the header
    extracted_lines = []
    # Check if the header line itself had content (e.g., "Header: content")
    header_line = lines[start_index]
    
    # Try to grab content after the colon on the same line
    if ":" in header_line:
        post_colon_content = header_line.split(":", 1)[1].strip()
        if post_colon_content:
            extracted_lines.append(post_colon_content)

    # Continue grabbing subsequent lines until we hit an empty line (section break)
    for i in range(start_index + 1, len(lines)):
        current_line = lines[i].strip()
        if not current_line: 
            break # Stop at empty line
        extracted_lines.append(current_line)

    return "\n".join(extracted_lines)


def cosine_similarity(v1, v2):
    """Return float cosine similarity for two one-dimensional numeric sequences.

    v1 and v2 may be lists or NumPy arrays. They must have matching lengths and
    nonzero norms; this helper does not validate those requirements.
    """
    v1 = np.array(v1)
    v2 = np.array(v2)
    return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))


def organize_message_history(msg_history: list) -> str:
    """Format msg_history (list[BaseMessage]) as a tagged transcript string.

    HumanMessage and AIMessage receive user/assistant tags. Other objects with
    a content attribute use the user-tag fallback. Empty history returns "".
    """
    parts: list[str] = []

    for m in msg_history:
        if isinstance(m, HumanMessage):
            parts.append(f"\n<|user|>\n{m.content}<|end|>")
        elif isinstance(m, AIMessage):
            parts.append(f"\n<|assistant|>\n{m.content}<|end|>")
        else:
            # fallback
            parts.append(f"\n<|user|>\n{m.content}<|end|>")
            
    return "".join(parts)

def organize_full_conversation(state: ChatState, exclude_states: Optional[List[str]] = None) -> str:
    """Return a tagged transcript, including each eligible state once.

    Args:
        state (ChatState): Grouped histories, visit trace, and current state.
        exclude_states (Optional[List[str]]): State names to omit; None omits none.

    Returns:
        str: Histories in first-visit order, followed by the current state if it
        was not already included. Missing history groups are created as empty.
    """
    if exclude_states is None:
        exclude_states = []
        
    ordered_states = []
    for s in state.state_trace:
        if s not in ordered_states and s not in exclude_states:
            ordered_states.append(s)
    if state.current_scenario not in ordered_states and state.current_scenario not in exclude_states:
        ordered_states.append(state.current_scenario)

    parts: list[str] = []
    for s in ordered_states:
        parts.append(organize_message_history(state.get_state_history(s)))

    return "".join(parts)


def clean_llm_response(text: str) -> str:
    """Return str reply text with the known model-metadata block removed.

    text (str) is raw model output. Only the configured metadata pattern is
    removed; surrounding whitespace is stripped from the resulting spoken reply.
    """
    # Adding this specifically for the hallucination issue we observed with the Gemma-4-31B-it model. But could help with other models too if they start including metadata lines like this in their responses.
    metadata_pattern = re.compile(
            r"\s*Context length:\s*[^;]+;\s*Quantization:\s*[^;]+;\s*Supported Modalities:\s*[^;]+;\s*Thinking:\s*[^;]+;\s*Thinking Levels:\s*\S+",
            re.IGNORECASE
        )
    return re.sub(metadata_pattern, "", text).strip()

def parse_yes_no(text: str) -> Optional[bool]:
    """Classify text (str) using simple affirmative/negative keyword matches.

    Returns True for an affirmative match, False for a negative match, or None
    for neither. Affirmative matches take precedence if both are present.
    """
    t = (text or "").strip().lower()

    if re.search(r"\b(yes|yep|yeah|sure|okay)\b", t):
        return True
    if re.search(r"\b(no|nope|nah)\b", t):
        return False
    return None
