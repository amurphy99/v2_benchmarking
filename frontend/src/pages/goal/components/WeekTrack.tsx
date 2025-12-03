import { useAuth } from "@/context/AuthProvider";
import { ChatWeek, getNumChatsInWeek, getCurrentWeek } from "@/utils/functions/getChatWeeks";


export default function WeekTrack( {week} : {week: ChatWeek} ) {
    const { profile } = useAuth();

    const role = profile.role.toLowerCase();
    const dayTracks = getNumChatsInWeek(week);

    return (
        <div className="flex flex-row justify-between">
            {dayTracks.map((d, idx) => (
                <DayTrack key={idx} day={d.day} chats={d.chats} role={role}/>
            ))}
        </div>
    )
}

const DayTrack = ({ day, chats, role }) => {
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