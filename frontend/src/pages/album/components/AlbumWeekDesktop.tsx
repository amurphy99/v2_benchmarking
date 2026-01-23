import { ChatSession } from "@/api";
import { useAuth } from "@/context/AuthProvider";
import { ChatWeek } from "@/utils/functions/getChatWeeks";
import { defaultImage } from "@/utils/functions/matchImage";
import { dateFormatOptionsMonth, dateFormatOptionsShort } from "@/utils/styling/numFormatting";
import { smallShadow } from "@/utils/styling/sharedStyles";
import { useNavigate } from "react-router-dom";

export default function AlbumWeekDesktop({ week } : { week: ChatWeek }) {
    const { role } = useAuth();
    const navigate = useNavigate();

    const toWeeklySummary = (week: ChatWeek) => navigate("/week", { state: { chatWeek: week, albumDisplay: "list" } } )
    const toDaySummary = (session: ChatSession) => navigate("/day", { state: { chatSession: session, albumDisplay: "grid" } } );
    const sessions = week.sessions.slice().reverse();

    return (
        <div className="flex flex-col gap-[1rem]">
            <h2 className="items-start hover:cursor-pointer underline z-1" 
            onClick={() => {toWeeklySummary(week)}}> {week.start.toLocaleDateString("en-US", dateFormatOptionsShort)} - 
                {week.end.toLocaleDateString("en-US", dateFormatOptionsShort)} {week.end.getFullYear()} </h2>
            <div>
                <div className="carousel-container w-[95%]">
                    { sessions.map( (session, idx) => {
                        if (!session.image) {
                            session.image = defaultImage
                        }
                        const date = new Date(session.date);
                        const topics = session.topics.replace(/[\[\]"']/g, "").split(",")
                        return (
                            <div key={idx} className={`${smallShadow} flex flex-col p-2 rounded-lg hover:cursor-pointer hover:scale-110`}
                            onClick={() => {toDaySummary(session)}}>
                                <div 
                                    className="flex-col flex-none flex items-center justify-end pb-2 aspect-square 
                                        text-white text-shadow-lg bg-cover bg-center bg-purple-200 rounded-lg"
                                    style={{ backgroundImage: `url(${session?.image?.url})`}}
                                > 
                                    <div className="flex flex-col justify-center items-center my-auto">
                                        <p className='m-0 text-lg'>{date.toLocaleDateString("en-US", dateFormatOptionsMonth)}</p>
                                        <p className="m-0 text-5xl font-semibold">{date.getDate()} </p>
                                    </div>
                                    <a href={session?.image?.photographer_url} className="text-[8px] text-white m-0 font-thin text-nowrap">
                                        Image credit: {session?.image?.photographer} at Pexels
                                    </a>
                                </div>
                                <p className={`m-0 mx-auto ${role}-text font-semibold`}>{topics[0]}</p>
                                <p className="m-0 mx-auto">{session.duration / 60} minutes</p>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
