import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { Spinner } from "react-bootstrap";
import ChatSessionCard from "./history/components/ChatSessionCard";
import ChatSummaryCard from "./dashboard/components/ChatSummaryCard";

export default function Admin() {
    const { data: chatSessions, isLoading } = useChatSessions();

    if (isLoading) {
        return <Spinner />
    }

    return (
        <div className="m-[2rem] pb-[15vh]">
            <h1>Admin</h1>
            <div className="grid grid-cols-3 gap-2">
                
                {chatSessions.map((chat, idx) => {
                    return (
                        <div>
                            <ChatSessionCard key={idx} session={chat} sessions={chatSessions} />
                        </div>
                    )
                })}
            </div>
        </div>
    );
}