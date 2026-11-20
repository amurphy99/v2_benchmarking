"""
The memory activity's models: activities, their RAG instructions, and turn logs.
--------------------------------------------------------------------------------
`backend.chat_app.models.activities`

"""
from django.conf import settings
from django.db   import models

# From this project
from .chat       import ChatSession
from .field_args import init_args


# ================================================================================
# Activities and RAG Instructions Models
# ================================================================================

class Activity(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name

class RAGInstructions(models.Model):
    activity = models.ForeignKey(
        "Activity",
        on_delete=models.CASCADE,
        related_name="rag_instructions",
        null=True, blank=True, 
    )
    name = models.CharField(max_length=100)
    instructions = models.TextField()
    description = models.TextField()
    instruction_order = models.PositiveIntegerField(default=1, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "activity"],
                name="unique_rag_instruction_per_activity_name",
            )
        ]

    def __str__(self):
        activity_part = getattr(self.activity, "name", "NO_ACTIVITY")
        return f"GLOBAL / {activity_part} / {self.name}: {self.description}"

# ================================================================================
# LLMTurnLog -- logs raw LLM metadata per turn for the multi-agent activity chat
# ================================================================================
class LLMTurnLog(models.Model):
    """
    Stores per-turn LLM metadata for the multi-agent activity chat pipeline.
    """
    # Identifiers
    session     = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="llm_turn_logs", **init_args)
    user        = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="llm_turn_logs", **init_args)
    created_at  = models.DateTimeField(auto_now_add=True)

    # Turn-level metadata 
    activity_name               = models.CharField(max_length=100, **init_args)
    turn_index                  = models.PositiveIntegerField(**init_args)        # index of the turn within the session (starts at 0)
    user_text_length            = models.PositiveIntegerField(**init_args)        # character count of user input
    state_before                = models.CharField(max_length=100, **init_args)   # state at start of turn
    state_after                 = models.CharField(max_length=100, **init_args)   # state predicted at end of turn
    same_state_turn_count       = models.PositiveSmallIntegerField(**init_args)   # consecutive turns in same state
    forced_state_transition     = models.BooleanField(default=False)              # log if the state transition was forced (e.g., exceeded the max number of allowed turns in the same state)
    total_latency_ms            = models.PositiveIntegerField(**init_args)        # total latency of the turn

    # Per-agent data
    # Stores per-agent data as a JSON object, where each key corresponds to an agent and its value is a dictionary of agent-specific metadata.
    # This should allow for flexible logging, as we may need to change the data we log for each agent over time (e.g., adding new agents or changing the data we log for existing agents).
    agents_data = models.JSONField(default=dict)

    class Meta:
        ordering = ["created_at", "id"]
        indexes  = [models.Index(fields=["session", "created_at"])]

    def __str__(self):
        return f"LLMTurnLog session={self.session_id} turn={self.turn_index} state={self.state_before}->{self.state_after}"
