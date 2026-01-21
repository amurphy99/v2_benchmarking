import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { getMessages, groupSessionsByWeek } from "@/utils/functions/getChatWeeks"
import { useAuth } from "@/context/AuthProvider";

import { TopicsCard } from "../common/TopicsCard";
import { colStyle, widthStyle } from "@/utils/styling/sharedStyles";
import BiomarkerCard from "./components/BiomarkerCard";
import { averageScore, getExemplarDays, getFlaggedDays } from "@/utils/misc/scores";
import MoodCard from "./components/MoodCard";
import GeneralStatusCard from "./components/GeneralStatusCard";
import ImpactFactorsCard from "./components/ImpactFactorsCard";

export function Analysis() {
    const { role } = useAuth();
    const { data: sessions, isLoading } = useChatSessions();
    if (isLoading) { 
        return <p>Loading...</p>; 
    }
    if (sessions.length == 0) {
        return (
            <h1 className="m-[2rem]">Nothing to analyze yet!</h1>
        )
    }
    const weeks = groupSessionsByWeek(sessions);
    const currentWeek = weeks.length ? weeks[weeks.length - 1] : null;
    const prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
    const avg = averageScore(currentWeek.sessions);

    const weeklyMessages = getMessages(currentWeek.sessions);

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
            <div className={`flex flex-col gap-[2rem] md:flex-row md:gap-[1rem]`}>
                <GeneralStatusCard currentWeek={currentWeek} prevWeek={prevWeek} />
                <TopicsCard messages={weeklyMessages} type="Weekly" role={role} />
            </div>
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