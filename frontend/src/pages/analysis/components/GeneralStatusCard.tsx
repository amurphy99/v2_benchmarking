import { ChatWeek } from "@/utils/functions/getChatWeeks";
import { blockStyle } from "@/utils/styling/sharedStyles";
import CircularProgress from "./CircularProgress";
import { TbArrowBigDown, TbArrowBigUp } from "react-icons/tb";
import { useAuth } from "@/context/AuthProvider";
import { getCognitiveScore } from "@/utils/functions/getCognitiveScore";

export default function GeneralStatusCard( {currentWeek, prevWeek} : {currentWeek: ChatWeek, prevWeek: ChatWeek} ) {
    const role = useAuth().account.role;

    const curScore = getCognitiveScore(currentWeek);
    const prevScore = prevWeek.start ? getCognitiveScore(prevWeek) : 0;
    const scoreDiff = prevScore ? curScore - prevScore : 0;
    
    return (
         <div className={blockStyle}>
            <h2 className={`${role}-text`}>General Cognitive Status</h2>
            <p className="text-lg text-gray-600 mb-[0rem]">An average score calculated by adding up all signs.</p>
            <div className="grid grid-cols-2 p-[-1rem] gap-2">
                <div className="min-h-[150px] max-h-[300px]">
                    <CircularProgress score={curScore} role={role} />
                </div>                    
                <div className="flex flex-col justify-center gap-2 text-lg w-full">
                    <b className="mb-0">Fairly Good</b>
                    <p className="mb-0">2 signs flagged</p>
                    <p className="mb-0">1 factor impact</p>
                </div>
                 {prevWeek.start ? 
                    <span className="p-2 mx-2 gap-2 border-2 border-solid border-gray-300 rounded-full flex flex-row justify-center items-center">
                        <p className="mb-0 text-center">From last week:</p>
                        {scoreDiff >= 0 ? 
                            <TbArrowBigUp color={"green"} size={"2rem"} /> : 
                            <TbArrowBigDown color={"red"} size={"2rem"} />} 
                        {scoreDiff}
                    </span> : null}
                <button 
                        className={`${role}-button p-2 w-[90%] text-lg rounded-md`}
                        onClick={() => document.getElementById('factors')?.scrollIntoView()}
                    >
                            Check Details
                </button>
            </div>
        </div>
    )
}