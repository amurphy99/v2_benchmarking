import { GiAlarmClock, GiRobotAntennas, GiChatBubble } from "react-icons/gi";
import { useAuth      } from "@/context/AuthProvider";
import { ChatSession  } from "@/api";
import { h3           } from "@/utils/styling/sharedStyles";
import   getExercises   from "@/utils/functions/getExercises";
import   GoalProgress   from "@/components/graphics/GoalProgress";
import { Avatar } from "@/pages/common/avatar/Avatar";
import { Spinner } from "react-bootstrap";
import { useProfile } from "@/hooks/queries/useProfile";
import { useGoal } from "@/hooks/queries/useGoal";


// ====================================================================
// Chat Overview (Conclusions & Suggestions from ChatDetails page)
// ====================================================================
export default function ChatOverview() {
    const { account } = useAuth();
    const { data: profile, isLoading } = useProfile();

    // User info
    const role      = account.role;
    const first     = profile.account.user.first_name;
    const current   = profile.goal.current;
    const target    = profile.goal.target;

    // Style
    const outerStyle = "w-full h-full p-[2rem] self-stretch pb-[10vh]";
    const conclStyle = "flex flex-row items-center gap-4 text-xl";
    const cStyle = "text-green-700 text-2xl";
    const rStyle = "text-fuchsia-900 text-2xl";

    if (isLoading) {
        return <Spinner />
    }

    // Return UI component
    return (
    <div className={outerStyle}>

        {/* Panel Header */}
         <h1 className="text-3xl md:text-4xl place-self-center whitespace-nowrap"><b> Progress Overview </b></h1>

        {/* -------------------------------------------------------------------- */}
        {/* Conclusions */}
        {/* -------------------------------------------------------------------- */}
        <div className="grid grid-cols-3 w-full gap-[2rem]">
            <div className="aspect-square col-span-1"> <Avatar model="qt" zoom="body" /> </div>
        
            <div className="w-full h-full items-center place-content-center col-span-2">

                {/* Evaluation & Progress Bar */}
                <p className="font-bold text-2xl"> {role == "caregiver" ? first + " is" : "You are"} doing fantastic! </p>
                <GoalProgress current={current} target={target} />

                {/* Current Goal Chats */}
                <p className={conclStyle}>
                    <GiAlarmClock size={40} color="green" /> 
                    {role == "caregiver" ? first + " has" : "You have"} chatted with me <b className={cStyle}>{current}</b> times this week.
                </p>

                {/* Remaining Goal Chats */}
                <p className={conclStyle}>
                    <GiRobotAntennas size={40} color="purple" />
                    {role == "caregiver" ? first : "You "} can complete another <b className={rStyle}>{target-current}</b> chats to reach a new goal!
                </p>

            </div>
            
        </div>

        {/* -------------------------------------------------------------------- */}
        {/* Daily Suggestions */}
        {/* -------------------------------------------------------------------- */}
        <div> 
            <p className="font-bold text-2xl">Daily suggestions:</p>
            <ul className="list-disc"> 
                {getExercises().map((exercise, i) => { 
                    return <li className="text-xl" key={i}> {exercise} </li>; 
                })}
            </ul>
        </div>
        
    </div>
    );
}
