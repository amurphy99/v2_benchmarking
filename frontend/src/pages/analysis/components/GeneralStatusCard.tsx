import { ChatWeek } from "@/utils/functions/getChatWeeks";
import { blockStyle } from "@/utils/styling/sharedStyles";
import CircularProgress from "./CircularProgress";
import { TbArrowBigDown, TbArrowBigUp } from "react-icons/tb";
import { useAuth } from "@/context/AuthProvider";
import { getCognitiveScore } from "@/utils/functions/getCognitiveScore";

export default function GeneralStatusCard( {currentWeek, prevWeek} : {currentWeek: ChatWeek, prevWeek: ChatWeek} ) {
    const role = useAuth().profile.role.toLowerCase();

    const curScore = getCognitiveScore(currentWeek);
    const prevScore = getCognitiveScore(prevWeek);
    const scoreDiff = prevScore ? curScore - prevScore : 0;
    
    return (
         <div className={blockStyle}>
            <h2 className={`${role}-text`}>General Cognitive Status</h2>
            <p className="text-lg text-gray-600 mb-[0rem]">An average score calculated by adding up all signs.</p>
            <div className="grid grid-cols-2 mx-[-1rem] gap-2">
                <div className="flex flex-col max-w-[40vw]">
                    <div className="aspect-square min-w-[10rem]">
                        <CircularProgress score={curScore} role={role} />
                    </div>
                    {prevWeek ? 
                    <span className="p-2 mt-[-10vw] lg:mt-[-5vw] gap-2 border-2 border-solid border-gray-300 rounded-full flex flex-row justify-center items-center">
                        <p className="mb-0 text-center">From last week:</p>
                        {scoreDiff >= 0 ? 
                            <TbArrowBigUp color={"green"} size={"2rem"} /> : 
                            <TbArrowBigDown color={"red"} size={"2rem"} />} 
                        {scoreDiff}
                    </span> : null}
                    
                </div>
                <div className="flex flex-col justify-center gap-2 text-lg w-full">
                    <b>Fairly Good</b>
                    <p>2 signs flagged</p>
                    <p>1 factor impact</p>
                    <button 
                        className={`${role}-button p-2 w-[90%] text-lg rounded-md`}
                        onClick={() => document.getElementById('factors')?.scrollIntoView()}
                    >
                            Check Details
                    </button>
                </div>
            </div>
        </div>
    )
}