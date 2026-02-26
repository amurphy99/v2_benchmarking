import { useRef    } from "react";

// From this project
import { ChatSession    } from "@/api";
import   ChatMessages     from "../../../chat/components/ChatMessages";
import { BiomarkerPanel } from "../BiomarkerPanel";
import { cardClass      } from "../common/commonStyle";

// Misc. Helpers
import { useElementHeight           } from "@/hooks/style/useElementHeight";
import { ChatBiomarkerToLocalSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

// ================================================================================
// Admin ChatSession Messages & Biomarkers View Components
// ================================================================================
export function SessionHistory({ session } : { session: ChatSession }) {

    // Keep the heights equal (maybe doing it this way sucks, idk)
    const bioPanelRef    = useRef<HTMLDivElement | null>(null);
    const bioHeight      = useElementHeight(bioPanelRef);

    // Style helpers
    const style_messages   = cardClass("w-full flex flex-col min-h-0");
    const style_biomarkers = cardClass("w-full");

    return (
        <div className="grid grid-cols-2 m-[1rem] gap-[1rem] items-start">

            {/* Chat Messages */}
            <div className={style_messages} style={bioHeight ? { height: bioHeight } : undefined}>
                <ChatMessages messages={session.messages}/>
            </div>

            {/* Biomarkers */}
            <div ref={bioPanelRef} className={style_biomarkers}>
                <BiomarkerPanel series={ChatBiomarkerToLocalSeries(session.biomarkers)} windowSeconds={"all"} />
            </div>
        
        </div>
    )
}
