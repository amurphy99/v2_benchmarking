import { useEffect, useState } from "react";

type Mode = "create" | "edit";

interface RAGInstructionModalProps {
  isOpen: boolean;
  mode: Mode;
  // Used for edit mode; name is also used for display in the header
  initialValues?: {
    name: string;
    description: string;
    instructions: string;
  };
  // All existing instruction names for this user (used for duplicate check in create mode)
  existingNames: string[];
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    description: string;
    instructions: string;
  }) => void;
}

export default function RAGInstructionModal({
  isOpen,
  mode,
  initialValues,
  existingNames,
  onClose,
  onSubmit,
}: RAGInstructionModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset fields whenever the modal is opened or the mode/initialValues change
  useEffect(() => {
    if (!isOpen) return;

    setName(initialValues?.name ?? "");
    setDescription(initialValues?.description ?? "");
    setInstructions(initialValues?.instructions ?? "");
    setError(null);
  }, [isOpen, initialValues, mode]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (mode === "create") {
      if (!name.trim()) {
        setError("Please enter a keyword.");
        return;
      }

      const keywordRegex = /^[a-z0-9_]+$/;
      if (!keywordRegex.test(name)) {
        setError(
          "Keyword should use lowercase letters, numbers, and underscores only."
        );
        return;
      }

      if (existingNames.includes(name)) {
        setError(
          "You already have an instruction with this keyword. Please choose another."
        );
        return;
      }
    }

    if (!description.trim() || !instructions.trim()) {
      setError("Description and instructions cannot be empty.");
      return;
    }

    setError(null);
    onSubmit({ name, description, instructions });
  };

  const title =
    mode === "create" ? "Create New Instruction" : `Edit "${initialValues?.name}"`;

  const isCreate = mode === "create";

  const formText = "font-medium fw-bold";
  const borderStyle = "border border-gray-100 py-1 px-2";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-md shadow-md w-full max-w-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className={formText}>{title}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label className={formText}>Keyword</label>
          <input
            type="text"
            className={borderStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isCreate} // can't change keyword in edit mode
            placeholder="e.g. start_conversation (unique, lowercase_with_underscores)"
          />

          <label className={formText}>Short Description</label>
          <input
            type="text"
            className={borderStyle}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="1–2 lines describing when this instruction is used"
          />

          <label className={formText}>Instructions</label>
          <textarea
            rows={8}
            className={borderStyle}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Write the detailed instructions that will be used by the RAG system."
          />

          {error && <p className="text-sm text-red-500 mt-1">{error}</p>}

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {isCreate ? "Create Instruction" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
