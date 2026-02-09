"""
Helpers for background/asynchronous tasks
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.bg_helpers`

"""

import asyncio, logging
logger = logging.getLogger(__name__)

# From this project
from ...services.logging_utils import BOLD, UNBOLD


# Start a background task and log any exception it raises
def fire_and_log(awaitable, name: str = "bg-task"):
    async def _runner():
        try:              await awaitable
        except Exception: logger.exception(f"Background task crashed: {BOLD}{name}{UNBOLD}")
    return asyncio.create_task(_runner(), name=name)
