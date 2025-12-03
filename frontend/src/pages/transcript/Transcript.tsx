import { ChatSession } from "@/api";
import { useLocation, useNavigate } from "react-router-dom";
import ChatTranscript from "../chatDetails/components/ChatTranscript";
import { blockStyle, colStyle, widthStyle } from "@/utils/styling/sharedStyles";
import { useState } from "react";

export function Transcript() {
    const { state } = useLocation() as { state?: { chatSession?: ChatSession, albumDisplay: string } };
    const [biomarker, setBiomarker] = useState<string>("");
    const navigate = useNavigate();
    if (!state?.chatSession) { ("/chat"); };
    const toDaySummary = () => {navigate("/day", {state: {chatSession: state.chatSession, albumDisplay: state.albumDisplay}})}

    return (
        <div className="pt-[1rem]">
            <div className="pl-[1rem] pb-[1rem] font-bold text-2xl justify-between hover:cursor-pointer" onClick={() => {toDaySummary()}}>
                ← Transcript
            </div>
            <div className={colStyle}>
                <select 
                    onChange={(e) => setBiomarker(e.target.value)} 
                    className={`${widthStyle} p-2 border-1 border-solid border-gray-400 rounded-lg mt-[1rem] text-center text-xl hover:cursor-pointer`}
                    defaultValue="select"
                >
                    <option value="select" disabled>Choose a Sign To Analyze</option>
                    <option value="grammar">Altered Grammar</option>
                    <option value="anomia">Anomia</option>
                    <option value="pragmatic">Pragmatic</option>
                    <option value="pronunciation">Pronunciation</option>
                    <option value="prosody">Prosody</option>
                    <option value="turnTaking">Turn Taking</option>
                </select>
                <button className={`${widthStyle} py-2 px-4 rounded-full mt-1 shadow-[0px_0px_2px_2px_rgba(0,0,0,0.1)] hover:bg-violet-200`}>
                    Play Audio
                </button>
                <div className={blockStyle}>
                    <ChatTranscript chatSession={state.chatSession} />
                </div>
            </div>
            
        </div>
    )
}