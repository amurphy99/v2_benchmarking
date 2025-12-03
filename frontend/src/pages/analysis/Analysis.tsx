import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { getWeeklyMessages, groupSessionsByWeek } from "@/utils/functions/getChatWeeks"
import { useAuth } from "@/context/AuthProvider";

import { TopicsCard } from "../common/TopicsCard";
import { colStyle, widthStyle } from "@/utils/styling/sharedStyles";
import BiomarkerCard from "./components/BiomarkerCard";
import { averageScore, getExemplarDays, getFlaggedDays } from "@/utils/misc/scores";
import MoodCard from "./components/MoodCard";
import GeneralStatusCard from "./components/GeneralStatusCard";
import ImpactFactorsCard from "./components/ImpactFactorsCard";

export function Analysis() {
    const role = useAuth().profile.role.toLowerCase();
    const { data: sessions, isLoading } = useChatSessions();
    if (isLoading) { 
        return <p>Loading...</p>; 
    }
    const weeks = groupSessionsByWeek(sessions);
    const currentWeek = weeks.length ? weeks[weeks.length - 1] : null;
    const prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
    const avg = averageScore(currentWeek.sessions);

    const weeklyMessages = getWeeklyMessages(currentWeek);

    const getPerformance = (score: number) : string => {
        if (score <= 0.30) {
            return "Poor";
        } else if (score <= 0.5) {
            return "Fair";
        } else if (score <= 0.75) {
            return "Good";
        } else {
            return "Excellent";
        }
    }

    return (
        <div className={colStyle}>
            <GeneralStatusCard currentWeek={currentWeek} prevWeek={prevWeek} />
            <TopicsCard messages={weeklyMessages} type="Weekly" role={role} />
            <MoodCard week={currentWeek} />
            <p id="factors" className="h-0 w-0 p-0 m-0"/>
            <h2 className={`flex ${widthStyle} mt-[-2rem]`}>Flagged Signs</h2>
            {Object.entries(avg).map((entry, idx) => {
                if (entry[1] <= 0.5) {
                    const flagged = getFlaggedDays(currentWeek.sessions, entry[0])
                    const exemplar = getExemplarDays(currentWeek.sessions, entry[0])
                    const performance = getPerformance(entry[1]);
                    return (
                        <BiomarkerCard key={idx} biomarker={entry[0]} week={currentWeek} flaggedDays={flagged} exemplarDays={exemplar} performance={performance} />
                    )
                } else {
                    return null;
                }
            })}
            <h2 className={`flex ${widthStyle}`}>Exemplar Signs</h2>
            {Object.entries(avg).map((entry, idx) => {
                if (entry[1] > 0.75) {
                    const flagged = getFlaggedDays(currentWeek.sessions, entry[0])
                    const exemplar = getExemplarDays(currentWeek.sessions, entry[0])
                    const performance = getPerformance(entry[1]);
                    return (
                        <BiomarkerCard key={idx} biomarker={entry[0]} week={currentWeek} flaggedDays={flagged} exemplarDays={exemplar} performance={performance} />
                    )
                } else {
                    return null;
                }
            })}
            {role == "patient" ? null : 
                <>
                    <h2 className={`flex ${widthStyle}`}>Impact Factors</h2>
                    <ImpactFactorsCard />
                </>
            }
        </div>
    )
}