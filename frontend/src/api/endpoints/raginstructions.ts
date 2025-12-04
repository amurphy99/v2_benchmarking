import { request } from "../client";
import { RAGInstructions, UpdateRAGInstructionsPayload    } from "../models";

// GET & PUT
export const   listRAGInstructions = ()                    => request<RAGInstructions[]>(`/rags/`);
export const    getRAGInstructions = (id: number)                    => request<RAGInstructions>(`/rag/${id}/`);
export const updateRAGInstructions = (id: number, body: Partial<UpdateRAGInstructionsPayload>) => request<RAGInstructions>(`/rag/${id}/`, { method: "PUT", body: JSON.stringify(body) });
