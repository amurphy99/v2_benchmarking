"""
Pronunciation biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.pronunciation`

TODO: This is a placeholder version that returns a sinlge random ScoreSpan per 
      OpenSMILE feature window. The real implementation will run a pretrained 
      model on each window's feature summary.
"""
import random


def generate_pronunciation(windows) -> list[dict]:
    return [{
        "score_type" : "pronunciation",
        "score"      : random.random(),
        "start_ts"   : w["start_dt"],
        "end_ts"     : w["end_dt"  ],
    } for w in windows]
