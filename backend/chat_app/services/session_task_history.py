"""
Read saved task history or identify current materials for an older session.
--------------------------------------------------------------------------------
`backend.chat_app.services.session_task_history`

A task chat's run keeps its snapshot (`models/runs/run.py`). Older sessions
have no saved decisions or path. Their registered variant can still identify
today's materials, explicitly marked as unsaved rather than presented as the
materials or outcome recorded during that session. A chat without a run (not a
task chat) has no task history.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from ..websocket.harnesses.cooperative_planning.harness    import PLANNING_SCENARIOS
from ..websocket.harnesses.cooperative_planning.plan_state import planning_history
from ..websocket.harnesses.map_task.harness                import MAP_TASK_MAPS
from ..websocket.harnesses.map_task.maps                   import follower_view, giver_view
from ..websocket.harnesses.speech_elicitation.harness      import elicitation_history
from ..websocket.harnesses.speech_elicitation.topics       import ELICITATION_TOPICS

if TYPE_CHECKING: from ..models import ChatSession


# ================================================================================
# Task History
# ================================================================================
# Prefer the immutable session snapshot; never reconstruct decisions from a transcript
def session_task_history(session: ChatSession) -> dict[str, object]:
    run = session.run_or_none
    if run is None:                   return {"recorded": False, "view": None}
    if hasattr(run, "task_snapshot"): return {"recorded": True,  "view": run.task_snapshot.data}

    # A known old variant supplies materials only, with no claimed historical state
    view = None
    if (session.chat_type == "map_task") and (run.variant in MAP_TASK_MAPS):
        task_map = MAP_TASK_MAPS[run.variant]
        view = {"kind": "map_task", "giver": giver_view(task_map), "follower": follower_view(task_map), "path": None, "position": None, "replies": None}
    elif (session.chat_type == "cooperative_planning") and (run.variant in PLANNING_SCENARIOS):
        view = planning_history(PLANNING_SCENARIOS[run.variant], None)
    elif (session.chat_type == "speech_elicitation") and (run.variant in ELICITATION_TOPICS):
        view = elicitation_history(ELICITATION_TOPICS[run.variant], None)
    return {"recorded": False, "view": view}
