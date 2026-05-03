"""
Syllable-based features for the Altered Grammar biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.feature_extraction.syllable_features`

Per-word syllable counts (CMU Pronouncing Dictionary, with NLTK SyllableTokenizer
fallback for OOV words) and the Flesch-Kincaid readability metrics derived from
them.

CMU_D and SSP are loaded once at module import. Both NLTK resources must be
present (handled by the Dockerfile's `nltk.downloader` line for `cmudict`).
"""
from nltk.corpus   import cmudict
from nltk.tokenize import SyllableTokenizer


# Module-level resources (heavy to construct repeatedly)
CMU_D = cmudict.dict()
SSP   = SyllableTokenizer()


# --------------------------------------------------------------------------------
# Word-level syllable count
# --------------------------------------------------------------------------------
def _get_syllable_count(word: str) -> int:
    """
    Returns the syllable count for a word. 
    Uses CMU Dictionary for accuracy, falls back to SyllableTokenizer.

    Pronunciations look like: ['P', 'R', 'OW1', 'G', 'R', 'AE2', 'M'].
    Count the items ending in a digit (meaning the vowel stresses).

    The SSP works on "un-dictionary-able" words like "Instagramming", etc.
    """
    word_lower = word.lower()

    # Strategy 1: CMU Dictionary (more accurate)
    if word_lower in CMU_D:

        # Get all pronunciations and get the syllable counts for all pronunciations 
        pronunciations  = CMU_D[word_lower]
        syllable_counts = [len([phone for phone in pron if phone[-1].isdigit()]) for pron in pronunciations]

        # Return the max (sometimes there are multiple)
        return max(syllable_counts)

    # Strategy 2: Fallback Tokenizer (approximation)
    return len(SSP.tokenize(word_lower))

# Wrapper to get syllable counts for a group of words
def get_syllable_counts(words: list[str]) -> list[int]:
    return [_get_syllable_count(w) for w in words]


# --------------------------------------------------------------------------------
# Readability features
# --------------------------------------------------------------------------------
def misc_syllable_features(num_sentences: int, words: list[str], syllables: list[int]) -> dict:
    """
    Returns 4 readability metrics in a dict. Key `"fleash_kincaid_reading_ease"`
    intentionally preserves the offline code's typo so trained models keep
    consuming the same column name.
    """
    # Average features
    avg_sentence_length = len(words    ) / max(1, num_sentences)
    avg_word_syllables  = sum(syllables) / max(1, len(words)   )

    # Flesch-Kincaid Grade Level & Reading Ease
    fk_grade = (0.39 * avg_sentence_length) + (11.8 * avg_word_syllables)
    fk_ease  = 206.835 - (1.015 * avg_sentence_length) - (84.6 * avg_word_syllables)

    return {
        "avg_sentence_length"         : avg_sentence_length,
        "avg_word_syllables"          : avg_word_syllables,
        "flesch_kincaid_grade_level"  : fk_grade,
        "flesch_kincaid_reading_ease" : fk_ease,
    }
