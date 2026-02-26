import { useRef    } from "react";

// From this project
import { ChatSession    } from "@/api";
import   ChatMessages     from "../../../chat/components/ChatMessages";
import { BiomarkerPanel } from "../BiomarkerPanel";

// Misc. Helpers
import { useElementHeight           } from "@/hooks/style/useElementHeight";
import { ChatBiomarkerToLocalSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

// ================================================================================
// Admin ChatSession Messages & Biomarkers View Components
// ================================================================================
export function SessionHistory({ session } : { session: ChatSession }) {

    // Style Helpers
    const bioPanelRef   = useRef<HTMLDivElement | null>(null);
    const bioHeight     = useElementHeight(bioPanelRef);
    const messagesStyle = "w-full border border-gray-300 flex flex-col min-h-0 rounded-sm";

    return (
        <div className="grid grid-cols-2 m-[1rem] gap-[1rem] items-start">

            {/* Chat Messages */}
            <div className={messagesStyle} style={bioHeight ? { height: bioHeight } : undefined}>
                <ChatMessages messages={session.messages}/>
            </div>

            {/* Biomarkers */}
            <div ref={bioPanelRef} className="w-full border border-gray-300 rounded-sm">
                <BiomarkerPanel series={ChatBiomarkerToLocalSeries(session.biomarkers)} windowSeconds={"all"} />
            </div>
        
        </div>
    )
}
