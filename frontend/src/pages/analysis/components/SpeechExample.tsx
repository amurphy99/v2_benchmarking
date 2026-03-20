import { getBiomarkerDescription, getBiomarkerExemplar, getBiomarkerFlagged, getBiomarkerName } from "@/utils/misc/descriptions";
import { HiMiniSpeakerWave } from "react-icons/hi2";
import { IoFlag, IoShieldCheckmarkOutline } from "react-icons/io5";
import ChatExample from "./ChatExample";

export default function SpeechExample( {biomarker, example, setExample, role} : 
    {biomarker: string, example: string, setExample(type: string): void, role: string} ) {
    return (
        <>
            <h3 className={`${role}-text`}>Example</h3>
            <p>An example of good (exemplar) and bad (flagged) {getBiomarkerDescription(biomarker).toLowerCase()} ({getBiomarkerName(biomarker)}).</p>
            <span className="flex flex-row justify-between">
                <div className="flex flex-row gap-0">
                    <button className={`${role}-button${example == "exemplar" ? "" : "-outline"} p-2 rounded-l-md flex flex-row items-center`} 
                        onClick={() => setExample("exemplar")}> <IoShieldCheckmarkOutline size={"2rem"} /> Exemplar</button>
                    <button className={`${role}-button${example == "flagged" ? "" : "-outline"} p-2 rounded-r-md flex flex-row items-center`} 
                        onClick={() => setExample("flagged")}> <IoFlag size={"2rem"} /> Flagged</button>
                </div>
                <button className={`${role}-button-outline rounded-md p-2`}><HiMiniSpeakerWave size={"2rem"} /></button>
            </span>
            <div className="text-lg my-[1rem]">
                <ChatExample messages={example == "exemplar" ? getBiomarkerExemplar(biomarker) : getBiomarkerFlagged(biomarker)} />
            </div>
        </>
    )
}