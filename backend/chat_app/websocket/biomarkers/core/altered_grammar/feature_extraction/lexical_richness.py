"""
Existing domain metrics for lexical richness and linguistic diversity.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.feature_extraction.lexical_richness`

TODO: Apparently the MATTR final division/ratio thing is backwards compared to
      what it should be? I need to fix that in both versions when I copy this 
      over to the offline code and re-train the models.

TODO: Maybe add links to papers and stuff here? 

"""
import math
from collections import Counter


# --------------------------------------------------------------------------------
# Brunets Index
# --------------------------------------------------------------------------------
def get_brunets_index(n_words: int, n_unique_words: int) -> float:
    """
    Basic implementation of Brunet's index: N^(V^-0.165).
    Returns 0 for empty input.
    """
    if (n_words == 0) or (n_unique_words == 0): return 0.0
    brunets_index = (n_words ** (n_unique_words ** (-0.165)))
    return brunets_index


# --------------------------------------------------------------------------------
# Honore's Statistic
# --------------------------------------------------------------------------------
def get_honore_statistic(words: list[str]) -> float:
    """
    Calculates Honore's Statistic for lexical richness:
        100 * log(N) / (1 - (V1 / V))
    where V is unique words and V1 is the number of words appearing exactly
    once. Caps at 100 * log(N) when V1 == V.
    """
    N = len(words)
    if N == 0: return 0.0
    
    # Get word frequencies
    counts = Counter(words)
    V = len(counts)                                      # Number of unique words
    V1 = sum(1 for word in counts if counts[word] == 1)  # Words appearing once
    
    # Avoid dividing by zero when V1 == V (all words are unique)
    if V1 == V: return 100 * math.log(N) 
    return (100 * math.log(N)) / (1 - (V1 / V))


# --------------------------------------------------------------------------------
# Moving-Average Type-Token Ratio (Covington & McFall, 2010)
# --------------------------------------------------------------------------------
def get_mattr(all_word_tokens: list[str], window_size: int = 20) -> float:
    """
    Covington and McFall (2010)
    We cut the Gordian knot by computing and averaging the moving average 
    type-token ratio (MATTR). ... We choose a window length (say 500 words) and 
    then compute the TTR for words 1-500, then for words 2-501, then 3-502, and
    so on to the end of the text. The mean of all these TTRs is a measure of the 
    lexical diversity of the entire text and is not affected by text length or 
    by any statistical assumptions.

    NOTE: ratio is calculated as `window_size / unique` to match the offline
    code's exact formulation that the trained models used.
    """
    type_token_ratios = []
    for i in range(0, len(all_word_tokens)-window_size):
        window_words     = all_word_tokens[i:i+window_size]
        num_unique_words = len(set(window_words))

        type_token_ratio = window_size / num_unique_words
        type_token_ratios.append(type_token_ratio)

    if len(type_token_ratios) == 0: return len(all_word_tokens  ) / len(set(all_word_tokens))
    else:                           return sum(type_token_ratios) / len(type_token_ratios   )
