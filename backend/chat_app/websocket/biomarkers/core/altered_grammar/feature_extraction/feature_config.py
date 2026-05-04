"""
Hardcoded configuration for Altered Grammar feature names & ordering.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.feature_extraction.feature_config`

"""

# --------------------------------------------------------------------------------
# POS category feature names (used to build 'gram_feats' in the right order)
# --------------------------------------------------------------------------------
# Count-based names (unused; we use ratio features to normalize by sentence length)
POS_CATEGORY_COUNT_NAMES = [
    # (9) POS-count-based features
    "noun_count", "verb_count", "adj_count", "adv_count",
    "coord_markers", "subord_markers", "reduced_verbs", "function_words",
    "num_predicates_approx",

    # (7) SYN/P ratio features
    "pronoun_count", "personal_pronoun_count", "determiner_count", "preposition_count",
    "verb_present_participle_count", "verb_modal_count", "verb_third_person_sing_count",
]

# Ratio-based names
POS_CATEGORY_RATIO_NAMES = [
    # (9) POS-ratio-based features
    "noun_ratio",
    "verb_ratio",
    "adj_ratio",
    "adv_ratio",
    "coord_markers",
    "subord_markers",
    "reduced_verbs",
    "function_words",
    "num_predicates_approx",
    
    # (7) SYN/P ratio features
    "pronoun_ratio",
    "personal_pronoun_ratio",
    "determiner_ratio",
    "preposition_ratio",
    "verb_present_participle_ratio",
    "verb_modal_ratio",
    "verb_third_person_sing_ratio",
]

# --------------------------------------------------------------------------------
# Final (34) feature names, in order
# --------------------------------------------------------------------------------
# TODO: Was 35, but I removed average sentence length
GRAMMAR_FEATURES = [
    # (9) POS-ratio-based features
    "noun_ratio",
    "verb_ratio",
    "adj_ratio",
    "adv_ratio",
    "coord_markers",
    "subord_markers",
    "reduced_verbs",
    "function_words",
    "num_predicates_approx",

    # (7) SYN/P ratio features
    "pronoun_ratio",
    "personal_pronoun_ratio",
    "determiner_ratio",
    "preposition_ratio",
    "verb_present_participle_ratio",
    "verb_modal_ratio",
    "verb_third_person_sing_ratio",

    # (2) Global stats
    "avg_word_length",
    "unique_words",

    # (4) Lexical richness features
    "type_token_ratio",
    "mattr",
    "honores_statistic",
    "brunets_index",

    # (3) Syllable & readability features
    #"avg_sentence_length",
    "avg_word_syllables",
    "flesch_kincaid_grade_level",
    "flesch_kincaid_reading_ease",

    # (3) Word repetitions
    "immediate_reps",
    "nearby_reps_k3",
    "nearby_reps_k5",

    # (2) POS pattern variety + density
    "pos_pattern_variety",
    "pos_pattern_density",

    # (4) Specific ratio features
    "propositional_density",
    "content_density",
    "noun_verb_ratio",
    "adj_noun_ratio",
]


# ================================================================================
# Penn Treebank POS tag sets & generic word lists for counts
# ================================================================================
# Penn Treebank POS Tag Sets
FUNCTION_WORD_TAGS = {
    "CC", "DT", "EX", "IN", "LS", "MD", "PDT", "POS", "PRP", "PRP$",
    "RP", "TO", "UH", "WDT", "WP", "WP$", "WRB",
}

VERB_TAGS = {"VB", "VBD", "VBG", "VBN", "VBP", "VBZ"}
NOUN_TAGS = {"NN", "NNS", "NNP", "NNPS", "PRP"}
ADJ_TAGS  = {"JJ", "JJR", "JJS"}
ADV_TAGS  = {"RB", "RBR", "RBS"}

PRONOUN_TAGS    = {"PRP", "PRP$", "WP", "WP$"}
DETERMINER_TAGS = {"DT", "PDT", "WDT"}
PREP_TAGS       = {"IN", "TO"}                 # IN covers most preps; TO covers infinitival "to"
MODAL_TAGS      = {"MD"}                       # Modal verbs
VBG_TAGS        = {"VBG"}                      # Present participle
VBZ_TAGS        = {"VBZ"}                      # 3rd person singular present

# --------------------------------------------------------------------------------
# Generic Word Lists
# --------------------------------------------------------------------------------
# Rough list of subordinating conjunctions
SUBORDINATING_WORDS = {
    "because", "although", "though", "since", "when", "while", "if",
    "unless", "before", "after", "until", "whereas", "that", "whether",
}

PERSONAL_PRONOUNS = {
    "i", "me", "my", "mine", "myself",
    "we", "us", "our", "ours", "ourselves",
    "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself",
    "she", "her", "hers", "herself",
    "they", "them", "their", "theirs", "themselves",
}
