"""
Helpers for background/asynchronous tasks
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.bg_helpers`

"""

import asyncio, logging
logger = logging.getLogger(__name__)

# From this project
from ...services.logging_utils import BOLD, UNBOLD

# --------------------------------------------------------------------------------
# Start a background task and log any exception it raises
# --------------------------------------------------------------------------------
def fire_and_log(awaitable, *, name: str = "bg-task"):
    async def _runner():
        try:                           return await awaitable
        except asyncio.CancelledError: logger.debug    (f"Background task cancelled: {BOLD}{name}{UNBOLD}"); raise
        except Exception:              logger.exception(f"Background task crashed:   {BOLD}{name}{UNBOLD}")
    return asyncio.create_task(_runner(), name=name)


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

