import { useAuth } from "@/context/AuthProvider";
import { ChatWeek, getMessages } from "@/utils/functions/getChatWeeks";
import { dateFormatOptionsShort } from "@/utils/styling/numFormatting";
import { useLocation, useNavigate } from "react-router-dom";
import { TopicsCard } from "../common/TopicsCard";
import { colStyle, smallShadow } from "@/utils/styling/sharedStyles";
import DropdownModal from "@/components/modals/DropdownModal";
import ChatSummaryCard from "@/components/graphics/ChatSummaryCard";
import ChatLengthCard from "@/components/graphics/ChatLengthCard";
import { Icon } from "@iconify/react/dist/iconify.js";
import getMoodIcon from "@/utils/functions/getMoodIcon";

export function WeekSummary() {
    const { state } = useLocation() as { state?: { chatWeek?: ChatWeek, albumDisplay: string } };
    const navigate = useNavigate();
    if (!state?.chatWeek) { navigate("/chat"); };
    const role = useAuth().account.role;

    const chatWeek = state.chatWeek;
    const weeklyMessages = getMessages(chatWeek.sessions);

    const toAlbum = () => navigate("/album", {state: state?.albumDisplay});

    if (window.isMobile) {
        return (
        <div>
            <div className="font-bold text-2xl font-bold p-[1rem] justify-between hover:cursor-pointer" onClick={() => {toAlbum()}}>
                ← {chatWeek.start.toLocaleDateString("en-US", dateFormatOptionsShort)} - {chatWeek.end.toLocaleDateString("en-US", dateFormatOptionsShort)}
            </div>
            <div className={colStyle}>
                <TopicsCard messages={weeklyMessages} type="Weekly" role={role} />
                <ChatLengthCard role={role} sessions={chatWeek.sessions} type={"Average"} />
                <ChatSummaryCard role={role} sessions={chatWeek.sessions} type="Weekly" />
                <DropdownModal title="Weekly Analysis" content={content} />
            </div>
        </div>
        )
    } else {
        return (
                    <div>
                        <div className="font-bold text-2xl font-bold p-[1rem] justify-between hover:cursor-pointer" onClick={() => {toAlbum()}}>
                            ← {chatWeek.start.toLocaleDateString("en-US", dateFormatOptionsShort)} - {chatWeek.end.toLocaleDateString("en-US", dateFormatOptionsShort)}
                        </div>
                        <div className={colStyle}>
                            <div className="grid grid-cols-4 gap-[1rem] w-full">
                                <div className={`rounded-lg p-[1rem] md:p-[2rem] bg-white ${smallShadow}`}>
                                    <h2 className={`${role}-text`}>Mood (Most Recent)</h2>
                                    <div className="flex flex-col justify-center items-center mt-[4rem]">
                                        <Icon icon={getMoodIcon(chatWeek.sessions[0].sentiment)} width={"full"}/>
                                        <h2>{chatWeek.sessions[0].sentiment}</h2>
                                    </div>
                                </div>
                                <div className="flex col-span-2">
                                    <TopicsCard messages={weeklyMessages} type="Weekly" role={role} />
                                </div>
                                <div className="flex h-full">
                                    <ChatLengthCard role={role} sessions={chatWeek.sessions} type={"Average"} />
                                </div>
                            </div>
                            <ChatSummaryCard role={role} sessions={chatWeek.sessions} type="Weekly" />
                            <DropdownModal title="Speech Analysis" content={content} />
                            <button className={`${role}-button p-[1rem] text-xl rounded-md w-full`}>
                                Download as PDF
                            </button>
                        </div>
                    </div>
                )
    }
}

const content = [`Here would be an analysis of this week's speech.`,
                `6 chats with IRIS have been practiced in the past week. Overall you have fluent chat and perfect pronunciation. 
                You have focused on all the topics which reflected in the high performance of biomarker “pragmatic”. 
                Your turn-taking skills is also very good, which makes the conversation flow well.`,
                `You sometimes get stuck trying to find words and your sentence complexity can be improved as well.`,
                `There is no need to worry too much. Everything is going well. You can playing word games or read out loud 
                to practice your speech ability in daily life.`]