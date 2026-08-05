/* AdminChatActivities.tsx
--------------------------------------------------------------------------------
Admin-only page for managing Activities and their RAGInstructions.
Accessible at /admin/chat/activities.

Admins can:
 - View all instructions grouped (currently only memory_activity exists)
 - Create new instructions
 - Edit existing instructions
 - Delete instructions
*/
import { useState, useCallback } from "react";
import { useNavigate }           from "react-router-dom";

import { AdminPage     } from "./components/ui/AdminPage";
import { AdminCard     } from "./components/ui/AdminCard";
import { SectionHeader } from "./components/ui/SectionHeader";

import { RAGInstructions } from "@/api/models";
import { listRAGInstructions, createRAGInstruction, updateRAGInstructions, deleteRAGInstruction } from "@/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toastMessage } from "@/utils/functions/toast_helper";
import RAGInstructionModal from "@/components/modals/RAGInstructionModal";

type Mode = "create" | "edit";

export function AdminChatActivities() {
    const navigate     = useNavigate();
    const queryClient  = useQueryClient();

    // Fetch all global instructions
    const { data: instructions = [], isLoading } = useQuery({
        queryKey: ["ragInstructions"],
        queryFn : listRAGInstructions,
    });

    const refetch = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["ragInstructions"] });
    }, [queryClient]);

    // Modal state
    const [modalOpen,          setModalOpen         ] = useState(false);
    const [modalMode,          setModalMode         ] = useState<Mode>("create");
    const [activeInstruction,  setActiveInstruction ] = useState<RAGInstructions | null>(null);

    const existingNames = (instructions as RAGInstructions[]).map((r) => r.name);

    const openCreateModal = () => {
        setModalMode("create");
        setActiveInstruction(null);
        setModalOpen(true);
    };

    const openEditModal = (rag: RAGInstructions) => {
        setModalMode("edit");
        setActiveInstruction(rag);
        setModalOpen(true);
    };

    const handleDelete = async (rag: RAGInstructions) => {
        const confirmed = window.confirm(`Delete instruction "${rag.name}"? This cannot be undone.`);
        if (!confirmed) return;
        try {
            await deleteRAGInstruction(rag.id);
            toastMessage("Instruction deleted", true);
            refetch();
        } catch {
            toastMessage("Failed to delete instruction", false);
        }
    };

    const handleModalSubmit = async (values: {
        name: string;
        description: string;
        instructions: string;
        instruction_order: number;
    }) => {
        try {
            if (modalMode === "create") {
                if (existingNames.includes(values.name)) {
                    toastMessage("An instruction with this name already exists.", false);
                    return;
                }
                await createRAGInstruction(values);
                toastMessage("Instruction created", true);
            } else if (modalMode === "edit" && activeInstruction) {
                await updateRAGInstructions(activeInstruction.id, {
                    name             : activeInstruction.name, // name is not editable
                    description      : values.description,
                    instructions     : values.instructions,
                    instruction_order: values.instruction_order,
                });
                toastMessage("Instruction updated", true);
            }
            setModalOpen(false);
            setActiveInstruction(null);
            refetch();
        } catch {
            toastMessage("Something went wrong while saving.", false);
        }
    };

    return (
        <AdminPage>
            <div className="flex flex-col gap-6 pt-6">

                {/* Back navigation */}
                <button
                    className="text-sm text-admin-subtext hover:text-admin-text transition-colors w-fit"
                    onClick={() => navigate("/admin")}
                >
                    ← Back to Admin
                </button>

                {/* Page header */}
                <SectionHeader
                    title    = "Activity Instructions"
                    subtitle = "These instructions define the conversation states for the memory activity chat. Changes apply to all users."
                    actions  = {
                        <button
                            className="px-4 py-2 rounded-lg bg-admin-text text-white text-sm font-medium hover:opacity-90 transition-opacity"
                            onClick={openCreateModal}
                        >
                            + New Instruction
                        </button>
                    }
                />

                {/* Instructions list */}
                <AdminCard>
                    {isLoading ? (
                        <p className="text-sm text-admin-subtext">Loading instructions...</p>
                    ) : (instructions as RAGInstructions[]).length === 0 ? (
                        <p className="text-sm text-admin-subtext">
                            No instructions defined yet. Create instructions to customize how the AI
                            behaves during the memory activity chat. Each instruction represents a
                            conversation state, e.g. "start_conversation", "initiate_smalltalk", or "end_session".
                        </p>
                    ) : (
                        <ul className="divide-y divide-admin-border">
                            {(instructions as RAGInstructions[])
                                .slice()
                                .sort((a, b) => a.instruction_order - b.instruction_order || a.name.localeCompare(b.name))
                                .map((rag) => (
                                    <li key={rag.id} className="flex items-center justify-between py-3 gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-admin-text">{rag.name}</span>
                                                <span className="text-xs text-admin-subtext bg-admin-surface px-2 py-0.5 rounded-full">
                                                    order: {rag.instruction_order}
                                                </span>
                                            </div>
                                            <p className="text-xs text-admin-subtext mt-0.5 truncate">
                                                {rag.description || "No description"}
                                            </p>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <button
                                                className="px-3 py-1 text-xs rounded-md border border-admin-border text-admin-text hover:bg-admin-surface transition-colors"
                                                onClick={() => openEditModal(rag)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="px-3 py-1 text-xs rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                                                onClick={() => handleDelete(rag)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </li>
                                ))}
                        </ul>
                    )}
                </AdminCard>

            </div>

            {/* Reuse the existing modal */}
            <RAGInstructionModal
                isOpen        = {modalOpen}
                mode          = {modalMode}
                existingNames = {existingNames}
                initialValues = {
                    modalMode === "edit" && activeInstruction
                        ? {
                            name             : activeInstruction.name,
                            description      : activeInstruction.description,
                            instructions     : activeInstruction.instructions,
                            instruction_order: activeInstruction.instruction_order,
                          }
                        : undefined
                }
                onClose  = {() => { setModalOpen(false); setActiveInstruction(null); }}
                onSubmit = {handleModalSubmit}
            />
        </AdminPage>
    );
}