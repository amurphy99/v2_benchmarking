"""
Feature extraction for the Altered Grammar biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.features`

Between the offline and deployed versions, these files are exactly the same:
  * feature_config.py
  * feature_helpers.py
  * transcript_level.py
  * lexical_richness.py
  * syllable_features.py
  * .<PATH>.text_preprocessing.py (different locations)

TODO: Future idea was to use the POS counts to guard for something being a full
      sentence or not (i.e., "does it have a noun, verb, and direct object?" or
      something stupid like that...).

>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> NOTE <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
We are NOT yet splitting on sentences inside of here. We do have this loop where
we loop through sentences, but that is from old code where we would generate 
one row of features from an entire transcript.

Here we assume that whatever we are given is the entire text we have to use, and
we treat it as one whole utterance/sentence for analysis. 

TODO: In the FUTURE, it may make sense to change this behavior, especially for
transcript highlighting so that we can point to specific sentences. 
>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

"""
import numpy as np
from typing import List, Tuple

# From this project
from .feature_extraction.feature_helpers   import pos_category_counts, get_pos_ratios_dict
from .feature_extraction.transcript_level  import count_immediate_reps_window, pos_patterns, get_density_features
from .feature_extraction.lexical_richness  import get_lexical_richness_feats
from .feature_extraction.syllable_features import get_syllable_counts, misc_syllable_features
from .feature_extraction.feature_config    import GRAMMAR_FEATURES

# Tokens that mark the end of a sentence (NLTK word_tokenize emits these standalone)
_SENTENCE_ENDERS = {".", "?", "!"}

# Per-sentence guard: skip sentences with fewer than this many tokens (e.g. lone "Yeah")
_MIN_SENT_TOKENS = 4

# --------------------------------------------------------------------------------
# Sentence-splitting on pre-computed pos_tags
# --------------------------------------------------------------------------------
def _split_into_sentences(pos_tags) -> List[List[Tuple[str, str]]]:
    """
    Drop standalone commas, then split into sub-lists at each sentence-ending
    punctuation token. Sentence-ending punctuation itself is dropped.
    """
    sentences = []
    current   = []
    for w, t in pos_tags:
        if w == ",": continue
        if w in _SENTENCE_ENDERS:
            if current: sentences.append(current)
            current = []
        else: current.append((w, t))
    if current: sentences.append(current)
    return sentences

# Split the POS tags list of tuples into a list of tokens
def _sentence_tokens_tags(sentence_pos: List[Tuple[str, str]]) -> tuple[list[str], list[str]]:
    # Filter for alphanumeric characters (keeps "word123" and "100" but drops "." and ",")
    filtered = [(w, t) for w, t in sentence_pos if any(ch.isalnum() for ch in w)]
    if not filtered: return [], []

    # Unzip the POS tag tuples into two separate lists
    word_tokens, pos_tags = zip(*filtered)
    return list(word_tokens), list(pos_tags)

# --------------------------------------------------------------------------------
# What qualifies given text as a "full" sentence? Or at least an attempt at one
# --------------------------------------------------------------------------------
# TODO: Change to use POS tags as inputs + add some rules like needs a subject and 
#       action or something
def _full_utterance(text: str, min_words: int = 2) -> bool:
    # For now just use minimum number of words
    if len(text.split(" ")) >= min_words: return True
    else:                                 return False


