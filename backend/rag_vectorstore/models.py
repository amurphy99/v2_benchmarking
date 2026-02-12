from django.db import models
from pgvector.django import VectorField
from .config import EMBED_DIM


class RagInstruction(models.Model):
    """
    One row per *chunk* of a RAGInstructions record.
    """

    # ID of the RAGInstructions row in the main Chat DB
    instruction_id = models.IntegerField(db_index=True)

    # db_index to create a non-unique index for faster lookups
    user_id     = models.IntegerField(null=True, blank=True, db_index=True) 
    activity_id = models.IntegerField(null=True, blank=True, db_index=True)
    name        = models.CharField(max_length=100, db_index=True)

    # Chunk info
    chunk_index = models.IntegerField()       # 0, 1, 2, ...
    content     = models.TextField()          # the origninal text of the chunk

    # The embedding dimension depends on the model used to generate it, it is 384 for minilm-l6-v2
    # we should probably read this from config or env variable later
    embedding = VectorField(dimensions=EMBED_DIM)

    # Used for upsert / partial rebuild logic
    last_indexed_at = models.DateTimeField()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # One row per (instruction, chunk_index)
        constraints = [
            models.UniqueConstraint(
                fields=["instruction_id", "chunk_index"],
                name="unique_instruction_chunk",
            )
        ]

    def __str__(self) -> str:
        return f"RAGInstructionChunkEmbedding(instr={self.instruction_id}, chunk={self.chunk_index})"
