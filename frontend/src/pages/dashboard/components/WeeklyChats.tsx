import { useChatSessions               } from "@/hooks/queries/useChatSessions";
import { ChatWeek, groupSessionsByWeek } from "@/utils/functions/getChatWeeks";
import ChatWeekCard from "@/pages/history/components/ChatWeekCard";


// ====================================================================
// Weekly chat progress view
// =====================================================================
export default function WeeklyChats() {
    const { data: chatSessions, isLoading } = useChatSessions();
    const weeks: ChatWeek[] = groupSessionsByWeek(chatSessions);

    // Return UI component
    if (isLoading) { return <p>Loading chat history...</p>; }
    return (
    <div className="d-flex flex-col gap-[1rem]">
        <span className="fs-4 fw-bold"> Weekly Summary </span>
        <div className="d-flex flex-col gap-[1rem]">
            {weeks.map(w => (<ChatWeekCard key={w.start.toISOString()} week={w}/>))}
        </div>
    </div>
    );
}
