import { Spinner } from "react-bootstrap";

// From this project
import { useAuth } from "@/context/AuthProvider";
import { useActiveChatSessions, useInactiveChatSessions } from "@/hooks/queries/useChatSessions";
import { ChatList } from "./components/chat_lists/ChatList";
import { ACTIVE_ONLY, INACTIVE_ONLY, NON_DEMO_ONLY } from "@/utils/misc/constants";

// ================================================================================
// Admin ChatSession List Page (split into active and inactive chats)
// ================================================================================
export function Admin() {
    // Guard for users without access
    const { account } = useAuth();
    if (!account.user.is_staff) { return <h1 className="m-[2rem]">You don't have access to the admin page.</h1> }

    // Query the DB for a list of ChatSessions
    const { data:   active, isLoading: loading_1, refetch: refetchActive   } =   useActiveChatSessions(NON_DEMO_ONLY);
    const { data: inactive, isLoading: loading_2, refetch: refetchInactive } = useInactiveChatSessions(NON_DEMO_ONLY);

    // --------------------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------------------
    if (loading_1 || loading_2) { return <Spinner /> }
    return (
        <div className="mx-[2rem] pb-[15vh] flex flex-col gap-[1rem]">

            {/* Active Sessions */}
            <ChatList
                title       = "Currently Active Chat Sessions"
                subtitle    = "Live sessions you can open in the listener view."
                sessions    = {active}
                onRefresh   = {() => refetchActive()}
                navigate_to = {"/admin/chat/"}
            />

            {/* All Sessions */}
            <ChatList
                title       = "Completed Chat Sessions"
                subtitle    = "View post-chat analysis results."
                sessions    = {inactive}
                onRefresh   = {() => refetchInactive()}
                navigate_to = {"/admin/chat/inactive/"}
            />

        </div>
    );
}
