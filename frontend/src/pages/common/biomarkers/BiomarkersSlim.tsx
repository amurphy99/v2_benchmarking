import { HiMinus } from "react-icons/hi";
import { TbArrowBigUpFilled, TbArrowBigDownFilled } from "react-icons/tb";

import { ChatSession, BiomarkerType     } from "@/api";
import { biomarkerKeys, biomarkerColors } from "@/utils/styling/options";


// ====================================================================
// Chat Average Biomarker Scores
// ====================================================================
// Maybe have a "detailed" and "short" version so one could be used on the chat history page?
export default function ChatBiomarkers({ chatSession, prevScores } : { chatSession: ChatSession, prevScores: Record<BiomarkerType, number> }) {
    const averages = chatSession.average_scores;
    return (
    <div className="flex gap-2">
        {biomarkerKeys.map((key) => (
            <BiomarkerAnalysis key={key} 
                score_type = {key} 
                score      = {averages  [key.toLowerCase()]} 
                prev       = {prevScores[key.toLowerCase()]}
            />
        ))}
    </div>
    );
}


// --------------------------------------------------------------------
// Individual Biomarker Element
// --------------------------------------------------------------------
// Maybe add like in green "+ 0.15" or something
function BiomarkerAnalysis({ score_type, score, prev }: { score_type: string, score: number, prev: number }) {   
    const bioColor = biomarkerColors[score_type]

    const hoverStyle = "hover:rounded hover:shadow";
    
    // {background: bioColor} {border: `2px solid ${bioColor}`}
    return (
        <div style={{borderBottom: `4px solid ${bioColor}`}} 
             className="d-inline-flex p-[0.25rem] align-items-center justify-content-center ">
            {ScoreChangeHelper(score, prev)}
        </div>
    );    
}

function ScoreChangeHelper(score: number, prev: number) {
    const delta = score - prev;
    const threshold = 0.05; // ignore small changes

    if      (Math.abs(delta) < threshold) { return <HiMinus              size={20} className="text-gray-500"  />; }
    else if (         delta  > 0        ) { return <TbArrowBigUpFilled   size={20} className="text-green-500" />; }
    else                                  { return <TbArrowBigDownFilled size={20} className="text-red-500"   />; }
}
