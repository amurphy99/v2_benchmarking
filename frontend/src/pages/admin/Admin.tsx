import { Spinner } from "react-bootstrap";

// From this project
import { useAuth } from "@/context/AuthProvider";
import { useActiveChatSessions, useAllChatSessions } from "@/hooks/queries/useChatSessions";
import { ChatList } from "./components/chat_lists/ChatList";

// ================================================================================
// Admin ChatSession List Page (split into active and inactive chats)
// ================================================================================
export function Admin() {
    // Guard for users without access
    const { account } = useAuth();
    if (!account.user.is_staff) { return <h1 className="m-[2rem]">You don't have access to the admin page.</h1> }

    // Query the DB for a list of ChatSessions
    const { data: chatSessionsActive,            isLoading,           refetch    } = useActiveChatSessions();
    const { data: chatSessions,       isLoading: loadingAll, refetch: refetchAll } = useAllChatSessions   ();

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
                sessions    = {chatSessions}
                onRefresh   = {() => refetchAll()}
                navigate_to = {"/admin/chat/inactive/"}
            />

        </div>
    );
}
