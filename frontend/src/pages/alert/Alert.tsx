import { useChatSessionDetails, useChatSessions } from "@/hooks/queries/useChatSessions";
import { ChatWeek, getCurrentWeek } from "@/utils/functions/getChatWeeks";
import { blockStyle, colStyle } from "@/utils/styling/sharedStyles";
import WeeklyMoods from "@/components/graphics/WeeklyMoods";
import { getMoodAlert, getWordAlert, WordAlert } from "@/utils/functions/getAlerts";
import { useAuth } from "@/context/AuthProvider";
import { dateFormatOptionsMed, dateFormatOptionsShort } from "@/utils/styling/numFormatting";
import { useUserSettings } from "@/hooks/queries/useUserSettings";
import { useProfile } from "@/hooks/queries/useProfile";

export function Alert() {
    const { data: sessions, isLoading } = useChatSessions();

    // This week's chats in full, for the flagged-word check (a list carries only summaries)
    const week = getCurrentWeek(sessions);
    const { data: weekChats, isLoading: loadingWeek } = useChatSessionDetails(week.sessions.map((session) => session.id));

    if (isLoading || loadingWeek) { 
        return <p>Loading...</p>; 
    }

    const moodAlertDays = getMoodAlert(week.sessions);
    const wordAlerts = getWordAlert(weekChats);

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
    const { data: profile, isLoading: profileLoading } = useProfile();
    if (profileLoading) {
        return null;
    }
    return (
        <div className={blockStyle}>
            <h2 className={`caregiver-text mb-0`}>Flagged Words</h2>
            <p className="text-lg mt-[1rem]">{profile.account.user.first_name} mentioned several flagged words this week.</p>
            <div className="flex flex-col gap-2">
                {wordAlerts.map( (alert, idx) => {
                    return(
                        <div className="grid grid-cols-4 items-start justify-between" key={idx}>
                            <li className="text-xl self-center font-semibold underline text-violet-600 m-0 list-inside">
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
    const { data: profile, isLoading: profileLoading } = useProfile();
    if (profileLoading) {
        return null;
    }
    return (
        <div className={`${blockStyle}`}>
            <h2 className={`caregiver-text mb-0`}>Mood Change</h2>
            <p className="text-lg mt-[1rem]">{profile.account.user.first_name} was in a bad mood on {stringifyDays(days)}. 
                You might want to talk with them.</p>
            <WeeklyMoods week={week} />
        </div>
    )
}

function stringifyDays(days: Date[]): string {
    return days.map(day => day.toLocaleDateString("en-US", dateFormatOptionsMed)).join(", ");
}