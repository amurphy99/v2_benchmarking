import { ChatSession } from "@/api";
import { blockStyle } from "@/utils/styling/sharedStyles";

export default function ChatSummaryCard( {role, sessions} : {role: string, sessions: ChatSession[]} ) {
    const content = ["To Do: Add a summary of the chat sessions here.",
            "Today, Ann shared her love for late summer in New England, where she enjoy walking through fields and savoring the seasonal flowers like surprised lilies and goldenrod. She often explore nature with her son, discussing various topics and observing blooms by creeks.", 
            "Ann’s passion for history, especially the moon landing, is something she hope to share with her children, to give them a sense of exploration and the passage of time.",
        ]
    return (
        <div className={blockStyle}>
            <h2 className={`${role}-text`}>Weekly Chat Summary</h2>
            <div className="text-lg">
                {content.map((text, idx) => {
                    return (
                        <p key={idx}>{text}</p>
                    )
                })}
            </div>
        </div>
    )
}