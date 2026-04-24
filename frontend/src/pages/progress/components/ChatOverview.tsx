import { GiAlarmClock, GiRobotAntennas, GiChatBubble } from "react-icons/gi";
import { useAuth      } from "@/context/AuthProvider";
import { ChatSession  } from "@/api";
import { h3           } from "@/utils/styling/sharedStyles";
import   getExercises   from "@/utils/functions/getExercises";
import   GoalProgress   from "@/components/graphics/GoalProgress";
import { Avatar } from "@/pages/common/avatar/Avatar";


// ====================================================================
// Chat Overview (Conclusions & Suggestions from ChatDetails page)
// ====================================================================
export default function ChatOverview ({ chatSession } : { chatSession: ChatSession }) {
    const { profile } = useAuth();

    // User info
    const first     = profile.plwd.first_name;
    const current   = profile.goal.current;
    const remaining = profile.goal.remaining;

    // Style
    const outerStyle = "w-full h-full border-1 rounded-lg border-gray-200 p-[1rem] self-stretch";
    const conclStyle = "flex flex-row items-center gap-4 text-xl";
    const cStyle = "text-green-700 text-2xl";
    const rStyle = "text-fuchsia-900 text-2xl";

    // Return UI component
    return (
    <div className={outerStyle}>

        {/* Panel Header */}
        <p className={h3}> Conclusions and Suggestions </p>

        {/* -------------------------------------------------------------------- */}
        {/* Conclusions */}
        {/* -------------------------------------------------------------------- */}
        <div className="flex flex-row gap-4 my-[1rem]">
            <div className="w-1/3"> <Avatar model="qt" zoom="body" /> </div>
            
            <div className="w-2/3">

                {/* Evaluation & Progress Bar */}
                <p className="font-bold text-2xl"> {first} is doing fantastic! </p>
                <GoalProgress/>

                {/* Current Goal Chats */}
                <p className={conclStyle}>
                    <GiAlarmClock size={40} color="green" /> 
                    This was chat number <b className={cStyle}>{current}</b> with me.
                </p>

                {/* Remaining Goal Chats */}
                <p className={conclStyle}>
                    <GiRobotAntennas size={40} color="purple" />
                    {first} can complete another <b className={rStyle}>{remaining}</b> to reach a new goal!
                </p>

                {/* This Chat Topics */}
                <p className={conclStyle}>
                    <GiChatBubble size={40} color="orange" />
                    We covered these topics in this conversation: {chatSession.topics}
                </p>

            </div>
        </div>

        {/* -------------------------------------------------------------------- */}
        {/* Daily Suggestions */}
        {/* -------------------------------------------------------------------- */}
        <div> 
            <p className="font-bold text-2xl">Daily suggestions:</p>
            <ul> 
                {getExercises().map((exercise, i) => { 
                    return <li className="text-xl" key={i}> {exercise} </li>; 
                })}
            </ul>
        </div>
        
    </div>
    );
}
