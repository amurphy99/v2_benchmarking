import { ChatSession } from "@/api";
import { blockStyleFull } from "@/utils/styling/sharedStyles";
import { useNavigate } from "react-router-dom";

export default function ChatSummaryCard( {role, sessions, type} : {role: string, sessions: ChatSession[], type: string} ) {
    const navigate = useNavigate();
    
    const toTranscript = () => navigate(`/transcript/${sessions[0].id}`, {state: {chatSession: sessions[0]}});
    return (
        <div className={blockStyleFull}>
            <h2 className={`${role}-text`}>{type} Chat Summary</h2>
            <div className="text-lg pb-4">
                {sessions[0].summary ?? "No summary available."}
            </div>
            {type == "Daily" ? 
            <button className={`${role}-button-outline p-[1rem] text-xl rounded-md w-full`} onClick={() => {toTranscript()}}> View Full Transcript </button>
            : null}
        </div>
)
}