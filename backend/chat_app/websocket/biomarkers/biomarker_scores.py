"""
Entry point for the rest of the project to generate biomarker scores.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.biomarker_scores`

Both functions return a list of ScoreSpan dicts:
    {"score_type": str, "score": float, "start_ts": datetime, "end_ts": datetime}

Each span is one row in the database (linked to a ChatMessage by the caller).
A single utterance can produce many spans -- e.g., one altered-grammar span per
sentence, one perplexity span per tri-gram.

"""
import random

from .text_preprocessing import preprocess
from .altered_grammar    import generate_altered_grammar


# ================================================================================
# Text-based (per user utterance)
# ================================================================================
def generate_utterance_biomarkers(recent_text, words, context_buffer):
    """
    Tokenize once, dispatch to each text biomarker, concatenate the resulting
    spans. `context_buffer` is forwarded for future history-aware variants.
    """
    if not recent_text or not words: return []

    cleaned, tokens, pos_tags = preprocess(recent_text)

    spans = []
    spans.extend(generate_altered_grammar(cleaned, tokens, pos_tags, words))
    # Future: spans.extend(generate_perplexity(cleaned, tokens, pos_tags, words))
    return spans


# ================================================================================
# Audio-based (per user utterance)
# ================================================================================
# Stub: returns random values for the three audio biomarkers, with timestamps
# scoped to the utterance audio (first word start -> last word end).
def generate_audio_biomarkers(overlapped_speech_count, words):
    if not words: return []

    start_ts = words[ 0]["start"]
    end_ts   = words[-1]["end"  ]

    return [{"score_type": name, "score": random.random(), "start_ts": start_ts, "end_ts": end_ts}
            for name in ("prosody", "pronunciation", "turntaking")]

