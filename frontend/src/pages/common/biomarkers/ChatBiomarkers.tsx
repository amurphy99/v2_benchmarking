import { OverlayTrigger, Popover } from "react-bootstrap";
import { FaCircle } from "react-icons/fa";
import { HiMinus, HiOutlineArrowUp, HiOutlineArrowDown } from "react-icons/hi";

import { BiomarkerType } from "@/api";
import { biomarkerKeys, biomarkerColors } from "@/utils/styling/options";

import AnomiaCard from "./individual/AnomiaCard";

import { FaChevronUp, FaChevronDown, FaMinus } from "react-icons/fa6";


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
            <AnomiaCard biomarker={score_type} />
        </Popover>
    );

    // Style
    const bioColor    = biomarkerColors[score_type]
    const hoverStyle  = "hover:border-gray-200 hover:shadow";
    const scoreBorder = "border rounded-pill border-white bg-white"
    const scoreStyle  = `flex justify-center items-center m-[0.25rem] px-[0.25rem] py-[0.25rem] fs-[5rem] ${scoreBorder} ${hoverStyle}`;

    return (
    <OverlayTrigger overlay={popover} trigger={["hover", "click"]} delay={{show: 100, hide: 200}}> 
        <div className={scoreStyle}>
            {/* <FaCircle size={20} color={bioColor} className="mr-[0.5rem]"/> */}
            <div className="border rounded-circle bg-gray-100 mr-[1.0rem] p-[0.25rem]">
                {ScoreChangeHelper(score, prev, bioColor)}
            </div>
            
            <div className="flex flex-col mr-auto font-monospace fw-semibold">
                <span> {score_type} </span>
                <span style={{color: bioColor}}> {(score ?? 0).toFixed(4)} </span>
            </div>


        </div>
    </OverlayTrigger>
    );    
}

function ScoreChangeHelper(score: number, prev: number, bioColor: string) {
    const delta = score - prev;
    const threshold = 0.05; // ignore small changes

    if      (Math.abs(delta) < threshold) {return <FaMinus       size={30} color={bioColor} />; }
    else if (         delta  > 0        ) {return <FaChevronUp   size={30} color={bioColor} />; }
    else                                  {return <FaChevronDown size={30} color={bioColor} />; }
}






// --------------------------------------------------------------------
// Individual Biomarker Element
// --------------------------------------------------------------------
// Maybe add like in green "+ 0.15" or something
function BiomarkerAnalysis0({ score_type, score, prev }: { score_type: string, score: number, prev: number }) {   
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
                {ScoreChangeHelper0(score, prev)}
                <span> {(score ?? 0).toFixed(4)} </span>
            </div>

        </div>
    </OverlayTrigger>
    );    
}

function ScoreChangeHelper0(score: number, prev: number) {
    const delta = score - prev;
    const threshold = 0.05; // ignore small changes

    if      (Math.abs(delta) < threshold) {return <HiMinus            className="text-gray-500" />; }
    else if (         delta  > 0        ) {return <HiOutlineArrowUp   className="text-green-500"   />; }
    else                                  {return <HiOutlineArrowDown className="text-red-500"    />; }
}