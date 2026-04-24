import { useUserSettings } from "@/hooks/queries/useUserSettings";
import { useNavigate } from "react-router-dom";
import { getLatestSession } from "@/api";
import { Avatar } from "../common/avatar/Avatar";

export function ChatEnd() {
    const { data: settings, isLoading } = useUserSettings();
    const navigate = useNavigate();

    if (isLoading) {
        return <div>Loading...</div>;
    }

    async function toRecent() {
        const latest = await getLatestSession();
        navigate("/day", { state: { chatSession: latest, albumDisplay: "recent" } });
    }

    const model = settings.modelChoice;
    return (
        <>
        <div className="flex flex-col h-[85vh]">
            {!window.isMobile ? 
                <div className="flex flex-row justify-center h-7/10 m-[1rem] mt-[4rem]">
                    <div className="sm:w-1/5" />
                    <div className="mt-[1rem] w-full sm:w-1/2"> 
                        <Avatar model={model} zoom="body" /> 
                    </div> 
                    <div className="hidden sm:inline-block bubble"> 
                        Thank you for chatting with me! I hope you have a great day. 
                        <br /><br />
                        You can view the summary of today's conversation here:
                        <button onClick={() => toRecent()} className="patient-button rounded-sm px-4 py-2 mt-2">Review Chat</button>
                    </div>
                </div>
                :  
                <div className="flex flex-col mx-[1rem] mt-[2rem] h-[65vh]">
                    <Avatar model={model} zoom="head"/>
                    <div className="text-3xl font-extrabold mt-[4rem] mx-[2rem] overflow-y-auto hidden-scrollbar h-full">
                        Thank you for chatting with me! I hope you have a great day. 
                        <br /><br />
                        You can view the summary of today's conversation here:
                        <button onClick={() => toRecent()} className="patient-button rounded-sm px-4 py-2 mt-2">Review Chat</button>
                    </div>
                </div>
            }
        </div>
        </>
    )
}