import { FaCalendarWeek } from "react-icons/fa";

import { averageScore } from "@/utils/misc/scores";
import { ChatWeek } from "@/utils/functions/getChatWeeks";

import ChatBiomarkers from "@/pages/common/biomarkers/ChatBiomarkers";

// ====================================================================
// Weekly ChatSession card view
// ====================================================================
// * Number of chats, duration
// * Sentiment and topics
// * Averages for every session throughout the week
export default function ChatWeekCard({ week } : { week: ChatWeek }) {
    // --------------------------------------------------------------------
    // Calculate summary data
    // --------------------------------------------------------------------
    // Number of sessions and total duration
    const sessionCount = week.sessions.length;
    const totalMinutes = week.sessions.reduce((min, s) => {
        const start = new Date(s.start_ts).getTime();
        const end   = new Date(s.end_ts).getTime();
        return min + Math.round((end - start) / 60000);
    }, 0);

    // Biomarker scores
    const averageScores = averageScore(week.sessions);

    // Date styling
    const fmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
    const weekLabel = `${fmt.format(week.start)} - ${fmt.format(week.end)}`;

    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    return (
    <div className="d-flex flex-col px-[1rem] py-[1rem] gap-[1rem] border border-gray-300 rounded">
        {/* Top bar */}
        <div className="d-flex ">
            <div className="d-flex align-items-center gap-[0.5rem]"> 
                <FaCalendarWeek size={20}/> 
                <h4 className="mb-0"> {weekLabel} </h4>
            </div>

            <div className="d-flex ml-auto gap-[0.5rem] fs-5">
                <span> <b>{sessionCount}</b> {(sessionCount == 1) ? "chat" : "chats"}, </span>
                <span> <b>{totalMinutes}</b> minutes </span>
            </div>
        </div>

        {/* Summary Data */}
        <div className="grid md:grid-cols-2 grid-cols-1">
            {/* Topics, Sentiment, & other */}
            <div className="d-flex flex-col gap-[0.5rem]">
                <span className="fs-6 fw-semibold"> Topics: </span>
                <span className="fst-italic"> Add a summary of the topics for that week, the sentiment, suggestions, etc. </span>
            </div>

            {/* Scores */}
            <ChatBiomarkers avgScores={averageScores} prevScores={week.prevScores}/>
        </div>
    </div>
    );
}
