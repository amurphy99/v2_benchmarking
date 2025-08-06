import { OverlayTrigger, Popover } from "react-bootstrap";
import { FaCircle } from "react-icons/fa";
import { HiMinus, HiOutlineArrowUp, HiOutlineArrowDown } from "react-icons/hi";

import { BiomarkerType } from "@/api";
import { biomarkerKeys, biomarkerColors } from "@/utils/styling/options";

import AnomiaCard from "./individual/AnomiaCard";


// ====================================================================
// Chat Average Biomarker Scores
// ====================================================================
// Maybe have a "detailed" and "short" version so one could be used on the chat history page?
export default function ChatBiomarkers({ avgScores, prevScores } : { avgScores:  Record<BiomarkerType, number>, prevScores: Record<BiomarkerType, number> }) {
    return (
    <div className="grid md:grid-cols-2 grid-cols-1">
        {biomarkerKeys.map((key) => (
            <BiomarkerAnalysis key={key} 
                score_type = {key} 
                score      = { avgScores[key.toLowerCase()]} 
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
    // Popover
    const popover = (
        <Popover id="anomia-popover" style={{ maxWidth: "none", width: "max-content" }}> 
            <AnomiaCard/>
        </Popover>
    );

    // Style
    const bioColor   = biomarkerColors[score_type]
    const hoverStyle = "hover:rounded hover:shadow";
    const scoreStyle = `flex justify-center items-center px-[0.5rem] py-[0.5rem] fs-[5rem] ${hoverStyle}`;

    return (
    <OverlayTrigger overlay={popover} trigger={["hover", "click"]} delay={{show: 100, hide: 200}}> 
        <div className={scoreStyle}>
            <FaCircle size={20} color={bioColor} className="mr-[0.5rem]"/>
            <span> {score_type} </span>

            <div className="flex items-center gap-[0.5rem] ml-auto mr-[0.25rem] font-monospace"> 
                {ScoreChangeHelper(score, prev)}
                <span> {(score ?? 0).toFixed(4)} </span>
            </div>

        </div>
    </OverlayTrigger>
    );    
}

function ScoreChangeHelper(score: number, prev: number) {
    const delta = score - prev;
    const threshold = 0.05; // ignore small changes

    if      (Math.abs(delta) < threshold) {return <HiMinus            className="text-gray-500" />; }
    else if (         delta  > 0        ) {return <HiOutlineArrowUp   className="text-green-500"   />; }
    else                                  {return <HiOutlineArrowDown className="text-red-500"    />; }
}
