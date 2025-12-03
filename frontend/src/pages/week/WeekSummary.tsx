import { useAuth } from "@/context/AuthProvider";
import { ChatWeek, getWeeklyMessages } from "@/utils/functions/getChatWeeks";
import { dateFormatOptionsShort } from "@/utils/styling/numFormatting";
import { useLocation, useNavigate } from "react-router-dom";
import { TopicsCard } from "../common/TopicsCard";
import { blockStyle, colStyle, widthStyle } from "@/utils/styling/sharedStyles";
import { useState } from "react";
import { IoIosArrowForward, IoIosArrowDown } from "react-icons/io";
import DropdownModal from "@/components/modals/DropdownModal";

export function WeekSummary() {
    const { state } = useLocation() as { state?: { chatWeek?: ChatWeek, albumDisplay: string } };
    const navigate = useNavigate();
    if (!state?.chatWeek) { navigate("/chat"); };
    const [showAnalysis, setShowAnalysis] = useState<boolean>(false);
    const role = useAuth().profile?.role?.toLowerCase();

    const chatWeek = state.chatWeek;
    const weeklyMessages = getWeeklyMessages(chatWeek);

    const toAlbum = () => navigate("/album", {state: state?.albumDisplay});
    
    function ChatSummaryCard() {
        return (
            <div className={blockStyle}>
                <h2 className={`${role}-text`}>Weekly Chat Summary</h2>
                <p className="text-lg">To do: Add a summary of the weekly chats.</p>
            </div>
        )
    }

    return (
        <div className="pb-[3rem]">
            <div className="font-bold text-2xl font-bold p-[1rem] justify-between hover:cursor-pointer" onClick={() => {toAlbum()}}>
                ← {chatWeek.start.toLocaleDateString("en-US", dateFormatOptionsShort)} - {chatWeek.end.toLocaleDateString("en-US", dateFormatOptionsShort)}
            </div>
            <div className={colStyle}>
                <TopicsCard messages={weeklyMessages} type="Weekly" role={role} />
                <ChatSummaryCard />
                <DropdownModal title="Weekly Analysis" content={content} />
            </div>
        </div>
    )
}

const content = [`Here would be an analysis of this week's speech.`,
                `6 chats with IRIS have been practiced in the past week. Overall you have fluent chat and perfect pronunciation. 
                You have focused on all the topics which reflected in the high performance of biomarker “pragmatic”. 
                Your turn-taking skills is also very good, which makes the conversation flow well.`,
                `You sometimes get stuck trying to find words and your sentence complexity can be improved as well.`,
                `There is no need to worry too much. Everything is going well. You can playing word games or read out loud 
                to practice your speech ability in daily life.`]