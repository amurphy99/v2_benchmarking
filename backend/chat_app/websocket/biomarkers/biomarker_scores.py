"""
Entry point for generating biomarker scores.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.biomarker_scores`

Both functions return a list of ScoreSpan dicts:
    {"score_type": str, "score": float, "start_ts": datetime, "end_ts": datetime}

Each span is one row in the database (linked to a ChatMessage by the caller).
A single utterance can produce many spans -- one altered-grammar span per
sentence, one perplexity span per tri-gram, one prosody/pronunciation span per
audio window, and one turn-taking span per utterance.

TODO: There is kind of some overlap between this and `biomarker_extraction.py`, 
      maybe it's just more of a documentation thing I should fix up, or I should
      split it into one file that does text and one that does audio...

TODO: Like you can see the pre-processing for audio is already done by this point,
      but not yet for text. So maybe the only change I need to make is to just
      move the text-preprocessing into the other file...

TODO: Not 100% sure how to handle anomia. At this point, with Google's STT, we 
      might be able to add the old version back since it gives filler words like
      "umm", but I don't know if I like/fully trust that biomarker personally...

"""
# From this project
from .preprocessing.text_preprocessing     import preprocess
from .core.altered_grammar.altered_grammar import generate_altered_grammar
from .core.prosody        .prosody         import generate_prosody
from .core.pronunciation  .pronunciation   import generate_pronunciation
from .core.turntaking     .turntaking      import generate_turntaking

# Config for IF scores should be generated
from .biomarker_config import AG_MIN_UTT_WORDS


# ================================================================================
# Text-based (per user utterance)
# ================================================================================
def generate_utterance_biomarkers(recent_text, words, context_buffer):
    """
    Tokenize once, dispatch to each text biomarker, concatenate the resulting spans.

    TODO: `context_buffer` is unused but kept here for when I add the Pragmatic 
          Impairment biomarker in the future.
    """
    if not recent_text or not words: return []

    # Shared preprocessing step (e.g., only get POS tags once)
    cleaned, tokens, pos_tags = preprocess(recent_text)

    # Generate text biomarker scores (Altered Grammar needs a minumum number of words)
    spans = []
    if len(cleaned) >= AG_MIN_UTT_WORDS: spans.extend(generate_altered_grammar(cleaned, tokens, pos_tags, words))

    
    # TODO: spans.extend(generate_perplexity(cleaned, tokens, pos_tags, words))
    # TODO: spans.extend(generate_pragmatic_impairment(cleaned, tokens, pos_tags, words))

    return spans


# ================================================================================
# Audio-based (per user utterance)
# ================================================================================
def generate_audio_biomarkers(windows, overlapped_speech_count, words):
    """
    `windows` is the list of OpenSMILE feature windows produced by
    `audio_preprocessing.window_features_within_utterance`. May be empty if the
    utterance was shorter than one window -- in that case prosody/pronunciation
    are skipped but turntaking still fires (it's per-utterance).

    TODO: Need to decide how to handle turntaking...
    """
    if not words: return []

    # Generate audio biomarker scores
    spans = []
    spans.extend(generate_prosody      (windows))
    # TODO: spans.extend(generate_pronunciation(windows))
    # TODO: spans.extend(generate_turntaking   (overlapped_speech_count, words))

    return spans
