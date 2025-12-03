import { useAuth     } from "@/context/AuthProvider";

import GoalProgress from "@/components/graphics/GoalProgress";
import WeekTrack     from "./components/WeekTrack";
import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { getCurrentWeek } from "@/utils/functions/getChatWeeks";

export function Goal() {
    const { profile } = useAuth();
    const { data: sessions, isLoading } = useChatSessions();
    if (isLoading) { 
        return <p>Loading goal...</p>; 
    }
    const week = getCurrentWeek(sessions, 1);

    const getMsg = () => {
        if (week.sessions.length == 0) {
            if (profile.role == "Caregiver") {
                return `It's time for practice, help ${profile.plwd.first_name} achieve their goal!`;
            } else {
                return `It's time for practice, you can do this!`;
            }
        } else {
            if (profile.role == "Caregiver") {
                return `${profile.plwd.first_name} is making wonderful progress! Help ${profile.plwd.first_name} continue!`;
            } else {
                return `You're making wonderful progress! Keep going!`
            }
        }
    }

    return (
        <div className="d-flex flex-col px-[5vw] md:pt-[1rem] pb-[4rem] mb-[5rem] h-full md:gap-5 gap-2">  
            <br />
            <img className="lg:size-1/4 md:size-1/2 size-3/4 self-center" src="/images/robot_face.png"></img>
            <h3 className="m-[2rem] text-center"><b>{getMsg()}</b></h3>
            <GoalProgress />
            <WeekTrack week={week} />
        </div>
    );
}
