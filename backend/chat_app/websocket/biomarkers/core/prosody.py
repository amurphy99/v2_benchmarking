"""
Prosody biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.prosody`

TODO: This is a placeholder version that returns a sinlge random ScoreSpan per 
      OpenSMILE feature window. The real implementation will run a pretrained 
      model on each window's feature summary.
"""
import random


def generate_prosody(windows) -> list[dict]:
    return [{
        "score_type" : "prosody",
        "score"      : random.random(),
        "start_ts"   : w["start_dt"],
        "end_ts"     : w["end_dt"  ],
    } for w in windows]
