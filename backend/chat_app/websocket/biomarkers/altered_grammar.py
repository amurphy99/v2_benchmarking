"""
Altered Grammar biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.altered_grammar`

Placeholder version: utterance-wide score = unique POS tags / total tokens.

TODO: Real biomarker score calculation will be added in here.

TODO: Maybe add types...

"""


def generate_altered_grammar(cleaned, tokens, pos_tags, words) -> list[dict]:
    if not tokens or not words: return []

    unique_tags = {tag for _, tag in pos_tags}
    score       = len(unique_tags) / len(tokens)

    return [{
        "score_type" : "alteredgrammar",
        "score"      : float(score),
        "start_ts"   : words[ 0]["start"],
        "end_ts"     : words[-1]["end"  ],
    }]

