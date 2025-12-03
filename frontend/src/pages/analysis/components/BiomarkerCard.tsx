import { BiomarkerType, ChatSession } from "@/api";
import { useAuth } from "@/context/AuthProvider";
import { getBiomarkerDefinition, getBiomarkerDescription, getBiomarkerName } from "@/utils/misc/descriptions";
import { blockStyle } from "@/utils/styling/sharedStyles";
import { useState } from "react";

import { dateFormatOptionsShort } from "@/utils/styling/numFormatting";
import { useNavigate } from "react-router-dom";
import SpeechExample from "./SpeechExample";
import { ChatWeek } from "@/utils/functions/getChatWeeks";
import DetailGraph from "./DetailGraph";

export default function BiomarkerCard({
    biomarker, 
    week,
    exemplarDays,
    flaggedDays,
    performance 
} : {
    biomarker   : BiomarkerType, 
    week        : ChatWeek,
    exemplarDays: ChatSession[],
    flaggedDays : ChatSession[],
    performance : string
}) {
    const role = useAuth().profile.role.toLowerCase();
    const navigate = useNavigate();
    const [example, setExample] = useState<string>("exemplar")

    const toDaySummary = (session: ChatSession) => navigate("/day", { state: { chatSession: session, albumDisplay: "grid" } } )

    return (
        <div className={`${blockStyle} flex flex-col`}>
            <h2 className={`${role}-text mb-0`}>{getBiomarkerDescription(biomarker)}</h2>
            <h5 className={`${role}-text font-normal text-lg mb-0`}>({getBiomarkerName(biomarker)})</h5>
            <p>{getBiomarkerDefinition(biomarker)}</p>
            <SpeechExample biomarker={biomarker} role={role} example={example} setExample={setExample} />
            <div className="text-lg border-t border-solid border-gray-300 py-2">
                <p><b>{role == "patient" ? "Your" : useAuth().user.first_name + "'s"} Performance</b></p>
                <ul className={`list-disc marker:text-${role == "patient" ? "green" : "violet"}-600`}>
                    <li><p>This past week: <b>{performance}</b></p></li>
                    <li>
                        <p><b>Good days:</b> 
                        {exemplarDays.map((day, idx) => {
                            return <button 
                                    className={`${role}-text px-2 underline`}
                                    key={idx}
                                    onClick={() => {toDaySummary(day)}}
                                >
                                    {new Date(day.date).toLocaleDateString("en-US", dateFormatOptionsShort)}
                                </button>
                        })}
                        </p>
                    </li>
                    <li>
                        <p><b>Bad days:</b> 
                        {flaggedDays.map((day, idx) => {
                            return <button 
                                    className={`${role}-text px-2 underline`}
                                    key={idx}
                                    onClick={() => {toDaySummary(day)}}
                                >
                                    {new Date(day.date).toLocaleDateString("en-US", dateFormatOptionsShort)}
                                </button>
                        })}
                        </p>
                    </li>
                </ul>
            </div>
            {role == "patient" ? null : 
            <DetailGraph biomarker={biomarker} week={week} />
            }
        </div>
    )
}