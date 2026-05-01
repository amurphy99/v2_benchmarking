"""
Shared text preprocessing for text-based biomarkers.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.text_preprocessing`

Returns the cleaned text, NLTK tokens, and POS tags. Each text biomarker
receives all three so we only tokenize and POS-tag once per utterance.
"""
import re
import nltk


def preprocess(text: str):
    """
    Standardize the raw utterance text for biomarker calculations.
      1. Lowercase + collapse whitespace.
      2. NLTK word_tokenize.
      3. NLTK pos_tag (returns list of (token, tag) tuples).
    """
    cleaned  = re.sub(r"\s+", " ", text.lower()).strip()
    tokens   = nltk.word_tokenize(cleaned)
    pos_tags = nltk.pos_tag(tokens)
    return cleaned, tokens, pos_tags

