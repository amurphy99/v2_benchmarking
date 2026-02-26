import { useParams } from "react-router-dom";

// Components
import { SessionHeader  } from "./components/admin_header/SessionHeader";
import { SessionHistory } from "./components/common/SessionHistory";
import { AnalysisPanel  } from "./components/analysis/AnalysisPanel";

// Misc. Helpers
import { useChatSession } from "@/hooks/queries/useChatSessions";

// ================================================================================
// [INACTIVE] Admin view for completed chats
// ================================================================================
export function AdminChatInactive() {
    // Load data for the given chat (ID received on page load)
    const { id                       } = useParams();
    const { data: session, isLoading } = useChatSession(id ?? "");

    if (isLoading || !session.id) { return <>Still loading</>; }

    // UI Components
    return (
        <div className="pb-[15vh] flex flex-col">

            {/* Page Header */}
            <SessionHeader
                title         = "View Inactive Chat Session"
                sessionId     = {id}
                username      = {session?.profile.account.user.username ?? "sample_username"}
                source        = {session?.source ?? "unknown"}
                mode          = {"history"}
                wsState       = {"offline"}
                messageCount  = {session?.messages.length ?? 0}
                inactive_chat = {true}
                duration      = {session?.duration}
            />

            {/* Page Body */}
            <AnalysisPanel  session={session} /> {/* Analysis Panel (topics, sentiment, summary, risk factors) */}
            <SessionHistory session={session} /> {/* Chat Messages & Biomarker History */}

        </div>
    );
}
