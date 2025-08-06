import { useNavigate } from "react-router-dom";
import { ChatSession } from "@/api";
import { getSessionsBefore, averageScore } from "@/utils/misc/scores";

import ChatBiomarkers from "@/pages/common/biomarkers/BiomarkersSlim";

import { dateFormat, dateFormatTime  } from "@/utils/styling/numFormatting";


// ====================================================================
// ChatSession card view
// ====================================================================
// ToDo: Add little icons to this
// * Used from multiple pages
// * Show: date, duration, topics, sentiment, scores
export default function ChatSessionCard({ session, sessions } : { session: ChatSession, sessions: ChatSession[] }) {
    // Click to view the single chat analysis
    const navigate = useNavigate();
    const toChatDetails = () => { navigate("/chatDetails", { state: { chatSession: session } }) };

    // Get scores to compare this chat against
    const chatDate = new Date(session.date);
    const prevScores = averageScore(getSessionsBefore(sessions, chatDate));

    // Setup
    const duration = Math.ceil(session.duration / 60);

    // --------------------------------------------------------------------
    // Return UI component 
    // --------------------------------------------------------------------
    return (
    <button key={session.id} onClick={toChatDetails} className="flex flex-col border-1 px-[2rem] py-[1.5rem] border-gray-300 rounded hover:shadow-xl">
        {/* Header/Title */}
        <div className="d-flex justify-between">
            <div className="d-flex align-items-center gap-[0.5rem]">
                <h4 className="mb-0"> {dateFormat.format(chatDate)} </h4>
                <span> {dateFormatTime.format(chatDate)} </span>
            </div>
            
            <span className="fs-6"> <b> {duration} </b> minutes </span>
        </div>

        {/* Chat Info */}
        <div className="flex flex-col space-between">

            {/* Topics, Sentiment, & Composite Score  -- border-y border-gray-300 */}
            <div className="flex flex-col my-[0.25rem] py-[0.5rem] gap-[0.5rem] items-start">
                <span> <b>Topics covered:</b> {session.topics} </span>
                <span> <b>Sentiment:</b> {session.sentiment} </span>
                <span className="fst-italic"> <b>ToDo:</b> Composite score </span>
            </div>

        
            {/* Biomarkers */}
            <div className="mt-[1rem]"> 
                <ChatBiomarkers chatSession={session} prevScores={prevScores} /> 
            </div>

        </div>
    </button>
    );
}
