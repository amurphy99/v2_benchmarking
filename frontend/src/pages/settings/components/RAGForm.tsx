import { createRAGInstruction, updateRAGInstructions, deleteRAGInstruction } from "@/api";
import { RAGInstructions } from "@/api/models";
import { useRAGInstructions } from "@/hooks/queries/useRAGInstructions";
import { toastMessage } from "@/utils/functions/toast_helper";
import { h4 } from "@/utils/styling/sharedStyles";
import { useState } from "react";
import RAGInstructionModal from "@/components/modals/RAGInstructionModal";
import { useProfile } from "@/hooks/queries/useProfile";

type Mode = "create" | "edit";

export default function RAGForm() {
  const { data: profile, isLoading: profileLoading } = useProfile();

  const {
    data: ragInstructions = [],
    isLoading,
    refetch,
  } = useRAGInstructions(profile?.id);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<Mode>("create");
  const [activeInstruction, setActiveInstruction] = useState<{
    id: number;
    name: string;
    description: string;
    instructions: string;
    instruction_order: number; 
  } | null>(null);

  if (isLoading || profileLoading) {
    return <p>Loading...</p>;
  }

  // Extract existing names for duplicate checks
  const existingNames = ragInstructions.map((rag: RAGInstructions) => rag.name);

  const openCreateModal = () => {
    setModalMode("create");
    setActiveInstruction(null);
    setModalOpen(true);
  };

  const openEditModal = (rag: RAGInstructions) => {
    setModalMode("edit");
    setActiveInstruction({
      id: rag.id,
      name: rag.name,
      description: rag.description,
      instructions: rag.instructions,
      instruction_order: rag.instruction_order,
    });
    setModalOpen(true);
  };

  const handleDelete = async (rag: RAGInstructions) => {
    const confirmed = window.confirm(
      `Delete instruction "${rag.name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteRAGInstruction(rag.id);
      toastMessage("RAG instruction deleted", true);
      await refetch?.();
    } catch (err) {
      console.error(err);
      toastMessage("Failed to delete RAG instruction", false);
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
        // Extra client-side duplicate guard (DB constraint still protects us)
        if (existingNames.includes(values.name)) {
          toastMessage(
            "You already have an instruction with this keyword.",
            false
          );
          return;
        }

        await createRAGInstruction({
          name: values.name,
          description: values.description,
          instructions: values.instructions,
          instruction_order: values.instruction_order,
        });
        toastMessage("RAG instruction created", true);
      } else if (modalMode === "edit" && activeInstruction) {
        await updateRAGInstructions(activeInstruction.id, {
          name: activeInstruction.name,   // name is not editable
          description: values.description,
          instructions: values.instructions,
          instruction_order: values.instruction_order,
        });
        toastMessage("RAG instruction updated", true);
      }

      setModalOpen(false);
      setActiveInstruction(null);
      await refetch?.();
    } catch (err: any) {
      console.error(err);
      toastMessage("Something went wrong while saving.", false);
    }
  };

  // Common styles
  const formText = "font-medium fw-bold";
  const borderStyle = "border border-gray-100 py-1 px-2";

  return (
    <section className="flex flex-col w-3/4 sm:w-1/2 m-[1rem]">
      <div className={h4}>Memory Activity Chat Settings</div>

      <div className="flex items-center justify-between mt-4 mb-3">
        <div className={formText}>Model Instructions</div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreateModal}
        >
          Create New Instruction
        </button>
      </div>

      {ragInstructions.length === 0 ? (
        <p className="text-sm text-gray-500">
          You don&apos;t have any RAG instructions yet. Create instructions to customize
          how your model behaves during the conversation. Each instruction should represent a 
          specific scenario or state you want the model to follow, eg. &quot;start_conversation&quot;, &quot;initiate_smalltalk&quot;, or &quot;end_session&quot;.
        </p>
      ) : (
        <ul
          className={`border border-gray-100 rounded-md divide-y divide-gray-100 ${borderStyle}`}
        >
          {ragInstructions.map((rag: RAGInstructions) => (
            <li
              key={rag.id}
              className="flex items-center justify-between px-3 py-2"
            >
              <div>
                <div className="text-sm font-semibold">
                  {rag.name} <span className="text-xs text-gray-400">({rag.instruction_order})</span>
                </div>

                <div className="text-xs text-gray-500">
                  {rag.description || "No description"}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => openEditModal(rag)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => handleDelete(rag)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <RAGInstructionModal
        isOpen={modalOpen}
        mode={modalMode}
        existingNames={existingNames}
        initialValues={
          modalMode === "edit" && activeInstruction
            ? {
                name: activeInstruction.name,
                description: activeInstruction.description,
                instructions: activeInstruction.instructions,
                instruction_order: activeInstruction.instruction_order,
              }
            : undefined
        }
        onClose={() => {
          setModalOpen(false);
          setActiveInstruction(null);
        }}
        onSubmit={handleModalSubmit}
      />
    </section>
  );
}
