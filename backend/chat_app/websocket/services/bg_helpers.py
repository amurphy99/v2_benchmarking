"""
Helpers for background/asynch tasks
"""

import asyncio, logging
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Start a background task and log any exception it raises
# ------------------------------------------------------------------
def fire_and_log(coro):
    async def _runner():
        try: 
            await coro
        except Exception: 
            logger.exception("Background task crashed")
    return asyncio.create_task(_runner())
