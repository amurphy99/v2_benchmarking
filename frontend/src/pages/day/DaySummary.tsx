import { ChatSession } from "@/api";
import { useLocation, useNavigate } from "react-router-dom";
import { dateFormatOptions } from "@/utils/styling/numFormatting";
import { useAuth } from "@/context/AuthProvider";
import { TopicsCard } from "../common/TopicsCard";
import { blockStyle, colStyle, smallShadow, widthStyle } from "@/utils/styling/sharedStyles";
import DropdownModal from "@/components/modals/DropdownModal";
import ChatSummaryCard from "@/components/graphics/ChatSummaryCard";
import ChatLengthCard from "@/components/graphics/ChatLengthCard";
import { Icon } from "@iconify/react/dist/iconify.js";
import getMoodIcon from "@/utils/functions/getMoodIcon";
import { useChatSession } from "@/hooks/queries/useChatSessions";

export function DaySummary() {
    const role = useAuth().account.role;
    const { state } = useLocation() as { state: { chatSession: ChatSession, albumDisplay: string } };
    const navigate = useNavigate();
    if (!state?.chatSession) { navigate("/chat"); };
    const chatDate = new Date(state.chatSession.date);

    const topics = state?.chatSession.topics.replace(/[\[\]"']/g, "").split(",");

    if (window.isMobile) {
    return (
        <div>
            <div className="font-bold text-2xl font-bold p-[1rem] justify-between hover:cursor-pointer" onClick={() => {navigate(-1);}}>
                ← {chatDate.toLocaleDateString("en-US", dateFormatOptions)}
            </div>
            <div className={colStyle}>
                <div className={`${blockStyle}`}>
                    <div className="flex flex-row justify-between items-center">
                        <h2 className={`${role}-text`}>Mood</h2>
                        <Icon icon={getMoodIcon(state?.chatSession.sentiment)} width={"3rem"}/>
                    </div>
                </div>
                <TopicsCard topics={topics} type="Daily" role={role} />
                <ChatLengthCard role={role} sessions={[state.chatSession]} type="" />
                <ChatSummaryCard role={role} sessions={[state.chatSession]} type="Daily" />
                <DropdownModal title="Speech Analysis" content={content} />
                <button className={`${role}-button p-[1rem] text-xl rounded-md sm:w-3/4 ${widthStyle}`}>
                    Download as PDF
                </button>
            </div>
        </div>
    )
    } else {
        return (
            <div>
                <div className="font-bold text-2xl font-bold p-[1rem] justify-between hover:cursor-pointer" onClick={() => {navigate(-1);}}>
                    ← {chatDate.toLocaleDateString("en-US", dateFormatOptions)}
                </div>
                <div className={colStyle}>
                    <div className="grid grid-cols-4 gap-[1rem] w-full">
                        <div className={`rounded-lg p-[1rem] md:p-[2rem] bg-white ${smallShadow}`}>
                            <h2 className={`${role}-text`}>Mood</h2>
                            <div className="flex flex-col justify-center items-center mt-[4rem]">
                                <Icon icon={getMoodIcon(state?.chatSession.sentiment)} width={"100%"}/>
                                <h2>{state?.chatSession.sentiment}</h2>
                            </div>
                        </div>
                        <div className="flex col-span-2">
                            <TopicsCard topics={topics} type="Daily" role={role} />
                        </div>
                        <div className="flex h-full">
                            <ChatLengthCard role={role} sessions={[state.chatSession]} type="" />
                        </div>
                    </div>
                    <ChatSummaryCard role={role} sessions={[state.chatSession]} type="Daily" />
                    <DropdownModal title="Speech Analysis" content={content} />
                    <button className={`${role}-button p-[1rem] text-xl rounded-md w-full`}>
                        Download as PDF
                    </button>
                </div>
            </div>
        )
    }
}

const content = [`You speech reflects perfect pronunciation. You have focused on all the topics as well.`, 
                `You sometimes get stuck finding and your sentence complexity can be improved as well.`, 
                `You can play word games or read out loud to practice your speech abilities in daily life.`]