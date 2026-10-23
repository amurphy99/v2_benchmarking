/* AdminChatInactive.tsx
--------------------------------------------------------------------------------
This is the inactive counterpart of the AdminChat page. On this page, Admin 
users can view all analysis for a ChatSession that has already been completed. 

Admin users can view the full transcript from the ChatSession as well as graphs
showing values each of the biomarkers as the chat went on. Additionally, they
can view the automatically generated analysis for the chat, including a list of
topics, short summary of the chat, and an analysis of any potential risk factors
identified from the users speech. This page also has a button that takes them to
the secondary analysis page, "TranscriptPlayback.tsx".

*/
import { useNavigate, useParams } from "react-router-dom";
import { LuPlay                 } from "react-icons/lu";
import   toast                    from "react-hot-toast";

// Components
import { SessionHeader  } from "./components/admin_header/SessionHeader";
import { SessionHistory } from "./components/common/SessionHistory";
import { AnalysisPanel  } from "./components/analysis/AnalysisPanel";
import { AdminPage      } from "./components/ui/AdminPage";
import { AdminButton    } from "./components/ui/AdminButton";

// Misc. Helpers
import { useChatSession } from "@/hooks/queries/useChatSessions";


// ================================================================================
// [FOR INACTIVE SESSIONS] Admin view for completed chats
// ================================================================================
export function AdminChatInactive() {
    // Load data for the given chat (ID received on page load)
    const { id                       } = useParams();
    const { data: session, isLoading, isError } = useChatSession(id ?? "");
    const navigate = useNavigate();

    if (isLoading || !session.id) { return <div className="p-6 text-admin-subtext">Loading session...</div>; }
    if (isError) {
        toast.error("Error fetching chat session data. Returning to admin dashboard.");
        navigate("/admin");
    }

    // "Transcript Playback" button takes us to the biomarker highlighting analysis page
    // (pass only the session ID so the playback page always re-fetches fresh data)
    const playbackButton = (
        <AdminButton
            variant  = "primary"
            size     = "md"
            iconLeft = {<LuPlay size={18} />}
            onClick  = {() => navigate("/transcript-playback", { state: { sessionId: session.id } })}
            className= "shadow-md text-base"
        >
            Transcript Playback
        </AdminButton>
    );

    // --------------------------------------------------------------------------------
    // UI Components
    // --------------------------------------------------------------------------------
    return (
        <AdminPage contained={false}>
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
                rightActions  = {playbackButton}
            />

            {/* Page Body */}
            <div className="px-4 md:px-6 pt-4 pb-6 flex flex-col gap-6">
                <AnalysisPanel  session={session} /> {/* Analysis Panel (topics, sentiment, summary, risk factors) */}
                <SessionHistory session={session} /> {/* Chat Messages & Biomarker History */}
            </div>
        </AdminPage>
    );
}
