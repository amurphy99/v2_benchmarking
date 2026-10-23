/* Admin ChatSession messages & biomarkers view components
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/common/SessionHistory.tsx`

*/
import { useMemo } from "react";

// ChatSession DB model + local type equivalents
// LIVE version uses the local equivalents; OFFLINE version uses the full model
import { ChatSession          } from "@/api";
import { LocalChatMessage     } from "@/hooks/live-chat";
import { LocalBiomarkerSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

// Components
import { ChatMessages   } from "./ChatMessages";
import { BiomarkerPanel } from "./BiomarkerPanel";

// Misc. Helpers
import { ChatBiomarkerToLocalSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

// Either offline session OR live data
type SessionHistoryProps =
    | { session : ChatSession; messages?: never;              series?: never;                fillHeight?: boolean }
    | { session?: never;       messages : LocalChatMessage[]; series : LocalBiomarkerSeries; fillHeight?: boolean };

// ================================================================================
// Admin ChatSession Messages & Biomarkers View Components
// ================================================================================
// Flexible for active & inactive chats
export function SessionHistory(props: SessionHistoryProps) {
    // Default mode  (inactive chat): natural height, scrolls with the page
    // `fillHeight` mode (live chat): take parent's height, ChatHistory scrolls internally, no page-level overflow.
    const inactive = ("session" in props);

    // Normalize inpu types once
    const messages = useMemo(() => {return inactive ? (props.session.messages ?? [])                       : props.messages;}, [props]);
    const series   = useMemo(() => {return inactive ? ChatBiomarkerToLocalSeries(props.session.biomarkers) : props.series;  }, [props]);

    // Style helpers
    const cardClass     = "rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden";
    const messagesClass = `${cardClass} flex flex-col min-h-0`;
    const biomarkClass  = `${cardClass} min-h-0 overflow-y-auto`;

    // Fixed height in inactive mode so the inner panels actually scroll
    const heightClass = props.fillHeight ? "h-full" : "h-[70vh]";

    return (
        <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] gap-4 items-stretch ${heightClass}`}>

            {/* Chat Messages */}
            <div className={messagesClass}>
                <ChatMessages messages={messages} do_auto_scroll={!inactive} />
            </div>

            {/* Biomarker Scores */}
            <div className={biomarkClass}>
                <BiomarkerPanel series={series} windowSeconds={"all"} />
            </div>

        </div>
    );
}