# ================================================================================
# Content-Based Altered Grammar Features 
# ================================================================================
def extract_altered_grammar_features(cleaned, tokens, pos_tags, words) -> tuple[dict[str, float], list[float]]:
    """
    Public entry point.
    Returns fixed-order 35-feature vector for the LightGBM ensemble. Returns [] when
    the utterance has no sentence passing the >=2-token guard (caller writes
    no DB row in that case).

    NOTE: Everything gets divided by `num_words` to normalize things based on
          sentence length (i.e. count features become ratios). It might be 
          faster to do it all as a numpy array, but this is easier to make
          sure we don't have any mistakes in the code.

    `cleaned` and `tokens` are unused at present (kept for parallelism with
    other text biomarkers). `words` (database objects for each word with their
    corresponding start & end timestamps) is also unused here for now. Adding
    timestamps to biomarkers is handled by the caller in `altered_grammar.py`.
    """
    if not pos_tags: return {}, []
    
    # Guard for minimum sentence lengths 
    # TODO: Add the advanced stuff using POS rather than just length for qualifying a sentence as valid
    #sentences_pos = [s for s in _split_into_sentences(pos_tags) if len(s) >= _MIN_SENT_TOKENS]
    sentences_pos = [pos_tags] # TODO: SEE TOP OF FILE FOR NOTE ABOUT THIS
    if not sentences_pos: return {}, []

    # Add features to the output dictionary as we get them
    gram_feats = {}

    # --------------------------------------------------------------------------------
    # Per-sentence accumulation
    # --------------------------------------------------------------------------------
    # POS-count-based features (16)
    overall_pos_counts = np.zeros(16, dtype=int)

    # Token stream
    pos_sequences  : List[List[str]] = []
    all_word_tokens: List[str]       = []
    all_syllables  : List[int]       = []
    text_char_length                 = 0

    # Sentence-level operations
    for sent_pos in sentences_pos:
        # Final sentence-level preprocessing
        word_tokens, tags_only = _sentence_tokens_tags(sent_pos)
        if len(word_tokens) < _MIN_SENT_TOKENS: continue

        # POS category counts
        sent_pos_counts = pos_category_counts(sent_pos)
        syllables       = get_syllable_counts(word_tokens)

        # Update global, transcript-wide trackers
        overall_pos_counts += sent_pos_counts
        text_char_length   += sum(len(w) for w in word_tokens)
        pos_sequences  .append(tags_only  )
        all_word_tokens.extend(word_tokens)
        all_syllables  .extend(syllables  )

    # --------------------------------------------------------------------------------
    # Global Feature Extraction
    # --------------------------------------------------------------------------------
    # NOTE: We use the total number of words to normalize features (counts => ratios)
    num_words = len(all_word_tokens)  
    if num_words == 0: return {}, [] # no usable content

    # (+16) POS-count-based ratio features & SYN/P ratio features
    gram_feats.update(get_pos_ratios_dict(overall_pos_counts=overall_pos_counts, total_words=num_words))
    
    # (+1) Average word length
    gram_feats["avg_word_length"] = text_char_length / num_words

    # (+1) Unique words (save the original value here for use in other features)
    num_unique_words = len(set(all_word_tokens))
    gram_feats["unique_words"] = num_unique_words / num_words

    # (+4) Lexical richness features
    gram_feats.update(get_lexical_richness_feats(
        num_unique_words=num_unique_words, num_words=num_words, all_word_tokens=all_word_tokens
    ))

    # (+4) Syllable & readability features
    gram_feats.update(misc_syllable_features(len(sentences_pos), all_word_tokens, all_syllables))

    # (+3) Word repetitions (probably the slowest feature yet?)
    # TODO: If these are effective, make a more efficient method for calculating them
    gram_feats.update({
        "immediate_reps": count_immediate_reps_window(all_word_tokens, max_distance=1), 
        "nearby_reps_k3": count_immediate_reps_window(all_word_tokens, max_distance=3), 
        "nearby_reps_k5": count_immediate_reps_window(all_word_tokens, max_distance=5),
    })
    
    # (+2) POS pattern variety + density
    gram_feats.update(pos_patterns(pos_sequences))
    
    # (+4) More specific ratio features that don't just use the number of words
    gram_feats.update(get_density_features(pos_counts=overall_pos_counts, total_words=num_words))

    # --------------------------------------------------------------------------------
    # Return the full set of features
    # --------------------------------------------------------------------------------
    # Derive final feature array from the list of (TODO: Not returning an array)
    feature_array = [float(gram_feats[feature_name]) for feature_name in GRAMMAR_FEATURES]

    # Remove certain keys from the data
    #del gram_feats["avg_sentence_length"]

    # Final feature dictionary
    return gram_feats, feature_array
