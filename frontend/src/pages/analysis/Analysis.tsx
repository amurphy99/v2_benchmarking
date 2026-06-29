import { useChatSessions } from "@/hooks/queries/useChatSessions";
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
    const { data: sessions, isLoading } = useChatSessions();
    if (isLoading           ) { return <p>Loading...</p>; }
    if (sessions.length == 0) { return <h1 className="m-[2rem]">Nothing to analyze yet!</h1> }

    const weeks = groupSessionsByWeek(sessions);
    const currentWeek = weeks[weeks.length - 1];
    const prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : {} as ChatWeek;

    const avg = averageScore(currentWeek.sessions);
    const sorted = sortScores(avg);

    // Extract up to 2 items safely from the end or start of the sorted scores depending on your sorting logic
    // Use slice to avoid throwing errors if there are fewer items than expected
    const displayedFlagged = sorted.slice(-2); 

    const flaggedBiomarkers  = getFlaggedBiomarkers (avg);
    const exemplarBiomarkers = getExemplarBiomarkers(avg);

    return (
        <div className={colStyle}>
            <div className={`flex flex-col w-full gap-[2rem] md:flex-row md:gap-[1rem]`}>
                <GeneralStatusCard currentWeek={currentWeek} prevWeek={prevWeek} />
                <TopicsCard topics={getTopics(currentWeek.sessions)} type="Weekly" role={role} />
            </div>
            <MoodCard week={currentWeek} />
            <p id="factors" className="h-0 w-0 p-0 m-0"/>

            {/* -------------------------------------------------------------------------------- */}
            {/* Flagged Signs */}
            {/* -------------------------------------------------------------------------------- */}
            <h2 className={`flex ${widthStyle} mt-[-2rem]`}>Flagged Signs</h2>

                {/* Only render the elements that exist in the sorted array */}
                {displayedFlagged.map(([biomarker, score], idx) => (
                    <BiomarkerCard 
                    key          = {biomarker || idx}
                    biomarker    = {biomarker} 
                    week         = {currentWeek} 
                    flaggedDays  = {getFlaggedDays (currentWeek.sessions, biomarker)} 
                    exemplarDays = {getExemplarDays(currentWeek.sessions, biomarker)} 
                    performance  = {getPerformance(score)} 
                    /> 
                ))}


            {flaggedBiomarkers.length > 2 ? (
            <NavLink to="/analysis/flagged"> 
                <button className={`${role}-button btn-basic`}>View All</button> 
            </NavLink> 
            ) : null} 

            {/* -------------------------------------------------------------------------------- */}
            {/* Exemplar Signs */}
            {/* -------------------------------------------------------------------------------- */}
            <h2 className={`flex ${widthStyle}`}>Exemplar Signs</h2>
            {exemplarBiomarkers.map((biomarker, idx) => {
                const flagged = getFlaggedDays(currentWeek.sessions, biomarker)
                const exemplar = getExemplarDays(currentWeek.sessions, biomarker)
                const performance = getPerformance(avg[biomarker]);
                return (
                    <BiomarkerCard key={idx} biomarker={biomarker} week={currentWeek} flaggedDays={flagged} exemplarDays={exemplar} performance={performance} />
                )
            })}
            {exemplarBiomarkers.length == 0 ? <p className={`${widthStyle} text-center text-xl`}>
                No exemplar signs this week. Try to keep a lookout for patterns in the flagged signs!
            </p> : null}
            {role == "patient" ? null : 
                <>
                    <h2 className={`flex ${widthStyle}`}>Impact Factors</h2>
                    <ImpactFactorsCard />
                </>
            }
        </div>
    )
}