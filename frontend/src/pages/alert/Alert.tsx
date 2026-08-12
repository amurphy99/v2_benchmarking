import { blockStyle, colStyle } from "@/utils/styling/sharedStyles";
import { dateFormatOptionsMed, dateFormatOptionsShort } from "@/utils/styling/numFormatting";
import { useProfile } from "@/hooks/queries/useProfile";
import { useSessionAlerts } from "@/hooks/queries/useAlerts";
import { ChatSession } from "@/api";
import { Fragment } from "react/jsx-runtime";
import RiskGauge from "./components/RiskGauge";

export function Alert() {
    const { data: sessions, isLoading } = useSessionAlerts();
    if (isLoading) { 
        return <p>Loading...</p>; 
    }

    // const week = getCurrentWeek(sessions);

    // const moodAlertDays = getMoodAlert(week.sessions);
    // const wordAlerts = getWordAlert(week.sessions);

    return (
        <div className={colStyle}>
            {sessions.length > 0 ? 
                sessions.map((session, idx) => {
                    return (
                        <Fragment key={idx}>
                            <LLMAlert session={session} />
                        </Fragment>
                    )
                }) : 
                <div className="text-2xl text-gray-500 font-bold">No alerts this week. Great!</div>
            }
        </div>
    )
}

function LLMAlert( { session } : { session: ChatSession} ) {
    const { data: profile, isLoading: profileLoading } = useProfile();
    if (profileLoading) {
        return null;
    }
    return (
        <div className={blockStyle}> 
            <h2 className="font-semibold">{new Date(session.date).toLocaleDateString("en-US", dateFormatOptionsShort)}</h2>
            <p className="text-xl">{session.risk_reason}</p>
            <div className="grid grid-cols-2 gap-4 mt-[1rem] items-center justify-items-center w-full">
                <div className="flex w-full h-full min-h-[200px]">
                    <RiskGauge riskLevel={session.risk_level}/>
                </div>
                <ul className="flex flex-col gap-1 w-full list-disc">
                    {session.risk_quotes?.map((quote, idx) => {
                        return (
                            <li key={idx} className="m-0 text-lg">{quote}</li>
                        )
                    })}
                </ul>
            </div>
        </div>
    )
}

function stringifyDays(days: Date[]): string {
    return days.map(day => day.toLocaleDateString("en-US", dateFormatOptionsMed)).join(", ");
}