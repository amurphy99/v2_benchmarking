import { useNavigate } from "react-router-dom";
import {  ChatSessionSummary } from "@/api";

// Button that sends users to the transcript analysis page
// ToDo: Try with other colors
export default function AnalysisButton ({ session, analysis_choice } : { session: ChatSessionSummary, analysis_choice: string }) {
    const navigate = useNavigate();
    const onClick = () => navigate("/analysis", { state: { session, analysis_choice } });
    
    const buttStyle = "bg-violet-600 rounded p-2 text-white";

    return <button className={buttStyle} onClick={onClick}> View in Transcript </button>;
}
