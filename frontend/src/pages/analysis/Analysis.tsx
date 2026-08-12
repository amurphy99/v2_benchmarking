import { useChatSessionSummaries } from "@/hooks/queries/useChatSessions";
import { ChatWeek, getTopics, groupSessionsByWeek } from "@/utils/functions/getChatWeeks"
import { useAuth } from "@/context/AuthProvider";

import { TopicsCard } from "../common/TopicsCard";
import { colStyle, widthStyle } from "@/utils/styling/sharedStyles";
import BiomarkerCard from "./components/BiomarkerCard";
import { averageScore, getExemplarBiomarkers, getExemplarDays, getFlaggedBiomarkers, getFlaggedDays, getPerformance, sortScores } from "@/utils/misc/scores";
import MoodCard from "./components/MoodCard";
import GeneralStatusCard from "./components/GeneralStatusCard";
import ImpactFactorsCard from "./components/ImpactFactorsCard";
import { NavLink } from "react-router-dom";

export function Analysis() {
    const role = useAuth().account.role == "patient" ? "patient" : "caregiver";
    const { data: sessions, isLoading } = useChatSessionSummaries();
    if (isLoading) { 
        return <p>Loading...</p>; 
    }
    if (sessions.length == 0) {
        return (
            <h1 className="m-[2rem]">Nothing to analyze yet!</h1>
        )
    }

    const weeks = groupSessionsByWeek(sessions);
    const currentWeek = weeks[weeks.length - 1];
    const prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : {} as ChatWeek;
    const avg = averageScore(currentWeek.sessions);
    const sorted = sortScores(avg);
    const flaggedBiomarkers = getFlaggedBiomarkers(avg);
    const exemplarBiomarkers = getExemplarBiomarkers(avg);

    return (
        <div className={colStyle}>
            
            {window.isMobile ? 
                <>
                    <div className="flex flex-row gap-4 w-full mb-4">
                        <GeneralStatusCard currentWeek={currentWeek} prevWeek={prevWeek} />
                    </div>
                    <TopicsCard topics={getTopics(currentWeek.sessions)} type="Weekly" role={role} />
                </> : 
                <div className={`grid grid-cols-2 gap-4 w-full`}>
                    <GeneralStatusCard currentWeek={currentWeek} prevWeek={prevWeek} />
                    <TopicsCard topics={getTopics(currentWeek.sessions)} type="Weekly" role={role} />
                </div>
            }
            <MoodCard week={currentWeek} />
            <p id="factors" className="h-0 w-0 p-0 m-0"/>
            <h2 className={`flex w-full mt-[-2rem]`}>Flagged Signs</h2>
            <BiomarkerCard biomarker={sorted[5][0]} week={currentWeek} flaggedDays={getFlaggedDays(currentWeek.sessions, sorted[5][0])} 
                exemplarDays={getExemplarDays(currentWeek.sessions, sorted[5][0])} performance={getPerformance(sorted[5][1])} />
            <BiomarkerCard biomarker={sorted[4][0]} week={currentWeek} flaggedDays={getFlaggedDays(currentWeek.sessions, sorted[4][0])}
                exemplarDays={getExemplarDays(currentWeek.sessions, sorted[4][0])} performance={getPerformance(sorted[4][1])} />
            {flaggedBiomarkers.length > 2 ? 
            <NavLink to="/analysis/flagged">            
                <button className={`${role}-button btn-basic`}>View All</button>
            </NavLink> : null}
            <h2 className={`flex w-full`}>Exemplar Signs</h2>
            {exemplarBiomarkers.map((biomarker, idx) => {
                const flagged = getFlaggedDays(currentWeek.sessions, biomarker)
                const exemplar = getExemplarDays(currentWeek.sessions, biomarker)
                const performance = getPerformance(avg[biomarker]);
                return (
                    <BiomarkerCard key={idx} biomarker={biomarker} week={currentWeek} flaggedDays={flagged} exemplarDays={exemplar} performance={performance} />
                )
            })}
            {exemplarBiomarkers.length == 0 ? <p className={`w-full text-center text-xl`}>
                No exemplar signs this week. Try to keep a lookout for patterns in the flagged signs!
            </p> : null}
            {role == "patient" ? null : 
                <>
                    <h2 className={`flex w-full`}>Impact Factors</h2>
                    <ImpactFactorsCard />
                </>
            }
        </div>
    )
}