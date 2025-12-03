import { ChatSession } from "@/api";
import { useAuth } from "@/context/AuthProvider";
import { ChatWeek } from "@/utils/functions/getChatWeeks"
import { dateFormatOptionsShort } from "@/utils/styling/numFormatting";
import { widthStyle } from "@/utils/styling/sharedStyles";
import { useNavigate } from "react-router-dom";

export default function AlbumWeekList({ week } : { week: ChatWeek }) {
    const role = useAuth().profile.role.toLowerCase();
    const navigate = useNavigate();
    const toWeeklySummary = (week: ChatWeek) => navigate("/week", { state: { chatWeek: week, albumDisplay: "list" } } )
    const toDaySummary = (session: ChatSession) => navigate("/day", { state: { chatSession: session, albumDisplay: "list" } } )

    const SessionCard = ( {session} : {session: ChatSession } ) => {
        const date = new Date(session.date);
        const topics = session.topics.replace(/[\[\]"']/g, "").split(",")
        return (
            <div className="flex flex-row gap-2 rounded-md bg-white shadow-[0px_0px_2px_2px_rgba(0,0,0,0.1)] 
            hover:cursor-pointer hover:shadow-[0px_0px_4px_4px_rgba(0,0,0,0.15)]"
            onClick={() => {toDaySummary(session)}}>
                <div className="bg-blue-200 px-10 overflow-hidden rounded-l-md flex items-center">Image</div>
                <div className="flex flex-col w-full p-[0.5rem]">
                    <div className="flex justify-between w-full">
                        <b className="no-underline text-xl font-semibold">{date.toLocaleDateString("en-US", {month: "short", day: "numeric"})}</b>
                        <p className="">{session.duration / 60} minutes</p>
                    </div>
                    <div className={`${role}-text pb-2`}>
                        <p className="font-bold text-3xl mb-1">{topics[0]}</p>
                        <div className="flex flex-row flex-wrap gap-x-4 gap-y-1">
                            {topics.map((topic, idx) => {
                                if (idx == 0) return;
                                return (
                                    <span key={idx} className="text-xl whitespace-nowrap">{topic}</span>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={`${widthStyle} flex flex-col gap-4 border-gray-400 py-[1rem]`}>
            <a className="underline hover:cursor-pointer text-3xl text-black font-bold" onClick={() => {toWeeklySummary(week)}}>
                {week.start.toLocaleDateString("en-US", dateFormatOptionsShort)} - {week.end.toLocaleDateString("en-US", dateFormatOptionsShort)} {week.end.getFullYear()}
            </a>
            <div className="grid grid-rows-1 w-full gap-3">
                { week.sessions.map( (session, idx) => {
                    return (
                        <SessionCard key={idx} session={session} />
                    )
                })}
            </div>
        </div>
    )
}