"""
How a task chat ran: its settings, the setup it started with, and its record.
--------------------------------------------------------------------------------
`backend.chat_app.models.runs.run`

A task chat (the Map Task, cooperative planning, or speech elicitation) records
a `ChatRun` beside its `ChatSession`: the settings it ran with, which the chat
lists show and filter on, and the setup it started with (the avatar, whether
subtitles were on, and the account's language), which the admin chat pages
show. Other chats (open conversation, the activity, and the chats from before
runs were recorded) have none, so `ChatSession.run_or_none` is None for them.

The task's own record (its private materials and its last committed state,
rewritten after every saved reply) is a `TaskSnapshot` of its own, so a chat
list that loads each run never loads it. Only the admin task details page reads
it (`services/session_task_history.py`).

"""
from django.db import models

# From this project
from ..accounts import Profile
from ..chat     import ChatSession


# --------------------------------------------------------------------------------
# Task Chat Runs
# --------------------------------------------------------------------------------
# The settings a task chat ran with (named in `websocket/harnesses/`), and its starting setup
class ChatRun(models.Model):
    # Avatars the web chat page can show
    # (`AVATARS` in `frontend/src/pages/common/avatar/avatarRegistry.tsx` copies these)
    AVATAR_CHOICES = [
        ("smiley", "Smiley (2D)"  ), ("smiley-brows", "Smiley + eyebrows (2D)"), ("robot", "Robot (2D)"),
        ("qt",     "QT Robot (3D)"), ("buddy",        "Buddy Robot (3D)"      ),
    ]

    session   = models.OneToOneField(ChatSession, on_delete=models.CASCADE, related_name="run")
    condition = models.CharField(max_length=32, blank=True, default="")  # Its cue set ("cues"; "" for a chat type with none)
    variant   = models.CharField(max_length=32, blank=True, default="")  # Its task content: a map, a scenario, or a topic

    # Its starting setup ("" or None when not recorded: an older run, or a client that left it out)
    avatar    = models.CharField(max_length=32, choices=AVATAR_CHOICES, blank=True, default="")            # Avatar the client showed
    subtitles = models.BooleanField(null=True, default=None)                                               # Subtitles on at the start (a debug-mode switch later isn't counted)
    language  = models.CharField(max_length=16, choices=Profile.LANGUAGE_CHOICES, blank=True, default="")  # The account's language (`Profile.language`) at the start

    def __str__(self): return f"Run of ChatSession {self.session_id} ({self.condition}, {self.variant})"

# A task chat's private materials and its last committed state (admin task details only)
class TaskSnapshot(models.Model):
    run  = models.OneToOneField(ChatRun, on_delete=models.CASCADE, related_name="task_snapshot")
    data = models.JSONField()

    def __str__(self): return f"Task snapshot of run {self.run_id}"
