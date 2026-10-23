"""
POS category count helper.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.feature_extraction.feature_helpers`

Includes tag-set and word-list constants that get used to generate the different
forms of POS category counts. 

Results of this main function are used further down the line to generate other
features, like in `get_density_features()`.
"""
import numpy as np

# This includes all of the Penn Treebank POS tag sets, word lists, & feature names)
from .feature_config import *


# ================================================================================
# POS Category Counts
# ================================================================================
def pos_category_counts(pos_tags):
    """
    Input is the result of the nltk.pos_tag() method. 
      -> [(word, POS_tag), ...]
    
    Returns a 16-element list (order matters; `get_density_features` indexes it).
    """
    # POS category counts
    noun_count = sum(1 for (_, t) in pos_tags if t in NOUN_TAGS)
    verb_count = sum(1 for (_, t) in pos_tags if t in VERB_TAGS)
    adj_count  = sum(1 for (_, t) in pos_tags if t in  ADJ_TAGS)
    adv_count  = sum(1 for (_, t) in pos_tags if t in  ADV_TAGS)

    # Coordination: CC
    coord_markers  = sum(1 for (_, t) in pos_tags if t == "CC")

    # Subordination: lexical markers
    subord_markers = sum(1 for (w, _) in pos_tags if w.lower() in SUBORDINATING_WORDS)

    # Reduced forms: VBG + VBN
    reduced_verbs  = sum(1 for (_, t) in pos_tags if t in {"VBG", "VBN"})

    # Function words by POS
    function_words = sum(1 for (_, t) in pos_tags if t in FUNCTION_WORD_TAGS)

    # Approximate predicates: each verb that has a noun within +/- 3 tokens
    num_predicates_approx = 0
    for i, (_, t) in enumerate(pos_tags):
        if t in VERB_TAGS:
            start  = max(0,             i - 3)
            end    = min(len(pos_tags), i + 4)
            window = pos_tags[start:end]

            if any(tt in NOUN_TAGS for (_, tt) in window): 
                num_predicates_approx += 1

    # --------------------------------------------------------------------------------
    # Extra counts (for SYN/P ratio features)
    # --------------------------------------------------------------------------------
    pronoun_count          = sum(1 for (_, t) in pos_tags if (t in    PRONOUN_TAGS))
    personal_pronoun_count = sum(1 for (w, t) in pos_tags if (t in    PRONOUN_TAGS) and (w.lower() in PERSONAL_PRONOUNS))
    determiner_count       = sum(1 for (_, t) in pos_tags if (t in DETERMINER_TAGS))
    preposition_count      = sum(1 for (_, t) in pos_tags if (t in       PREP_TAGS))

    verb_present_participle_count = sum(1 for (_, t) in pos_tags if (t in   VBG_TAGS))
    verb_modal_count              = sum(1 for (_, t) in pos_tags if (t in MODAL_TAGS))
    verb_third_person_sing_count  = sum(1 for (_, t) in pos_tags if (t in   VBZ_TAGS))

    # Return in the proper order (must be same order as expected)
    return [
        # Indices 0-8 (9): primary POS counts
        noun_count, verb_count, adj_count, adv_count,
        coord_markers, subord_markers, reduced_verbs, function_words,
        num_predicates_approx,

        # Indices 9-15 (7): SYN/P ratio counts
        pronoun_count, personal_pronoun_count, determiner_count, preposition_count,
        verb_present_participle_count, verb_modal_count, verb_third_person_sing_count,
    ]


# ================================================================================
# Top-level entry point 
# ================================================================================
def get_pos_ratios_dict(overall_pos_counts: np.ndarray, total_words: int) -> dict[str, float]:
    """
    Takes ordered numpy array of COUNTS for subsequent and returns dictionary of
    RATIOS for the final feature set. 
    """
    # Get ratio array from the given counts
    pos_ratios_array = overall_pos_counts / total_words

    # Turn into a dictionary with the correct feature labels
    pos_ratios_dict = dict(zip(POS_CATEGORY_RATIO_NAMES, pos_ratios_array))

    return pos_ratios_dict
