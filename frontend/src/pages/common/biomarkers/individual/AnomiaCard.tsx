import { getBiomarkerDefinition, getBiomarkerDescription } from "@/utils/misc/descriptions";

export default function AnomiaCard({biomarker} : {biomarker: string}) {

    return (
    <div className="d-flex flex-col m-[1rem] w-[33vw]">
        <span className="fs-5 fw-semibold"> {biomarker} Score </span>
        <span> {biomarker}, also known as {getBiomarkerDescription(biomarker.toLowerCase())}, is characterized by {getBiomarkerDefinition(biomarker.toLowerCase())} </span>
        
        <div className="d-flex flex-col pt-[1rem] gap-[1rem]">
            <span> <b> Status: </b> Your score decreased slightly from where it was last week. </span>

            <span> <b> Suggestions: </b> To improve, try doing xyz, or playing xyz game. During conversations, make sure to xyz. </span>
        </div>
    
    </div>
    );
}

