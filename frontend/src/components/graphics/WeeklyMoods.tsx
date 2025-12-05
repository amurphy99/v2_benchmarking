import { ChatWeek, getChatsInWeek } from "@/utils/functions/getChatWeeks";
import { Icon } from "@iconify/react/dist/iconify.js";

export default function WeeklyMoods( { week } : { week: ChatWeek } ) {
    const sessions = getChatsInWeek(week);
    const unflaggedStyle = "text-gray-400 align-middle";
    const flaggedStyle = "text-violet-600 align-middle";
    const emptyStyle = "size-[3rem] text-white rounded-full bg-white border-dashed border-2 border-gray-400"
    const emoteStyle = "size-[3rem] rounded-full"

    return (
        <div className="grid grid-cols-7 gap-2 w-full">
            {sessions.map((day, idx) => {
                return (
                    <div className="flex flex-col items-center" key={idx}>
                        <p className={day.sessions[0]?.sentiment == "Negative" ? flaggedStyle : unflaggedStyle}>{day.day}</p>
                        <div className={day.sessions.length > 0 ? emoteStyle : emptyStyle}>
                            {day.sessions.length > 0 ? getEmote(day.sessions[0]?.sentiment) : null}
                        </div>
                    </div>
                )
            })}
        </div>
    );
}

function getEmote(sentiment : string) {
    const emoteMap = {
            Happy: "fluent-emoji:beaming-face-with-smiling-eyes",
            Sad: "fluent-emoji:sad-but-relieved-face",
            Surprised: "fluent-emoji:astonished-face",
            Scared: "fluent-emoji:anguished-face",
            Angry: "fluent-emoji:angry-face",
            Neutral: "fluent-emoji:face-with-diagonal-mouth",
            Negative: "fluent-emoji:confused-face",
            Positive: "fluent-emoji:beaming-face-with-smiling-eyes",
            NA: "fluent-color:question-circle-48"
        };
    const icon = emoteMap[sentiment] || emoteMap["NA"];
    
    return (
        <Icon icon={icon} width={"100%"} height={"100%"} />
    )
}