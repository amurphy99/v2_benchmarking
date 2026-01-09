import { ChatMessage, ChatSession } from "@/api";
import { useLocation, useNavigate } from "react-router-dom";
import { dateFormatOptions } from "@/utils/styling/numFormatting";
import { useAuth } from "@/context/AuthProvider";
import { TopicsCard } from "../common/TopicsCard";
import { blockStyle, colStyle, widthStyle } from "@/utils/styling/sharedStyles";
import DropdownModal from "@/components/modals/DropdownModal";
import ChatSummaryCard from "@/components/graphics/ChatSummaryCard";
import ChatLengthCard from "@/components/graphics/ChatLengthCard";

export function DaySummary() {
    const { role } = useAuth();
    const { state } = useLocation() as { state?: { chatSession?: ChatSession, albumDisplay: string } };
    const navigate = useNavigate();
    if (!state?.chatSession) { navigate("/chat"); };
    const chatDate = new Date(state.chatSession.date)
    const toAlbum = () => navigate("/album", {state: state?.albumDisplay});

    function getSessionMessages(session: ChatSession) : ChatMessage[] {
        var messages: ChatMessage[] = [];
        for (var j = 0; j < session.messages.length; j++) {
            messages.push(session.messages[j]);
        }
        return messages;
    }

    
    return (
        <div>
            <div className="font-bold text-2xl font-bold p-[1rem] justify-between hover:cursor-pointer" onClick={() => {toAlbum()}}>
                ← {chatDate.toLocaleDateString("en-US", dateFormatOptions)}
            </div>
            <div className={colStyle}>
                <TopicsCard messages={getSessionMessages(state?.chatSession)} type="Daily" role={role} />
                <ChatSummaryCard role={role} sessions={[state.chatSession]}/>
                {role == "patient" ? null : <ChatLengthCard role={role} sessions={[state.chatSession]} type="" /> }
                <DropdownModal title="Speech Analysis" content={content} />
                <button className={`${role}-button p-[1rem] text-xl rounded-md sm:w-3/4 ${widthStyle}`}>
                    Download as PDF
                </button>
            </div>
        </div>
    )
}

const content = [`You speech reflects perfect pronunciation. You have focused on all the topics as well.`, 
                `You sometimes get stuck finding and your sentence complexity can be improved as well.`, 
                `You can play word games or read out loud to practice your speech abilities in daily life.`]