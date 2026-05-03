"""
Transcript-wide features consider the entire given text (not split by sentence).
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.feature_extraction.transcript_level`

"""

# --------------------------------------------------------------------------------
# Count immediate word repetitions (but allow them to be more than 1 word away)
# --------------------------------------------------------------------------------
def count_immediate_reps_window(tokens, max_distance=3):
    """
    Count anchors that have at least one repeat within `max_distance` positions.
    Each anchor contributes at most one repetition.

    Example (max_distance=3):
      "I I I"           -> 2
      "I uh I"          -> 1
      "the the the cat" -> 3  (positions: 0-1, 1-2, 2-3)
    """
    repetitions = 0
    n = len(tokens)
    for i in range(n - 1):
        anchor = tokens[i]
        for d in range(1, max_distance + 1):
            j = i + d        # Index to check
            if j >= n: break # Guard to not go over the length of the given tokens

            # Check for a match; break if there is one (only count one repetition per anchor)
            if tokens[j] == anchor: 
                repetitions += 1
                break

    return repetitions


# --------------------------------------------------------------------------------
# POS Pattern Variety & Density
# --------------------------------------------------------------------------------
def pos_patterns(pos_sequences):
    """
    `pos_sequences` is a list of per-sentence tag-only sequences. Returns
    (variety, density) where density = unique-bigram-or-trigram-count / total.
    """
    # POS pattern variety + density
    pos_patterns   = set()
    total_bigrams  = 0
    total_trigrams = 0

    # Loop through POS tag sets from each separate user sentence
    for pos_tags in pos_sequences:
        # Bigrams
        for i in range(len(pos_tags) - 1):
            pos_patterns.add(("2", pos_tags[i], pos_tags[i + 1]))
            total_bigrams += 1
        
        # Trigrams
        for i in range(len(pos_tags) - 2):
            pos_patterns.add(("3", pos_tags[i], pos_tags[i + 1], pos_tags[i + 2]))
            total_trigrams += 1

    # Variety
    pos_pattern_variety = len(pos_patterns)
    denom_patterns      = total_bigrams + total_trigrams

    # Density
    pos_pattern_density = (pos_pattern_variety / denom_patterns if denom_patterns > 0 else 0.0)

    return pos_pattern_variety, pos_pattern_density


# ================================================================================
# POS Ratio Features
# ================================================================================
def get_density_features(pos_counts, total_words):
    """
    Builds 4 ratio features by indexing into `pos_counts` (output of
    pos_category_counts). The indices below MUST stay in sync with that function.

    Since we are storing everything in numpy arrays for efficiency, this requires
    special knowledge of the indices to do. Need to be careful with any changes.
    """
    # --------------------------------------------------------------------------------
    # Get counts from the array by indices
    # --------------------------------------------------------------------------------
    noun_count = pos_counts[0]
    verb_count = pos_counts[1]
    adj_count  = pos_counts[2]
    adv_count  = pos_counts[3]

    # Extra counts appended
    determiner_count  = pos_counts[11]
    preposition_count = pos_counts[12]

    # For conjunctions, re-use what you already have
    coord_markers  = pos_counts[4]
    subord_markers = pos_counts[5]
    conj_count     = coord_markers + subord_markers

    # --------------------------------------------------------------------------------
    # Density features using total words as the denominator
    # --------------------------------------------------------------------------------
    denom = total_words if total_words > 0 else 1

    # Propositional density: verbs + adjectives + adverbs + prepositions + conjunctions
    propositional_density = (verb_count + adj_count + adv_count + preposition_count + conj_count) / denom

    # Content density: nouns + verbs + adjectives + adverbs
    content_density = (noun_count + verb_count + adj_count + adv_count) / denom

    # Other ratios
    noun_verb_ratio = (noun_count / verb_count) if (verb_count > 0) else 0.0
    adj_noun_ratio  = ( adj_count / noun_count) if (noun_count > 0) else 0.0

    return [propositional_density, content_density, noun_verb_ratio, adj_noun_ratio]
