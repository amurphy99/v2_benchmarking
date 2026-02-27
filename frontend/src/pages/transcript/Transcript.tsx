import { ChatSession } from "@/api";
import { useLocation, useNavigate } from "react-router-dom";
import ChatTranscript from "../chatDetails/components/ChatTranscript";
import { blockStyle, colStyle, smallShadow, widthStyle } from "@/utils/styling/sharedStyles";
import { useState } from "react";
import { useAuth } from "@/context/AuthProvider";
import { getBiomarkerDefinition, getBiomarkerDescription, getBiomarkerName } from "@/utils/misc/descriptions";
import { GiArchiveResearch } from "react-icons/gi";
import { dateFormatOptions } from "@/utils/styling/numFormatting";
import { Icon } from "@iconify/react/dist/iconify.js";
import getMoodIcon from "@/utils/functions/getMoodIcon";
import { BsPlayCircle } from "react-icons/bs";

export function Transcript() {
    const role = useAuth().account.role;
    const { state } = useLocation() as { state: { chatSession: ChatSession, albumDisplay?: string } };
    const [biomarker, setBiomarker] = useState<string>("");
    const navigate = useNavigate();
    const toDaySummary = () => {navigate("/day", {state: {chatSession: state.chatSession, albumDisplay: state.albumDisplay}})}

    function BiomarkerSummary({biomarker} : {biomarker: string}) {
        const summaryStyle = "flex flex-col gap-2 p-[1rem] rounded-lg"
        if (biomarker == "") {
            return (
                <div className={`${summaryStyle} bg-gray-200 items-center border-1 border-gray-400`}>
                    <GiArchiveResearch size={"10rem"} />
                    <b className="text-lg">Select a sign to define</b>
                    <i className="text-lg text-gray-500">Nothing is selected</i>
                </div>
            )
        }
        return (
            <div className={summaryStyle}>
                <h2 className={`${role}-text mb-0`}>{getBiomarkerDescription(biomarker)}</h2>
                <h5 className={`text-gray-400 font-normal text-lg mb-0`}>({getBiomarkerName(biomarker)})</h5>
                <p>{getBiomarkerDefinition(biomarker)}</p>
            </div>
        )
    }

    if (window.isMobile){    
        return (
        <div className="pt-[1rem]">
            <div className="pl-[1rem] pb-[1rem] font-bold text-2xl justify-between hover:cursor-pointer" onClick={() => {toDaySummary()}}>
                ← Transcript
            </div>
            <div className={colStyle}>
                <select 
                    onChange={(e) => setBiomarker(e.target.value)} 
                    className={`${widthStyle} p-2 border-1 border-solid text-gray-400 font-bold border-gray-400 bg-white rounded-lg mt-[1rem] text-center text-xl hover:cursor-pointer`}
                    defaultValue="select"
                >
                    <option value="select" disabled>Choose a Sign To Analyze</option>
                    <option value="alteredgrammar">Altered Grammar</option>
                    <option value="anomia">Anomia</option>
                    <option value="pragmatic">Pragmatic</option>
                    <option value="pronunciation">Pronunciation</option>
                    <option value="prosody">Prosody</option>
                    <option value="turntaking">Turn Taking</option>
                    <option value="perplexity">Perplexity Difference</option>
                </select>
                <button className={`p-2 w-full rounded-full flex flex-row items-center bg-white ${smallShadow}`}>
                    <div className={`${role}-text px-[1rem]`}>
                        <BsPlayCircle size={"3rem"} />
                    </div>
                    <h3 className={`${role}-text mx-auto`}>Play Audio</h3>
                </button>
                <div className={blockStyle}>
                    <ChatTranscript chatSession={state.chatSession} />
                </div>
            </div>
            
        </div>
    )
    } else {
        return (
            <div className="pt-[1rem] pb-[15vh]">
            <div className="pl-[1rem] pb-[1rem] font-bold text-2xl justify-between hover:cursor-pointer w-fit px-[2rem]" onClick={() => {toDaySummary()}}>
                ← Transcript
            </div>
            <div className="px-[2rem] grid grid-cols-4 gap-[2rem]">
                <div className="flex flex-col">
                    <select 
                    onChange={(e) => setBiomarker(e.target.value)} 
                    className={`${widthStyle} p-2 border-1 border-solid border-gray-400 rounded-lg text-center text-xl hover:cursor-pointer mb-[1rem]`}
                    defaultValue="select"
                    >
                        <option value="select" disabled>Choose a Sign To Analyze</option>
                        <option value="alteredgrammar">Altered Grammar</option>
                        <option value="anomia">Anomia</option>
                        <option value="pragmatic">Pragmatic</option>
                        <option value="pronunciation">Pronunciation</option>
                        <option value="prosody">Prosody</option>
                        <option value="turntaking">Turn Taking</option>
                        <option value="perplexity">Perplexity Difference</option>
                    </select>
                    <BiomarkerSummary biomarker={biomarker} />
                    <h2 className="mt-[1rem]">Overview</h2>
                    <p>{new Date(state.chatSession.date).toLocaleDateString("en-US", dateFormatOptions)}</p>
                    <div>
                        <div className={`${smallShadow} flex flex-col justify-center items-center py-[1rem] px-[3rem] rounded-lg mb-[1rem]`}>
                            <h2 className={`${role}-text`}>Mood</h2>
                            <Icon icon={getMoodIcon(state?.chatSession.sentiment)} width={"full"}/>
                            <h3>{state?.chatSession.sentiment}</h3>
                        </div>
                    </div>
                    <div className={`${smallShadow} flex flex-col gap-2 items-center rounded-lg p-[1rem]`}>
                        <h2 className={`${role}-text`}>Chat Length</h2>
                        <div>
                            <div className="flex flex-col text-lg text-center">
                                <b>Total Length</b>
                                <p>{state?.chatSession.duration} mins </p>
                            </div>
                            <div className="flex flex-col text-lg text-center">
                                <b>Time Spent Speaking</b>
                                <p>To Do mins</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-span-3 flex flex-col gap-[1rem]">
                    <button className={`py-2 px-4 rounded-lg flex flex-row items-center bg-gray-100 hover:bg-gray-200`}>
                        <div className={`${role}-text p-[2rem]`}>
                            <BsPlayCircle size={"3rem"} />
                        </div>
                        <h3 className={`${role}-text mx-auto`}>Play Audio</h3>
                    </button>
                    <div className={`${blockStyle} h-full`}>
                        <ChatTranscript chatSession={state.chatSession} />
                    </div>
                </div>
            </div>
            
        </div>
        )
    }
}