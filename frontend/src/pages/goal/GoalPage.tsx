import { useAuth     } from "@/context/AuthProvider";

import GoalProgress from "@/components/graphics/GoalProgress";
import WeekTrack     from "./components/WeekTrack";
import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { getCurrentWeek } from "@/utils/functions/getChatWeeks";
import { useProfile } from "@/hooks/queries/useProfile";
import { Avatar } from "../common/avatar/Avatar";

export function Goal() {
    const role = useAuth().account.role;
    const isCare = role != "patient";
    const { data: sessions, isLoading } = useChatSessions();
    const { data: profile, isLoading: isLoadingProfile } = useProfile();
    if (isLoading || isLoadingProfile) { 
        return <p>Loading goal...</p>; 
    }
    
    const week = getCurrentWeek(sessions, 1);
    const model = profile.settings.modelChoice;

    const getMsg = () => {
        if (week.sessions.length == 0) {
            if (isCare) {
                return `It's time for practice, help ${profile.account.user.first_name} achieve their goal!`;
            } else {
                return `It's time for practice, you can do this!`;
            }
        } else {
            if (isCare) {
                return `${profile.account.user.first_name} is making wonderful progress! Help ${profile.account.user.first_name} continue!`;
            } else {
                return `You're making wonderful progress! Keep going!`
            }
        }
    }

    return (
        <>
       <div className="flex flex-col h-[80vh]">
            {!window.isMobile ? 
                <div className="flex flex-row justify-center h-7/10 m-[1rem] mt-[4rem]">
                    <div className="sm:w-1/5" />
                    <div className="mt-[1rem] w-full sm:w-1/2"> 
                        <Avatar model={model} zoom="body" /> 
                    </div> 
                    <div className="hidden sm:inline-block bubble"> 
                        {getMsg()} 
                    </div>
                </div>
                :  
                <div className="flex flex-col mx-[1rem] mt-[2rem] h-[65vh]">
                    <Avatar model={model} zoom="head"/>
                    <div className="text-3xl font-extrabold mt-[4rem] mx-[2rem] overflow-y-auto hidden-scrollbar h-full">
                        {getMsg()}
                    </div>
                </div>
            }
            <div className="mx-[10%]">
                <GoalProgress current={profile.goal.current} target={profile.goal.target} />
                <WeekTrack week={week} />
            </div>
        </div>
        </>
    );
}
