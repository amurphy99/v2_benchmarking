import { ChatMessage, ChatSession } from "@/api";
import { useLocation, useNavigate } from "react-router-dom";
import MyWordCloud from "../common/WordCloud";
import { dateFormatOptions } from "@/utils/styling/numFormatting";
import { useAuth } from "@/context/AuthProvider";
import { TopicsCard } from "../common/TopicsCard";
import { colStyle, widthStyle } from "@/utils/styling/sharedStyles";
import DropdownModal from "@/components/modals/DropdownModal";

export function DaySummary() {
    const { state } = useLocation() as { state?: { chatSession?: ChatSession, albumDisplay: string } };
    const navigate = useNavigate();
    if (!state?.chatSession) { navigate("/chat"); };
    const chatDate = new Date(state.chatSession.date)
    const role = useAuth().profile.role.toLowerCase();
    const toAlbum = () => navigate("/album", {state: state?.albumDisplay});
    const toTranscript = () => navigate("/transcript", {state: {chatSession: state.chatSession, albumDisplay: state.albumDisplay}});

    function ChatSummaryCard() {
        return (
            <div className="rounded-lg w-full p-[2rem] sm:w-3/4 lg:w-1/2 bg-white shadow-md shadow-gray-300">
                <h2 className={`${role}-text`}>Chat Summary</h2>
                <p className="text-lg">To do: Add a summary of the chat.</p>
                <button className={`${role}-button-outline p-[1rem] text-xl rounded-md w-full`} onClick={() => {toTranscript()}}> View Full Transcript </button>
            </div>
        )
    }

    function getSessionMessages(session: ChatSession) : ChatMessage[] {
        var messages: ChatMessage[] = [];
        for (var j = 0; j < session.messages.length; j++) {
            messages.push(session.messages[j]);
        }
        return messages;
    }

    
    return (
        <div className="pb-[3rem]">
            <div className="font-bold text-2xl font-bold p-[1rem] justify-between hover:cursor-pointer" onClick={() => {toAlbum()}}>
                ← {chatDate.toLocaleDateString("en-US", dateFormatOptions)}
            </div>
            <div className={colStyle}>
                <TopicsCard messages={getSessionMessages(state?.chatSession)} type="Daily" role={role} />
                <ChatSummaryCard />
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