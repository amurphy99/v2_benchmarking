import { request } from "../client";
import { RAGInstructions, UpdateRAGInstructionsPayload    } from "../models";

// GET & PUT
export const   listRAGInstructions = ()                    => request<RAGInstructions[]>(`/rag/`);
export const    getRAGInstructions = (name: string)                    => request<RAGInstructions>(`/rag/${name}/`);
export const updateRAGInstructions = (name: string, body: Partial<UpdateRAGInstructionsPayload>) => request<RAGInstructions>(`/rag/${name}/`, { method: "PUT", body: JSON.stringify(body) });
