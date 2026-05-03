"""
Feature extraction for the Altered Grammar biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.features`

TODO: I mean this was supposed to be changed so it wasn't in this weird
      convoluted style where we have to sweat about preserving the order of the
      column names and stuff...

TODO: Whatever changes I end up doing to clean this up, as long as I reflect
      those changes in the offline version, (so features are in the same order)
      it is fine.

TODO: Probably try the dictionary name thing I have in here commented out where
      I try to add them to a dictionary one by one, then I can iterate through a
      final constant list of keys to get the final feature array rather than
      just doing it in the general order. So we would have the constant like:
      `GRAMMAR_FEATURES = ["noun_ratio", "verb_count", ...]` and then once we
      have the final dictionary, with all of the features we go like:
      `features_35 = [float(feature_dict[x]) for x in GRAMMAR_FEATURES]`

TODO: Also make sure to check out the flipped division thing for the type-token
      ratio and MATTR. 

>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> TODO <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
So biggest "todo" is probably to copy this over to the offline code, fix things
like the flipped ratios and add the dictionary-keys-as-I-go idea before finally
using the constant feature names list to put everything in the desired order.

Once that is all in both versions we can train the models and be good to go. I
will test it here though really quick first. 
>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<


Reuses the `pos_tags` produced by the shared `preprocessing.text_preprocessing.preprocess`
step. Sentences are recovered by splitting `pos_tags` on the standalone
`. ? !` tokens that NLTK's word_tokenize emits.

"""
import numpy as np
from typing import List, Tuple

# From this project
from .feature_extraction.feature_helpers   import pos_category_counts
from .feature_extraction.lexical_richness  import get_brunets_index, get_honore_statistic, get_mattr
from .feature_extraction.syllable_features import get_syllable_counts, misc_syllable_features
from .feature_extraction.transcript_level  import count_immediate_reps_window, pos_patterns, get_density_features

# Tokens that mark the end of a sentence (NLTK word_tokenize emits these standalone)
_SENTENCE_ENDERS = {".", "?", "!"}

# Per-sentence guard: skip sentences with fewer than this many tokens (e.g. lone "Yeah")
_MIN_SENT_TOKENS = 2


# ================================================================================
# Sentence-splitting on pre-computed pos_tags
# ================================================================================
def _split_into_sentences(pos_tags) -> List[List[Tuple[str, str]]]:
    """
    Drop standalone commas, then split into sub-lists at each sentence-ending
    punctuation token. Sentence-ending punctuation itself is dropped (matches
    how the offline code's per-sentence `pos_tags` arrived already trimmed of
    trailing punctuation).
    """
    sentences = []
    current   = []
    for w, t in pos_tags:
        if w == ",":              continue
        if w in _SENTENCE_ENDERS:
            if current: sentences.append(current)
            current = []
        else:                     current.append((w, t))
    if current: sentences.append(current)
    return sentences


def _sentence_word_tokens(sentence_pos: List[Tuple[str, str]]) -> List[str]:
    """
    Lowercased + alphabetic-ish word tokens for one sentence, with the same
    contraction rewrites the offline code applied (`n't` -> `not`, etc.).
    """
    out = []
    for w, _ in sentence_pos:
        if not any(ch.isalpha() for ch in w): continue
        wl = (w.lower()
                .replace("n't", "not")
                .replace("'re", "are")
                .replace("'ve", "have"))
        out.append(wl)
    return out


