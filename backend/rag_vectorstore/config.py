# Embedding model to use
EMBED_MODEL_NAME: str = "/app/rag_vectorstore/models/MiniLM-L6-v2"

# Chunking parameters
CHUNK_SIZE: int =  800
CHUNK_OVERLAP: int = 120

# Embedding dimension. Must match the embedding model output.
EMBED_DIM: int = 384