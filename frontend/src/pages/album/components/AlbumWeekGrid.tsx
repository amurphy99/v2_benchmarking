import { ChatSession } from "@/api";
import { ChatWeek } from "@/utils/functions/getChatWeeks"
import { defaultImage } from "@/utils/functions/matchImage";
import { dateFormatOptionsShort } from "@/utils/styling/numFormatting";
import { blockStyle } from "@/utils/styling/sharedStyles";
import { useNavigate } from "react-router-dom";

export default function AlbumWeekGrid({ week } : { week: ChatWeek }) {
    const navigate = useNavigate();

    const toWeeklySummary = (week: ChatWeek) => navigate("/week", { state: { chatWeek: week } } );
    const toDaySummary = (session: ChatSession) => navigate(`/day/${session.id}`);
    const sessions = week.sessions.slice().reverse();

    if (sessions.length > 0) {
        return (
            <div 
                className={`${blockStyle} flex flex-col gap-2 m-[1rem] lg:p-[4rem] bg-white`} 
            >
                <h2>{week.start.toLocaleDateString("en-US", dateFormatOptionsShort)} - 
                    {week.end.toLocaleDateString("en-US", dateFormatOptionsShort)} {week.end.getFullYear()}</h2>
                <div className="w-full aspect-square flex self-center">
                    <div className="relative flex items-end justify-between size-full hover:cursor-pointer album-img hover:shadow-lg/30" 
                    onClick={() => {toWeeklySummary(week)}}
                    >   
                        <img className="w-full h-full object-cover" src={week?.image?.url} />
                        <div className="absolute inset-0 flex flex-row items-end justify-between">
                            <h1 className="text-white font-bold underline text-shadow-lg p-4">
                                {week.sessions.length} Chat{week.sessions.length > 1 ? "s" : ""}
                            </h1>
                            <a href={week?.image?.photographer_url} className="text-xs float-right text-white p-1">
                                Image credit: {week?.image?.photographer} at Pexels
                            </a>
                        </div>
                    </div>
                </div>
                <div className="grid grid-flow-col auto-cols-[20%] gap-2 overflow-x-auto hidden-scrollbar">
                    { sessions.map( (session, idx) => {
                        if (!session.image) {
                            session.image = defaultImage
                        }
                        return (
                            <div 
                                key={idx} 
                                className="relative aspect-square text-white font-bold underline text-shadow-lg
                                    hover:cursor-pointer album-img hover:shadow-lg/30 hover:scale-90"
                                onClick={() => {toDaySummary(session)}}
                            > 
                                <img className="w-full h-full object-cover" src={session.image.url} />
                                <div className="absolute inset-0 p-1 flex flex-col items-center justify-end brightness-100">
                                    {new Date(session.date).toLocaleDateString("en-US", dateFormatOptionsShort)} 
                                    <a href={session?.image?.photographer_url} className="text-[6px] text-white m-0 font-thin text-nowrap">
                                        Image credit: {session?.image?.photographer} at Pexels
                                    </a>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }
}