# ================================================================================
# Public entry point
# ================================================================================
def extract_altered_grammar_features(cleaned, tokens, pos_tags, words) -> List[float]:
    """
    Fixed-order 35-feature vector for the LightGBM ensemble. Returns [] when
    the utterance has no sentence passing the >=2-token guard (caller writes
    no DB row in that case).

    `cleaned` and `tokens` are unused at present (kept for parallelism with
    other text biomarkers). `words` is also unused here -- timestamps come
    from the caller in `altered_grammar.py`.

    TODO: Future idea was to use the POS counts to guard for something being a full
          sentence or not (i.e., "does it have a noun, verb, and direct object?" or
          something stupid like that...).
    """
    if not pos_tags: return []
    
    sentences_pos = [s for s in _split_into_sentences(pos_tags) if len(s) >= _MIN_SENT_TOKENS]
    if not sentences_pos: return []

    # TODO: I could add them to the dictionary as I get them? Wouold need ot make sure the order is right...
    feature_dict = {}

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
        # Guard for sentence length
        word_tokens = _sentence_word_tokens(sent_pos)
        if not word_tokens: continue

        # Start with POS counts 
        # TODO: We start with this becuase the guard may use this in the future...
        sent_pos_counts = pos_category_counts(sent_pos)
        tags_only       = [t for (_, t) in sent_pos]
        syllables       = get_syllable_counts(word_tokens)

        # Update global, transcript-wide trackers
        overall_pos_counts += sent_pos_counts
        text_char_length   += sum(len(w) for w in word_tokens)
        pos_sequences  .append(tags_only  )
        all_word_tokens.extend(word_tokens)
        all_syllables  .extend(syllables  )

    # --------------------------------------------------------------------------------
    # Transcript-wide features
    # --------------------------------------------------------------------------------
    # TODO: This dictionary idea could work, but the features need to already be in
    #       ratios if I want to do that...
    #transcript_feature_dict = {"text_char_length": text_char_length}

    # Global lexical stats
    num_words        = len(all_word_tokens)
    num_unique_words = len(set(all_word_tokens))
    if num_words == 0: return []  # no usable content -- caller skips
    #transcript_feature_dict.update(
    #    {"num_words": num_words, "num_unique_words": num_unique_words})

    # Word repetitions (probably the slowest feature yet?)
    # TODO: If these are effective, make a more efficient method for calculating them
    immediate_reps = count_immediate_reps_window(all_word_tokens, max_distance=1)
    nearby_reps_k3 = count_immediate_reps_window(all_word_tokens, max_distance=3)
    nearby_reps_k5 = count_immediate_reps_window(all_word_tokens, max_distance=5)
    #transcript_feature_dict.update(
    #    {"immediate_reps": immediate_reps, "nearby_reps_k3": nearby_reps_k3, "nearby_reps_k5": nearby_reps_k5})

    # POS pattern variety + density
    pos_pattern_variety, pos_pattern_density = pos_patterns(pos_sequences)
    
    # Global lexical features (7)
    transcript_features = np.array([
        text_char_length, num_unique_words,
        immediate_reps, nearby_reps_k3, nearby_reps_k5,
        pos_pattern_variety, pos_pattern_density,
    ])

    # --------------------------------------------------------------------------------
    # Ratios / Diversity
    # --------------------------------------------------------------------------------
    # Update the feature array for the next step & convert features to ratios based on the word count
    feature_array = np.concatenate([overall_pos_counts, transcript_features])  # 16 + 7 = 23
    ratio_array   = feature_array / num_words                                  # 23 ratios

    # More specific ratio features that don't just use the number of words
    density_features = get_density_features(overall_pos_counts, total_words=num_words)  # 4 features
    brunets_index    = get_brunets_index(num_words, num_unique_words)                   # 1 feature

    # Concatenate all final features (23 + 4 + 1 = 28)
    base_28 = np.concatenate([ratio_array, density_features, [brunets_index]])
    feature_dict = dict(zip(_FEATURE_NAMES_28, base_28))

    # --------------------------------------------------------------------------------
    # Syllable / readability (4) + lexical richness extras (3) -- appended in order
    # --------------------------------------------------------------------------------
    # Syllable-based features (4)
    syllable_based = misc_syllable_features(len(sentences_pos), all_word_tokens, all_syllables)

    # Other (3)
    other_features = {
        "type_token_ratio"  : num_words / num_unique_words, # offline-code formulation (inverted vs. textbook TTR)
        "mattr"             : get_mattr(all_word_tokens),
        "honores_statistic" : get_honore_statistic(all_word_tokens),
    }

    # Add new features
    feature_dict.update(syllable_based) # (4)
    feature_dict.update(other_features) # (3)

    # Remake "features"
    features_35 = [float(v) for v in feature_dict.values()]

    # Final 35-element vector, in dict-insertion order
    return features_35



# --------------------------------------------------------------------------------
# Names for the FIRST 28 features 
# --------------------------------------------------------------------------------
# NOTE: It isn't in the names right now, but these are all ratio based.
# Used to build feature_dict in the right order before the syllable + lexical-richness extras get appended).
_FEATURE_NAMES_28 = [
    # (9) POS-count-based features
    "noun_count", "verb_count", "adj_count", "adv_count",
    "coord_markers", "subord_markers", "reduced_verbs", "function_words",
    "num_predicates_approx",

    # (7) SYN/P ratio features
    "pronoun_count", "personal_pronoun_count", "determiner_count", "preposition_count",
    "verb_present_participle_count", "verb_modal_count", "verb_third_person_sing_count",
    
    # (7) Transcript-wide features 
    "average_word_length", "num_unique_words", 
    "immediate_reps", "nearby_reps_k3", "nearby_reps_k5",
    "pos_pattern_variety", "pos_pattern_density",

    # (4) Density features
    "propositional_density", "content_density",
    "noun_verb_ratio", "adj_noun_ratio",

    # (1) Misc.
    "brunets_index",
]

