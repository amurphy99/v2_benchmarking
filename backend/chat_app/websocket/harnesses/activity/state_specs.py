"""Manually authored goals and saved-turn limits for the memory activity."""
from dataclasses import dataclass
from typing import Literal

START_SCENARIO = "start_conversation"
CLOSE_SESSION_STATE = "close_session"


@dataclass(frozen=True)
class GoalSpec:
    id: str
    description: str
    actor: Literal["user", "assistant"]


@dataclass(frozen=True)
class StateSpec:
    goals: tuple[GoalSpec, ...]
    min_turns: int = 1
    max_turns: int = 5


# Limits count saved assistant replies in this state, never generation attempts.
# State names must match the live RAGInstructions rows. Closing is a virtual state.
STATE_SPECS = {
    "start_conversation": StateSpec((
        GoalSpec("greet", "Warmly greet and introduce yourself.", "assistant"),
        GoalSpec("engaged", "The user greets you or shares something about themselves.", "user"),
    ), max_turns=3),

    "initiate_smalltalk": StateSpec((
        GoalSpec("open_question", "Ask one light, open question.", "assistant"),
        GoalSpec("personal_detail", "The user shares a personal detail or preference.","user"),
    ), max_turns=4),

    "explore_user_interests": StateSpec((
        GoalSpec("follow_up", "Ask relevant follow-up questions about an interest.", "assistant"),
        GoalSpec("elaborated", "The user elaborates on an interest or personal memory.", "user"),
    ), min_turns=3, max_turns=6),

    "initiate_memory_activity": StateSpec((
        GoalSpec("offer_topics", "Offer ALL THREE: cars, early communication, and the Moon landing.", "assistant"),
        GoalSpec("topic_selected", "The user chooses or clearly favors a memory topic.", "user"),
    ), max_turns=4),

    "discuss_memory_activity_topic": StateSpec((
        GoalSpec("memory_question", "Ask what/how about the selected topic.", "assistant"),
        GoalSpec("memory_details", "The user shares details about that topic.", "user"),
    ), min_turns=3, max_turns=6),

    "emotional_reflections_on_topic": StateSpec((
        GoalSpec("feeling_question", "Invite feelings or personal meaning without pressuring.", "assistant"),
        GoalSpec("reflection", "The user expresses a feeling or personal meaning.", "user"),
    ), min_turns=2, max_turns=4),

    "connecting_past_with_present": StateSpec((
        GoalSpec("comparison_question", "Ask one question comparing past and present.", "assistant"),
        GoalSpec("comparison", "The user shares a past/present comparison.", "user"),
    ), max_turns=4),

    "imaginative_discussion": StateSpec((
        GoalSpec("imagination_question", "Invite a light imaginative scenario.", "assistant"),
        GoalSpec("imaginative_idea", "The user shares an imaginative idea.", "user"),
    ), max_turns=4),
}