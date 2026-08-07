"""
Helpers for background/asynchronous tasks.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.bg_helpers`

"""
import asyncio, logging
logger = logging.getLogger(__name__)

from typing import Any, Awaitable

# From this project
from ...services.logging_utils import BOLD, UNBOLD

_BACKGROUND_TASKS: set[asyncio.Task] = set()  # Strong references for application-owned background work

# --------------------------------------------------------------------------------
# Start a background task and log any exception it raises
# --------------------------------------------------------------------------------
def fire_and_log(awaitable: Awaitable[Any], *, name: str = "bg-task") -> asyncio.Task[Any]:
    # Await the supplied work and make any otherwise-hidden failure visible
    async def _runner() -> Any:
        try:                           return await awaitable
        except asyncio.CancelledError: logger.debug    (f"Background task cancelled: {BOLD}{name}{UNBOLD}"); raise
        except Exception:              logger.exception(f"Background task crashed:   {BOLD}{name}{UNBOLD}")

    task = asyncio.create_task(_runner(), name=name)

    # Keep a strong reference until completion as recommended for asyncio tasks
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)

    return task

# --------------------------------------------------------------------------------
# Threadsafe version (used in STT)
# --------------------------------------------------------------------------------
def threadsafe_fire_and_log(loop, coro, *, name="bg-task"):
    fut = asyncio.run_coroutine_threadsafe(coro, loop)
    def _done(f):
        try: f.result()
        except Exception: logger.exception(f"Background task crashed: {BOLD}{name}{UNBOLD}")
    fut.add_done_callback(_done)
    return fut

# --------------------------------------------------------------------------------
# "Await" Wrapper Function for Debugging
# --------------------------------------------------------------------------------
# Sometimes functions called via "await" can error out but won't tell us...
# Wrap with this to debug
async def trace_await(label, awaitable, timeout=3): # timeout = None
    logger.info("-> %s", label)
    try:
        if timeout is not None: result = await asyncio.wait_for(awaitable, timeout=timeout)
        else:                   result = await awaitable
        logger.info("<- %s (ok)", label)
        return result
    
    except asyncio.CancelledError: logger.  warning("<- %s (CANCELLED)", label); raise
    except Exception:              logger.exception("<- %s (FAILED)",    label); raise
