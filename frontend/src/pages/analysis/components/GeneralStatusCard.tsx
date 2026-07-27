import { ChatWeek } from "@/utils/functions/getChatWeeks";
import { blockStyle } from "@/utils/styling/sharedStyles";
import CircularProgress from "./CircularProgress";
import { TbArrowBigDown, TbArrowBigUp } from "react-icons/tb";
import { useAuth } from "@/context/AuthProvider";
import { getCognitiveScore } from "@/utils/functions/getCognitiveScore";

export default function GeneralStatusCard( {currentWeek, prevWeek} : {currentWeek: ChatWeek, prevWeek: ChatWeek} ) {
    const role = useAuth().account.role;

    const curScore = getCognitiveScore(currentWeek.sessions);
    const prevScore = prevWeek.start ? getCognitiveScore(prevWeek.sessions) : 0;
    const scoreDiff = prevScore ? curScore - prevScore : 0;
    
    return (
        <div className={`${blockStyle} flex flex-col`}>
            <h2 className={`${role}-text`}>General Cognitive Status</h2>
            <p className="text-lg italic text-gray-600 mb-[0rem]">An average score calculated by adding up all signs.</p>
            <div className="flex flex-row h-full w-full mb-2">
                <div className="w-1/2 flex self-center">
                    <div className="flex mt-4 grid grid-cols-2 gap-2 text-lg w-full justify-center items-center">
                        <b className="text-xl col-span-full text-center">Fairly Good</b>
                        <p className="mb-0 text-center">2 signs</p>
                        <p className={`${role}-highlight mb-0 text-center p-2 rounded-full`}>Flagged</p>
                        <p className="mb-0 text-center">1 sign</p>
                        <p className={`${role}-highlight mb-0 text-center p-2 rounded-full`}>Impact</p>
                    </div>
                </div>
                
                <div className="flex flex-col w-1/2 h-full min-h-[10rem]">
                    <div className={`w-full h-full min-h-[10rem]`}>
                        <CircularProgress score={curScore} role={role} />
                    </div>
                    {prevWeek.start ? 
                        <span className="p-1 mx-2 gap-2 border-2 border-solid border-gray-300 rounded-full flex flex-row justify-center items-center">
                            <p className="mb-0 text-center">Compared to last week:</p>
                            {scoreDiff >= 0 ? 
                                <TbArrowBigUp color={"green"} size={"1.25em"} /> : 
                                <TbArrowBigDown color={"red"} size={"1.25rem"} />} 
                            {scoreDiff}
                        </span> : null}
                </div>
            </div>
            
            <button 
                className={`${role}-button flex self-center justify-center mt-auto p-2 w-[60%] text-lg rounded-md`}
                onClick={() => document.getElementById('factors')?.scrollIntoView()}
            >
                    Check Details
            </button>
        </div>
    )
}