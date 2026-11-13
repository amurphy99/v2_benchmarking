"""
The opening questions a speech elicitation chat can start from, and where to take them.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.topics`

Each variant is one topic: a light question with no right answer, which the
avatar opens the chat with, and a few fresh angles for when a thread runs dry.
The angles go in the reply prompt (`prompts.py`); the avatar picks among them.

"""
from __future__  import annotations
from dataclasses import dataclass


# One topic: the question that opens the chat, and directions to take it in
@dataclass(frozen=True, slots=True)
class Topic:
    opening : str              # The avatar's first words, ending with the question
    angles  : tuple[str, ...]  # Fresh directions, worded to follow "ask about"


# Every topic, by the `variant` that picks it (the first is the default)
ELICITATION_TOPICS = {
    "pet_person": Topic(
        opening = "Hi! I've got a fun one for us today. Are you a cat person, a dog person, or a plant person?",
        angles  = (
            "a pet or a plant they grew up with",
            "which of the three is the most work to look after",
            "what the choice says about a person",
            "the funniest thing a pet of theirs has ever done",
            "what it would take to make them switch sides",
            "the best and the worst pet names they have heard",
        ),
    ),
    "mountains_or_beaches": Topic(
        opening = "Hi! I've got a fun one for us today. If you had to pick one for a vacation, would it be the mountains or the beach?",
        angles  = (
            "the best trip to either one they have ever taken",
            "what they actually do all day once they are there",
            "the food that goes with each",
            "a trip to one of them that went wrong",
            "who they would bring along, and who they would leave at home",
            "whether their answer has changed since they were young",
        ),
    ),
    "retirement_spot": Topic(
        opening = "Hi! I've got a fun one for us today. If you could retire anywhere in the country, would you pick the east coast, the west coast, the north, or the south?",
        angles  = (
            "the weather they could and couldn't live with",
            "the places they have lived, and which felt most like home",
            "what an ordinary day there would look like",
            "whether they would rather be near family or near something to do",
            "the one thing a place must have for them to move there",
            "a place they visited once and never wanted to leave",
        ),
    ),
}

# Topics a client can pick with `variant`
ELICITATION_VARIANTS = tuple(ELICITATION_TOPICS)
