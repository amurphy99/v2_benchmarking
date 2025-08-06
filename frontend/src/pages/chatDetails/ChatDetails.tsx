import { useNavigate, useLocation } from "react-router-dom";
import { IoIosChatbubbles         } from "react-icons/io";

import { ChatSession                     } from "@/api";
import { useChatSessions                 } from "@/hooks/queries/useChatSessions";
import { getSessionsBefore, averageScore } from "@/utils/misc/scores";
import { dateFormatLong                  } from "@/utils/styling/numFormatting";

import RadarTrack       from "./components/RadarTrack";
import ChatTranscript   from "./components/ChatTranscript";
import ChatBiomarkers   from "./components/ChatBiomarkers";


// ====================================================================
// ChatDetails
// ====================================================================
export function ChatDetails () {
    // If the page wasn't loaded with a ChatSession, reroute
    const { state } = useLocation() as { state?: { chatSession?: ChatSession } };
    if (!state?.chatSession) { useNavigate()("/dashboard"); };
    const chatDate = new Date(state?.chatSession.date);

    // Previous average scores
    const { data, isLoading } = useChatSessions();
    const prevScores = averageScore(getSessionsBefore(data, chatDate));


    // Return UI Component
    if (isLoading) { return <p>Loading chat history...</p>; }
    return (
    <div className="flex flex-col">
        {chatOverview(dateFormatLong.format(chatDate))}
        
        <div className="flex flex-col mx-[1rem]">

            <div className="flex gap-4"> 
                <div className="w-1/2"> <ChatBiomarkers chatSession={state?.chatSession}                prevScores={prevScores} /> </div>
                <div className="w-1/2"> <RadarTrack     current    ={state?.chatSession.average_scores} previous  ={prevScores} /> </div>
            </div>

            <ChatTranscript chatSession={state?.chatSession}/>

        </div>
    </div>
    );
}

// --------------------------------------------------------------------
// Header Helper
// --------------------------------------------------------------------
function chatOverview(chatDate: string) {
    const dateStyle = "text-violet-600 text-4xl";
    return (
        <div className="flex flex-row items-center mx-[1rem] mb-[1rem] gap-[1rem] mt-[1rem]">
            <IoIosChatbubbles size={40} />
            <b className={dateStyle}>{chatDate}</b>
        </div>
    );
}
