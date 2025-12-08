import { request } from "../client";
import { RAGInstructions, CreateRAGInstructionsPayload, UpdateRAGInstructionsPayload } from "../models";

// List all instructions for the current user
export const listRAGInstructions = () => request<RAGInstructions[]>(`/rags/`);

// Retrieve a single instruction (if you still need it)
export const getRAGInstructions = (id: number) => request<RAGInstructions>(`/rag/${id}/`);

// Create a new instruction
export const createRAGInstruction = (body: CreateRAGInstructionsPayload) =>
  request<RAGInstructions>(`/rags/`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// Update an existing instruction (description + instructions only)
export const updateRAGInstructions = (
  id: number,
  body: UpdateRAGInstructionsPayload
) =>
  request<RAGInstructions>(`/rag/${id}/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

// Delete an instruction
export const deleteRAGInstruction = (id: number) => request<void>(`/rags/${id}/`, { method: "DELETE", });
