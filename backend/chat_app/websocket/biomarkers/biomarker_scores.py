"""
Entry point for the rest of the project to generate biomarker scores. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.biomarker_scores`

Placeholder biomarker scores during the rework. Returns random values in [0, 1].

"""
import random


def generate_utterance_biomarkers(context_buffer):
    return {
        "pragmatic"      : random.random(),
        "alteredgrammar" : random.random(),
        "anomia"         : random.random(),
    }

def generate_audio_biomarkers(overlapped_speech_count):
    return {
        "prosody"       : random.random(),
        "pronunciation" : random.random(),
        "turntaking"    : random.random(),
    }

