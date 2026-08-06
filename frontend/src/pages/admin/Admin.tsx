/* Admin.tsx
--------------------------------------------------------------------------------
This shows a list of all of the offline/completed chats as well as a list of all
of the active chats. These lists are all "cards" that provide a quick 
summary/description of the chat session and when clicked on, take you to a more 
detailed page (different for active/inactive chats) to inspect more information 
for that chat. Clicking on a ChatSessionCard from the live chat list takes you 
to the "Live Chat" (AdminChat.tsx) page, and clicking on a ChatSessionCard from
the inactive  chat list takes you to the "Inactive Chat" (AdminChatInactive.tsx) 
page.

*/
import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// From this project
import { useActiveChatSessions, useInactiveChatSessions } from "@/hooks/queries/useChatSessions";
import { ChatList      } from "./components/chat_lists/ChatList";
import { AdminPage     } from "./components/ui/AdminPage";
import { AdminCard     } from "./components/ui/AdminCard";
import { SectionHeader } from "./components/ui/SectionHeader";
import { NON_DEMO_ONLY } from "@/utils/misc/constants";

// ================================================================================
// Admin list view of all ChatSessions (split into active and inactive chats)
// ================================================================================
export function Admin() {
    const navigate = useNavigate();

    // Query the DB for a list of ChatSessions
    const { data:   active, isLoading: loading_1, refetch: refetchActive   } =   useActiveChatSessions(NON_DEMO_ONLY);
    const { data: inactive, isLoading: loading_2, refetch: refetchInactive } = useInactiveChatSessions(NON_DEMO_ONLY);

    // Refreshes to either list always update both lists.
    // Completing a chat always moves it from one list to the other; so we need 
    // to refresh both to reflect that in the UI.
    const refreshBoth = useCallback(() => {
        refetchActive  ();
        refetchInactive();
    }, [refetchActive, refetchInactive]);

    // Re-fetch from the DB whenever the page gains "focus".
    // This covers when users use the "back" navigation button from a chat 
    // detail page; before the 5 minute stale time was preventing the 
    // "refetchOnWindowFocus" from TanStack.
    useEffect(() => {
        refreshBoth();
        const onFocus = () => refreshBoth();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [refreshBoth]);

    return (
        <AdminPage>
            <div className="flex flex-col gap-6 pt-6">
                {loading_1 && loading_2 && (
                    <div className="text-admin-subtext text-sm">Loading sessions...</div>
                )}

                {/* Active Sessions */}
                <ChatList
                    title       = "Currently Active Chat Sessions"
                    subtitle    = "Live sessions you can open in the listener view."
                    sessions    = {active}
                    onRefresh   = {refreshBoth}
                    navigate_to = {"/admin/chat/"}
                    variant     = "active"
                />

                {/* Activity & Instructions Management */}
                <AdminCard
                    header={
                        <SectionHeader
                            title    = "Activity Instructions"
                            subtitle = "Manage chat activities and their conversation instructions. Define and edit the instructions that guide the AI during memory activity chat sessions. Changes here affect all users."
                        />
                    }
                >
                    <button
                        className="px-4 py-2 rounded-lg bg-admin-text text-white text-sm font-medium hover:opacity-90 transition-opacity"
                        onClick={() => navigate("/admin/chat/activities")}
                    >
                        Manage Activity Instructions
                    </button>
                </AdminCard>

                {/* All Sessions */}
                <ChatList
                    title       = "Completed Chat Sessions"
                    subtitle    = "View post-chat analysis results."
                    sessions    = {inactive}
                    onRefresh   = {refreshBoth}
                    navigate_to = {"/admin/chat/inactive/"}
                    variant     = "completed"
                    grouped     = {true}
                />

            </div>
        </AdminPage>
    );
}