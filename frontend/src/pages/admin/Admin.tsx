import { Spinner } from "react-bootstrap";

// From this project
import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { ChatList } from "./components/chat_lists/ChatList";
import { ACTIVE_ONLY, INACTIVE_ONLY, NON_DEMO_ONLY } from "@/utils/misc/constants";

// ================================================================================
// Admin ChatSession List Page (split into active and inactive chats)
// ================================================================================
export function Admin() {
    // Query the DB for a list of ChatSessions
    const { data: chatSessionsActive,            isLoading,           refetch    } = useChatSessions(ACTIVE_ONLY, NON_DEMO_ONLY);
    const { data: chatSessionsInactive, isLoading: loadingAll, refetch: refetchAll } = useChatSessions(INACTIVE_ONLY, NON_DEMO_ONLY);
    // --------------------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------------------
    if (isLoading || loadingAll) { return <Spinner /> }
    return (
        <div className="mx-[2rem] pb-[15vh] flex flex-col gap-[1rem]">

            {/* Active Sessions */}
            <ChatList
                title       = "Currently Active Chat Sessions"
                subtitle    = "Live sessions you can open in the listener view."
                sessions    = {chatSessionsActive}
                onRefresh   = {() => refetch()}
                navigate_to = {"/admin/chat/"}
            />

            {/* All Sessions */}
            <ChatList
                title       = "Completed Chat Sessions"
                subtitle    = "View post-chat analysis results."
                sessions    = {chatSessionsInactive}
                onRefresh   = {() => refetchAll()}
                navigate_to = {"/admin/chat/inactive/"}
            />

        </div>
    );
}
