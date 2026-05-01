import { FaCircle } from "react-icons/fa";
import { HiMinus, HiOutlineArrowUp, HiOutlineArrowDown } from "react-icons/hi";

import { ChatSession, BiomarkerType } from "@/api";
import { biomarkerKeys, biomarkerColors } from "@/utils/styling/options";
import { h3 } from "@/utils/styling/sharedStyles";


// ====================================================================
// Chat Average Biomarker Scores
// ====================================================================
// Maybe have a "detailed" and "short" version so one could be used on the chat history page?
export default function ChatBiomarkers({ chatSession, prevScores } : { chatSession: ChatSession, prevScores: Record<BiomarkerType, number> }) {
    const averages = chatSession.average_scores;
    return (
    <div className="flex flex-col border rounded p-[1rem] h-100">
        <span className={h3}> Chat Biomarker Scores: </span>

        <div className="flex flex-col mt-[1rem] gap-[0.5rem]">
            {biomarkerKeys.map((key) => (
                <BiomarkerAnalysis key={key} 
                    score_type = {key} 
                    score      = {averages  [key.toLowerCase()]} 
                    prev       = {prevScores[key.toLowerCase()]}
                />
            ))}
        </div>
    </div>
    );
}


// --------------------------------------------------------------------
// Individual Biomarker Element
// --------------------------------------------------------------------
// Maybe add like in green "+ 0.15" or something
function BiomarkerAnalysis({ score_type, score, prev }: { score_type: string, score: number, prev: number }) {   
    const bioColor = biomarkerColors[score_type]

    return (
    <div className="flex justify-center items-center border rounded p-[0.5rem] fs-5">
        <FaCircle size={20} color={bioColor} className="mr-[0.75rem]"/>
        <span> {score_type} </span>

        <div className="flex items-center gap-[1rem] ml-auto mr-[1rem] font-monospace"> 
            <span className="fw-light text-gray-400"> {(prev  ?? 0).toFixed(4)} </span>
            {ScoreChangeHelper(score, prev)}
            <span>                                    {(score ?? 0).toFixed(4)} </span>
        </div>

    </div>
    );    
}

function ScoreChangeHelper(score: number, prev: number) {
    const delta = score - prev;
    const threshold = 0.05; // ignore small changes

    if      (Math.abs(delta) < threshold) {return <HiMinus            className="text-secondary" />; }
    else if (         delta  > 0        ) {return <HiOutlineArrowUp   className="text-success"   />; }
    else                                  {return <HiOutlineArrowDown className="text-danger"    />; }
}
