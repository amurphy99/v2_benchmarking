import { BiomarkerType } from "@/api";
import { ChatWeek } from "@/utils/functions/getChatWeeks";
import { useState } from "react";
import { IoIosArrowDown, IoIosArrowForward } from "react-icons/io";
import BiomarkerGraph from "./BiomarkerGraph";

export default function DetailGraph( {biomarker, week} : {biomarker: BiomarkerType, week: ChatWeek} ) {
    const [show, setShow] = useState<boolean>(false);

    const buttonStyle = `${show ? "" : "rounded-b-sm"} px-[1rem] py-[0.5rem] bg-violet-600 text-white border-1 border-solid border-gray-300 
            rounded-t-sm hover:bg-violet-700 hover:shadow-md items-center`
    const overlayStyle = `${show ? "block" : "hidden"} rounded-b-sm border-x-1 border-solid border-gray-300 border-b-1 p-2`
    return (
        <div className="flex flex-col">
            <button onClick={() => setShow(!show)} className={buttonStyle}>
                <span className="flex flex-row justify-between items-center">
                    <h4>Check Data Detail</h4>
                    {show ? <IoIosArrowDown size={"1.5rem"} /> : <IoIosArrowForward size={"1.5rem"} />}
                </span>
            </button>
            <div className={`${overlayStyle} overflow-x-scroll overflow-y-hide hidden-scrollbar`}>
                <BiomarkerGraph biomarker={biomarker} sessions={week.sessions} />
            </div>
        </div>
    )
}