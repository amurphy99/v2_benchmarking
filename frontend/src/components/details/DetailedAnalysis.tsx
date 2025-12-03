import { Icon } from "@iconify/react";
import { ChatSession     } from "@/api";
import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { biomarkerKeys, getSessionsBefore, averageScore } from "@/utils/misc/scores";
import { h2, cardStyle                   } from "@/utils/styling/sharedStyles";
import Biomarker   from "@/components/details/Biomarker";
//import MyWordCloud from "@/components/WordCloud";


// --------------------------------------------------------------------
// Detailed Analysis Panel
// --------------------------------------------------------------------
// ToDo: Word cloud
export default function DetailedAnalysis ({ session }: { session: ChatSession }) {
    const { data, isLoading } = useChatSessions();
    const prevScores = averageScore(getSessionsBefore(data, new Date(session.date)));
    const thisScores = session.average_scores;

    // Mood icon (ToDo: No idea what this is about)
    const icon = session.sentiment == 0 ? 
        "fluent-emoji:beaming-face-with-smiling-eyes" : session.sentiment == 1 ? 
            "fluent-emoji:confused-face" : "fluent-emoji:face-with-diagonal-mouth";

    // Return UI component
    if (isLoading) { return <p>Loading chat history...</p>; }
    return (
    <div className="mt-[1rem] ">
        <p className={h2}> Detailed Analysis: </p>

        <div className="grid md:grid-cols-2 grid-cols-1 h-full justify-stretch mt-[1rem] gap-4">
            
            {/* Daily Topics */}
            <div className={cardStyle}>
                <h4>Daily Topics</h4>
                {session.topics}
                {/* <MyWordCloud messages={chatData.messages} /> */}
            </div>
            
            {/* Mood */}
            <div className={cardStyle}>
                <h4>Mood Track</h4>
                <div className="flex flex-row gap-4">
                    <Icon icon={icon} width="50" height="50" />
                    <h2 className="text-3xl font-black">{session.sentiment}</h2>
                </div>
                <p> Here would be an analysis of the mood detected in the conversation. </p>
            </div>

            {/* Biomarker Improvement/Analysis Cards */}
            {biomarkerKeys.map((key, i) => ( 
                <Biomarker key={i} name={key} current={prevScores[key]} previous={thisScores[key]} session={session} />
            ))}

        </div>
    </div>
    );
}
