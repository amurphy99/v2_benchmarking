# rag_vectorstore/services.py

from typing import List

from django.utils import timezone
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings

from ..config import CHUNK_SIZE, CHUNK_OVERLAP, EMBED_MODEL_NAME
from ..models import RAGInstructionChunkEmbedding

# text splitter and embedding models are created once they are needed
_text_splitter = None
_embeddings_model = None


def get_text_splitter() -> RecursiveCharacterTextSplitter:
    global _text_splitter
    if _text_splitter is None:
        _text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
        )
    return _text_splitter


def get_embeddings_model() -> HuggingFaceEmbeddings:
    global _embeddings_model
    if _embeddings_model is None:
        _embeddings_model = HuggingFaceEmbeddings(
            model_name=EMBED_MODEL_NAME,
        )
    return _embeddings_model


# --- Create/Update one instruction ---


def index_single_instruction(instruction) -> None:
    """
    Build / update vector embeddings for a single RAGInstructions row.

    This is called after create or update.
      - Delete existing chunks for this instruction_id
      - Re-chunk the instructions text
      - Compute embeddings
      - Bulk-insert new rows
    """

    text = instruction.instructions or ""
    if not text.strip():
        # Nothing to index – ensure we delete any old chunks
        RAGInstructionChunkEmbedding.objects.filter(
            instruction_id=instruction.id
        ).delete()
        return

    splitter = get_text_splitter()
    chunks: List[str] = splitter.split_text(text)

    embeddings_model = get_embeddings_model()
    embeddings: List[List[float]] = embeddings_model.embed_documents(chunks)

    now = timezone.now()

    # delete old rows for the updated instructions and create new ones
    RAGInstructionChunkEmbedding.objects.filter(
        instruction_id=instruction.id
    ).delete()

    rows: List[RAGInstructionChunkEmbedding] = []
    for idx, (chunk_text, emb) in enumerate(zip(chunks, embeddings)):
        rows.append(
            RAGInstructionChunkEmbedding(
                instruction_id=instruction.id,
                user_id=getattr(instruction, "user_id", None),
                activity_id=getattr(instruction, "activity_id", None),
                name=instruction.name,
                chunk_index=idx,
                content=chunk_text,
                embedding=emb,
                last_indexed_at=now,
            )
        )

    RAGInstructionChunkEmbedding.objects.bulk_create(rows)


def delete_instruction_embeddings(instruction_id: int) -> None:
    """
    Delete all vector chunks for a given instruction.
    Called when a RAGInstructions row is deleted from the default DB.
    """
    RAGInstructionChunkEmbedding.objects.filter(
        instruction_id=instruction_id
    ).delete()
