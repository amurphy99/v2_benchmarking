import { useNavigate, useParams } from "react-router-dom";

// Components
import { SessionHeader  } from "./components/admin_header/SessionHeader";
import { SessionHistory } from "./components/common/SessionHistory";
import { AnalysisPanel  } from "./components/analysis/AnalysisPanel";

// Misc. Helpers
import { useChatSession } from "@/hooks/queries/useChatSessions";
import toast from "react-hot-toast";

// ================================================================================
// [INACTIVE] Admin view for completed chats
// ================================================================================
export function AdminChatInactive() {
    // Load data for the given chat (ID received on page load)
    const { id                       } = useParams();
    const { data: session, isLoading, isError } = useChatSession(id ?? "");
    const navigate = useNavigate();

    if (isLoading || !session.id) { return <>Still loading</>; }
    if (isError) {
        toast.error("Error fetching chat session data. Returning to admin dashboard.");
        navigate("/admin");
    }

    // UI Components
    return (
        <div className="pb-[15vh] flex flex-col">

            {/* Page Header */}
            <SessionHeader
                title         = "Viewing Chat Session"
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
