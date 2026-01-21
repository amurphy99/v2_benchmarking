import { FaUser  } from "react-icons/fa";
import { BsRobot } from "react-icons/bs";
import { PATIENT_HEX, CAREGIVER_HEX } from "@/utils/styling/colors";

import { useAuth } from "@/context/AuthProvider";
import { ChatSession, ChatMessage } from "@/api";
import { formatElapsed } from "@/utils/styling/numFormatting";
import { h2            } from "@/utils/styling/sharedStyles";

// ====================================================================
// Chat Transcription
// ====================================================================
// ToDo: Timestamp should be time from start of the chat in seconds
export default function ChatTranscript({ chatSession } : { chatSession: ChatSession }) {
    // Get the patients name & chat start time
    const { profile } = useAuth();
    const patient_name = `${profile.plwd.first_name} ${profile.plwd.last_name}`;
    const chatStart = new Date(chatSession.start_ts);

    // Make a copy and sort from earliest to latest
    const sortedMessages = [...chatSession.messages].sort(
        (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
    );


    // Return UI Component
    return (
    <div className="mt-[1rem]">
        <div className={h2}> Transcript: </div>

        <div className="overflow-y-auto mt-[1rem] border-1 rounded-lg border-gray-200 p-[1rem]">

            <div className="flex flex-col w-50">
                {sortedMessages.map((msg) => (<MessageBubble msg={msg} key={msg.id} pName={patient_name} chatStart={chatStart} />))}
            </div>


        </div>
    </div>
    );
}

// --------------------------------------------------------------------
// Individual message bubbles
// --------------------------------------------------------------------
function MessageBubble({ msg, pName, chatStart }: { msg: ChatMessage, pName: string, chatStart: Date }) {
    // Get the time elapsed since the start of the chat
    const elapsedMs = new Date(msg.ts).getTime() - chatStart.getTime();
    const elapsed   = formatElapsed(elapsedMs);

    if (msg.role == "user"     ) { return UserMessage({ msg, pName,            elapsed }); }
    if (msg.role == "assistant") { return UserMessage({ msg, pName:"Cognibot", elapsed }); }
}


function UserMessage({ msg, pName, elapsed } : { msg: ChatMessage, pName: string, elapsed: string }) {
    return (
    <div key={msg.id} className="flex my-[1rem]">
        <div className="mr-[0.75rem] flex h-9 w-9 items-center justify-center rounded-full border bg-gray-200"> 
            {pName == "Cognibot" ? <BsRobot size={25} color={CAREGIVER_HEX}/> 
                                 : <FaUser  size={25} color={  PATIENT_HEX}/> }
        </div>
        
        <div className="flex flex-col w-fit"> 
            {/* Firstname Lastname & Timestamp */}
            <div className="h-9 flex items-center gap-[0.75rem] fs-5"> 
                <span className="fw-bold"               > { pName   } </span> 
                <span className="fw-light text-gray-400"> { elapsed } </span>
            </div>

            {/* Message */}
            <div className="fs-5"> { msg.content } </div>

        </div>
    </div>
    );
}
