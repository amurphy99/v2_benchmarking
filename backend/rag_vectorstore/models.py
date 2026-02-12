from django.db import models
from pgvector.django import VectorField
from .config import EMBED_DIM


from django.db import models
from pgvector.django import VectorField
from .config import EMBED_DIM  # This should be in rag_vectorstore/config.py

class RagInstruction(models.Model):
    """
    Karthick's Vector Model: Stores the chunks of text and their AI vectors.
    """
    # Link to the main instruction ID from the chat_app if needed
    instruction_id = models.IntegerField(db_index=True, null=True, blank=True)

    # Basic metadata for filtering
    user_id     = models.IntegerField(null=True, blank=True, db_index=True) 
    activity_id = models.IntegerField(null=True, blank=True, db_index=True)
    name        = models.CharField(max_length=100, db_index=True)

    # The actual text and its vector
    content     = models.TextField()
    embedding   = VectorField(dimensions=EMBED_DIM) # e.g., 1536 for OpenAI/Gemini

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"RagInstruction(name={self.name}, category={self.user_id})"


