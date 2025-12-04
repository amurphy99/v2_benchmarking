import { updateRAGInstructions } from "@/api";
import { useRAGInstructions } from "@/hooks/queries/useRAGInstructions";
import { toastMessage } from "@/utils/functions/toast_helper";
import { h4 } from "@/utils/styling/sharedStyles";
import { useState } from "react";

export default function RAGForm() {
    const {data: RAGInstructions, isLoading} = useRAGInstructions();
    const [id, setId] = useState<number>(-1);
    const [name, setName] = useState<string>("");
    const [instructions, setInstructions] = useState<string>("");
    const [description,  setDescription ] = useState<string>("");

    if (isLoading) { return <p>Loading...</p>; }

    const setCurInstructions = (name: string) => {
        const idx = RAGInstructions.findIndex((rag) => rag.name === name);
        if (idx !== -1) {
            setId(idx);
            setName(RAGInstructions[idx].name);
            setInstructions(RAGInstructions[idx].instructions);
            setDescription(RAGInstructions[idx].description);
        }
    }

    // Form submission logic 
    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateRAGInstructions(id, {
            instructions: instructions,
            description: description
        })
        toastMessage("RAG Instructions Updated", true); 
    };

    // Common styles
    const formText      = "font-medium fw-bold";
    const borderStyle   = "border border-gray-100 py-1 px-2";

    return (
        <form onSubmit={onSubmit} className="flex flex-col w-3/4 sm:w-1/2 m-[1rem]">
            <div className={h4}> Chat Settings </div>
            <label className={formText}>RAG Instructions Name</label>
            <select className={`mt-1 ${borderStyle}`} onChange={(e) => {setCurInstructions(e.target.value)}} defaultValue="select" >
                <option value="select" disabled>Choose a Set of Instructions</option>
                {RAGInstructions.map((rag, idx) => (
                    <option key={idx} value={rag.name}>{rag.name}</option>))
                }
            </select>

            <label className={formText}>Description</label>
            <input type="text" className={`mt-1 mb-2 ${borderStyle}`} value={description} 
                onChange={(e) => setDescription(e.target.value)} disabled={name === "select"}>
            </input>

            <label className={formText}>Instructions</label>
            <textarea rows={10} className={`mt-1 mb-2 ${borderStyle}`} value={instructions} 
            onChange={(e) => setInstructions(e.target.value)} disabled={name === "select"}>

            </textarea>

            <button type="submit" className="btn btn-primary w-fit">
                Update RAG Instructions
            </button>
        </form>
    )
}