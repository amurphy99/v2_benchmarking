/* Monitor home: live and completed chat lists, plus links to the admin tools.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/Admin`

Shown as "Monitor" in the UI. Staff see every participant's chats; a caregiver
sees only the chats of the participants linked to them (the backend scopes both
lists).

This shows a list of the offline/completed chats as well as a list of the
active chats. These lists are all "cards" that provide a quick 
summary/description of the chat session and when clicked on, take you to a more 
detailed page (different for active/inactive chats) to inspect more information 
for that chat. Clicking on a ChatSessionCard from the live chat list takes you 
to the "Live Chat" (AdminChat.tsx) page, and clicking on a ChatSessionCard from
the inactive  chat list takes you to the "Inactive Chat" (AdminChatInactive.tsx)
page.

Staff reach the Activity Instructions, Map Task Maps, and Accounts pages from the
admin header (`components/Header.tsx`); a caregiver gets a card between the two
lists that links to their Participant Settings page. A filter bar above the lists
narrows both to one chat type, condition, or variant
(`components/chat_lists/ChatRunFilterBar`).

*/
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate                               } from "react-router-dom";

// From this project
import type { ChatSession                                    } from "@/api";
import      { useAuth                                        } from "@/context/AuthProvider";
import      { useActiveChatSessions, useInactiveChatSessions } from "@/hooks/queries/useChatSessions";
import      { NON_DEMO_ONLY                                  } from "@/utils/misc/constants";
import      { ChatList                                       } from "./components/chat_lists/ChatList";
import        ChatRunFilterBar                                 from "./components/chat_lists/ChatRunFilterBar";
import type { ChatRunFilter                                  } from "./components/chat_lists/chatRunFilter";
import      { CHAT_RUN_ANY, matchesChatRun                   } from "./components/chat_lists/chatRunFilter";
import      { AdminCard                                      } from "./components/ui/AdminCard";
import      { AdminPage                                      } from "./components/ui/AdminPage";
import      { SectionHeader                                  } from "./components/ui/SectionHeader";

// ================================================================================
// Admin list view of all ChatSessions (split into active and inactive chats)
// ================================================================================
export function Admin() {
    const navigate = useNavigate();
    const isStaff  = useAuth().account.user.is_staff;

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

    // Both lists narrowed to the chat type, condition, and variant picked (the dropdowns offer what either list holds)
    const [runFilter, setRunFilter] = useState<ChatRunFilter>(CHAT_RUN_ANY);
    const allSessions      = useMemo((): ChatSession[] => [...active, ...inactive], [active, inactive]);
    const filteredActive   = useMemo((): ChatSession[] => active  .filter((session: ChatSession) => matchesChatRun(session, runFilter)), [active,   runFilter]);
    const filteredInactive = useMemo((): ChatSession[] => inactive.filter((session: ChatSession) => matchesChatRun(session, runFilter)), [inactive, runFilter]);

    return (
        <AdminPage>
            <div className="flex flex-col gap-6 pt-6">
                {loading_1 && loading_2 && (
                    <div className="text-admin-subtext text-sm">Loading sessions...</div>
                )}

                {/* Chat type, condition, and variant filters for both lists */}
                <ChatRunFilterBar sessions={allSessions} filter={runFilter} onChange={setRunFilter} />

                {/* Active Sessions */}
                <ChatList
                    title       = "Currently Active Chat Sessions"
                    subtitle    = "Live sessions you can open in the listener view."
                    sessions    = {filteredActive}
                    onRefresh   = {refreshBoth}
                    navigate_to = {"/admin/chat/"}
                    variant     = "active"
                />

                {/* Participant settings (caregivers; staff reach Accounts from the admin header) */}
                {!isStaff ? (
                    <AdminCard
                        header={
                            <SectionHeader
                                title    = "Participant Settings"
                                subtitle = "Choose each of your participants' web avatar and language, and whether their chat audio is saved automatically."
                            />
                        }
                    >
                        <button
                            className = "px-4 py-2 rounded-lg bg-admin-text text-white text-sm font-medium hover:opacity-90 transition-opacity"
                            onClick   = {() => navigate("/admin/participants")}
                        >
                            Manage Participants
                        </button>
                    </AdminCard>
                ) : null}

                {/* All Sessions */}
                <ChatList
                    title       = "Completed Chat Sessions"
                    subtitle    = "View post-chat analysis results."
                    sessions    = {filteredInactive}
                    onRefresh   = {refreshBoth}
                    navigate_to = {"/admin/chat/inactive/"}
                    variant     = "completed"
                    grouped     = {true}
                />

            </div>
        </AdminPage>
    );
}