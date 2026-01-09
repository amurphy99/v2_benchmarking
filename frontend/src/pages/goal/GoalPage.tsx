import { useAuth     } from "@/context/AuthProvider";

import GoalProgress from "@/components/graphics/GoalProgress";
import WeekTrack     from "./components/WeekTrack";
import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { getCurrentWeek } from "@/utils/functions/getChatWeeks";
import Avatar from "../common/avatar/Avatar";

export function Goal() {
    const { profile, role } = useAuth();
    const isCare = role != "patient";
    const { data: sessions, isLoading } = useChatSessions();
    if (isLoading) { 
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
        <div className="d-flex flex-col px-[5vw] md:pt-[1rem] pb-[4rem] mb-[5rem] h-full md:gap-5 gap-2">  
            <br />
            <div className="lg:size-1/4 md:size-1/2 size-3/4 self-center"> 
                <Avatar animation={null} animCount={0} model={model} zoom="head" /> 
            </div> 
            <h3 className="m-[2rem] text-center"><b>{getMsg()}</b></h3>
            <GoalProgress />
            <WeekTrack week={week} />
        </div>
    );
}
