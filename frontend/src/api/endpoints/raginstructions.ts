import { request } from "../client";
import { RAGInstructions    } from "../models";

// GET & PUT
export const   listRAGInstructions = ()                    => request<RAGInstructions[]>(`/rag/`);
export const    getRAGInstructions = (name: string)                    => request<RAGInstructions>(`/rag/${name}/`);
export const updateRAGInstructions = (name: string, body: Partial<RAGInstructions>) => request<RAGInstructions>(`/rag/${name}/`, { method: "PUT", body: JSON.stringify(body) });
