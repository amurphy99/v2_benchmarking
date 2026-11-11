"""
Read saved task history or identify current materials for an older session.
--------------------------------------------------------------------------------
`backend.chat_app.services.session_task_history`

Older sessions have no saved decisions or path. Their registered variant can
still identify today's materials, explicitly marked as unsaved rather than
presented as the materials or outcome recorded during that session.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from ..websocket.harnesses.cooperative_planning.harness    import PLANNING_SCENARIOS
from ..websocket.harnesses.cooperative_planning.plan_state import planning_history
from ..websocket.harnesses.map_task.harness                import MAP_TASK_MAPS
from ..websocket.harnesses.map_task.maps                   import follower_view, giver_view

if TYPE_CHECKING: from ..models import ChatSession


# ================================================================================
# Task History
# ================================================================================
# Prefer the immutable session snapshot; never reconstruct decisions from a transcript
def session_task_history(session: ChatSession) -> dict[str, object]:
    if session.task_snapshot is not None: return {"recorded": True, "view": session.task_snapshot}

    # A known old variant supplies materials only, with no claimed historical state
    view = None
    if (session.chat_type == "map_task") and (session.variant in MAP_TASK_MAPS):
        task_map = MAP_TASK_MAPS[session.variant]
        view = {"kind": "map_task", "giver": giver_view(task_map), "follower": follower_view(task_map), "path": None, "position": None}
    elif (session.chat_type == "cooperative_planning") and (session.variant in PLANNING_SCENARIOS):
        view = planning_history(PLANNING_SCENARIOS[session.variant], None)
    return {"recorded": False, "view": view}
