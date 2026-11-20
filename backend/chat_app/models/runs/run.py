"""
How a task chat was run: its condition and task version, and the task's record.
--------------------------------------------------------------------------------
`backend.chat_app.models.runs.run`

A task chat (the Map Task, cooperative planning, or speech elicitation) records
a `ChatRun` beside its `ChatSession`: the settings it ran with, which the chat
lists show and filter on. Other chats (open conversation, the activity, and the
chats from before runs were recorded) have none, so `ChatSession.run_or_none` is
None for them.

The task's own record (its private materials and its last committed state,
rewritten after every saved reply) is a `TaskSnapshot` of its own, so a chat
list that loads each run never loads it. Only the admin task details page reads
it (`services/session_task_history.py`).

"""
from django.db import models

# From this project
from ..chat import ChatSession


# --------------------------------------------------------------------------------
# Task Chat Runs
# --------------------------------------------------------------------------------
# The settings a task chat ran with (their names in `websocket/harnesses/`)
class ChatRun(models.Model):
    session   = models.OneToOneField(ChatSession, on_delete=models.CASCADE, related_name="run")
    condition = models.CharField(max_length=32, blank=True, default="")  # Its cue set ("cues"; "" for a chat type with none)
    variant   = models.CharField(max_length=32, blank=True, default="")  # Its task content: a map, a scenario, or a topic

    def __str__(self): return f"Run of ChatSession {self.session_id} ({self.condition}, {self.variant})"

# A task chat's private materials and its last committed state (admin task details only)
class TaskSnapshot(models.Model):
    run  = models.OneToOneField(ChatRun, on_delete=models.CASCADE, related_name="task_snapshot")
    data = models.JSONField()

    def __str__(self): return f"Task snapshot of run {self.run_id}"
