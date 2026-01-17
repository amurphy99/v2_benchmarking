import { ChatSession } from "@/api";
import { blockStyle } from "@/utils/styling/sharedStyles";
import { useNavigate } from "react-router-dom";

export default function ChatSummaryCard( {role, sessions, type} : {role: string, sessions: ChatSession[], type: string} ) {
    const content = ["To Do: Add a summary of the chat sessions here.",
            "Today, Ann shared her love for late summer in New England, where she enjoy walking through fields and savoring the seasonal flowers like surprised lilies and goldenrod. She often explore nature with her son, discussing various topics and observing blooms by creeks.", 
            "Ann’s passion for history, especially the moon landing, is something she hope to share with her children, to give them a sense of exploration and the passage of time.",
        ]
    const navigate = useNavigate();
    
    const toTranscript = () => navigate("/transcript", {state: {chatSession: sessions[0]}});
    return (
        <div className={blockStyle}>
            <h2 className={`${role}-text`}>{type} Chat Summary</h2>
            <div className="text-lg">
                {content.map((text, idx) => {
                    return (
                        <p key={idx}>{text}</p>
                    )
                })}
            </div>
            {type == "Daily" ? 
            <button className={`${role}-button-outline p-[1rem] text-xl rounded-md w-full`} onClick={() => {toTranscript()}}> View Full Transcript </button>
            : null}
        </div>
    )
}