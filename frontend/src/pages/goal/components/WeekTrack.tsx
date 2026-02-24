import { ChatSession } from "@/api";
import { useAuth } from "@/context/AuthProvider";
import { ChatWeek, getChatsInWeek } from "@/utils/functions/getChatWeeks";
import { useNavigate } from "react-router-dom";


export default function WeekTrack( {week} : {week: ChatWeek} ) {
    const role = useAuth().account.role;
    const navigate = useNavigate();

    const dayTracks = getChatsInWeek(week);

    function toDayChat(sessions: ChatSession[]): void {
        navigate("/day", { state: { chatSession: sessions[sessions.length - 1], albumDisplay: "grid" } })
    }

    return (
        <div className="flex flex-row justify-between">
            {dayTracks.map((d, idx) => (
                <div onClick={() => toDayChat(d.sessions)} className="hover:cursor-pointer">
                    <DayTrack key={idx} day={d.day} chats={d.sessions.length} role={role}/>
                </div>
            ))}
        </div>
    )
}

const DayTrack = ({ day, chats, role } : {day: string, chats: number, role: string}) => {
    return (
        <div className="flex flex-col items-center gap-2"> 
            {day === "Today" ? 
                <b className="text-orange-500 align-middle">{day}</b> : 
                chats > 0 ?
                    <b className={role + "-text align-middle"}>{day}</b> : 
                    <b className="text-gray-400 align-middle">{day}</b>
            }
            {chats > 0 ? 
                <p className={role + "-bg size-[2rem] leading-[2rem] text-white rounded-full text-center"}>
                    {chats == 1 ? "✓" : chats}
                </p> :
                day === "Today" ? 
                    <div className="size-[2rem] text-white rounded-full bg-white border-dashed border-2 border-black" /> :
                    <div className="size-[2rem] text-white rounded-full bg-white border-dashed border-1 border-gray-400" />
            }
        </div>
    )
}