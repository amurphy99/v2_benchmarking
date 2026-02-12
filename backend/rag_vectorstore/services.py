import logging
from pgvector.django import CosineDistance
from channels.db import database_sync_to_async
from .models import RagInstruction # Or whatever your model name is

logger = logging.getLogger(__name__)

async def Live_data_Fetch(user_id: int, user_text: str, embedding_model) -> str:
    """
    Karthick's specialized RAG logic. 
    Vectorizes the user text and finds the top 3 matching past facts.
    """
    try:
        # 1. Turn user message into a vector
        query_vector = await embedding_model.aembed_query(user_text)

        # 2. Query the DB using the custom vector
        @database_sync_to_async
        def query_db():
            # Filters by user_id so we only get THAT patient's history
            results = RagInstruction.objects.filter(user_id=user_id).annotate(
                distance=CosineDistance("embedding", query_vector)
            ).order_by("distance")[:3]
            
            return "\n".join([f"- {res.content}" for res in results])

        facts = await query_db()
        return facts if facts else "No specific past context found."

    except Exception as e:
        logger.error(f"[LIVE-FETCH-ERROR] {e}")
        return ""
