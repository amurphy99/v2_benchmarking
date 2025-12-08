import { ChatSession } from "@/api";
import { ChatWeek } from "@/utils/functions/getChatWeeks"
import { defaultImage } from "@/utils/functions/matchImage";
import { dateFormatOptionsShort } from "@/utils/styling/numFormatting";
import { blockStyle } from "@/utils/styling/sharedStyles";
import { useNavigate } from "react-router-dom";

export default function AlbumWeekGrid({ week } : { week: ChatWeek }) {
    const navigate = useNavigate();

    const toWeeklySummary = (week: ChatWeek) => navigate("/week", { state: { chatWeek: week, albumDisplay: "grid" } } );
    const toDaySummary = (session: ChatSession) => navigate("/day", { state: { chatSession: session, albumDisplay: "grid" } } );
    const sessions = week.sessions.slice().reverse();

    return (
        <div 
            className={`${blockStyle} flex flex-col gap-2 m-[1rem] lg:p-[4rem] bg-white`} 
        >
            <h2>{week.start.toLocaleDateString("en-US", dateFormatOptionsShort)} - 
                {week.end.toLocaleDateString("en-US", dateFormatOptionsShort)} {week.end.getFullYear()}</h2>
            <div className="w-full aspect-square flex self-center">
                <div className="flex items-end justify-between size-full p-4 bg-cover bg-center hover:cursor-pointer hover:shadow-lg/30" 
                onClick={() => {toWeeklySummary(week)}}
                style={{ backgroundImage: `url(${week?.image?.url})`}}>
                    <h1 className="text-white font-bold underline text-shadow-lg">
                        {week.sessions.length} Chat{week.sessions.length > 1 ? "s" : ""}
                    </h1>
                    <a href={week?.image?.photographer_url} className="text-xs float-right text-white m-[-16px]">
                        Image credit: {week?.image?.photographer} at Pexels
                    </a>
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
                            className="flex-col flex-none flex items-center justify-end pb-2 aspect-square 
                                text-white font-bold underline text-shadow-lg bg-cover bg-center
                                hover:cursor-pointer hover:shadow-lg/30 hover:scale-90"
                            onClick={() => {toDaySummary(session)}}
                            style={{ backgroundImage: `url(${session?.image?.url})`}}
                        > 
                            {new Date(session.date).toLocaleDateString("en-US", dateFormatOptionsShort)} 
                            <a href={session?.image?.photographer_url} className="text-[8px] text-white m-0 font-thin">
                                Image credit: {session?.image?.photographer} at Pexels
                            </a>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}