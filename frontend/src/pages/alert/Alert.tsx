import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { ChatWeek, getCurrentWeek } from "@/utils/functions/getChatWeeks";
import { blockStyle, colStyle } from "@/utils/styling/sharedStyles";
import WeeklyMoods from "@/components/graphics/WeeklyMoods";
import { getMoodAlert, getWordAlert, WordAlert } from "@/utils/functions/getAlerts";
import { useAuth } from "@/context/AuthProvider";
import { dateFormatOptionsShort } from "@/utils/styling/numFormatting";

export function Alert() {
    const { data: sessions, isLoading } = useChatSessions();

    if (isLoading) { 
        return <p>Loading...</p>; 
    }

    const week = getCurrentWeek(sessions);

    const moodAlertDays = getMoodAlert(week.sessions);
    const wordAlerts = getWordAlert(week.sessions);

    return (
        <div className={colStyle}>
            {moodAlertDays.length > 0 ? 
                <MoodAlert week={week} days={moodAlertDays} /> :
                null
            }
            {wordAlerts.length > 0 ?
                <FlaggedWordAlert wordAlerts={wordAlerts} /> :
                null
            }
            {moodAlertDays.length == 0 && wordAlerts.length == 0 ? 
                <div className="text-2xl text-gray-500 font-bold">No alerts this week. Great!</div> : 
                null}
        </div>
    )
}

function FlaggedWordAlert( { wordAlerts } : { wordAlerts: WordAlert[] } ) {
    return (
        <div className={blockStyle}>
            <h2 className={`caregiver-text mb-0`}>Flagged Words</h2>
            <p className="text-lg mt-[1rem]">{useAuth().profile.plwd.first_name} mentioned several flagged words this week.</p>
            <div className="flex flex-col gap-2">
                {wordAlerts.map( (alert, idx) => {
                    return(
                        <div className="grid grid-cols-4 items-start justify-between" key={idx}>
                            <li className="text-xl text-center font-semibold underline text-violet-600 m-0">
                                {alert.date.toLocaleDateString("en-US", dateFormatOptionsShort)}
                            </li>
                            <div className="text-xl col-span-3 flex flex-row flex-wrap gap-x-4 border-1 border-gray-200 rounded-md p-1">
                                {alert.words.map((word, widx) => {
                                    return (
                                        <p key={widx} className="text-orange-600 font-semibold m-0">{word}</p>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function MoodAlert( { week, days } : { week: ChatWeek, days: Date[] } ) {
    return (
        <div className={`${blockStyle}`}>
            <h2 className={`caregiver-text mb-0`}>Mood Change</h2>
            <p className="text-lg mt-[1rem]">{useAuth().profile.plwd.first_name} was in a bad mood on {days.toString()}. You might want to talk to her.</p>
            <WeeklyMoods week={week} />
        </div>
    )
}