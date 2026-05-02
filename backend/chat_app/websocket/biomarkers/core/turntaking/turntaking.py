"""
Turn-taking biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.turntaking`

TODO: This is a placeholder version that returns a sinlge random ScoreSpan per 
      OpenSMILE feature window. The real implementation will use some form of
      overlap counts / pause statistics. I am not sure exactly how it will work, 
      it is still in development. 
"""
import random


def generate_turntaking(overlapped_speech_count, words) -> list[dict]:
    if not words: return []
    return [{
        "score_type" : "turntaking",
        "score"      : random.random(),
        "start_ts"   : words[ 0]["start"],
        "end_ts"     : words[-1]["end"  ],
    }]
