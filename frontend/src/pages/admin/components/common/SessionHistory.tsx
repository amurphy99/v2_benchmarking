import { useRef, useMemo } from "react";

// ChatSession DB model + local type equivalents
// LIVE version uses the local equivalents; OFFLINE version uses the full model
import { ChatSession          } from "@/api";
import { LocalChatMessage     } from "@/hooks/live-chat";
import { LocalBiomarkerSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

// Components
import   ChatMessages     from "@/pages/chat/components/ChatMessages";
import { BiomarkerPanel } from "./BiomarkerPanel";
import { cardClass      } from "./commonStyle";

// Misc. Helpers
import { useElementHeight           } from "@/hooks/style/useElementHeight";
import { ChatBiomarkerToLocalSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

// Input needs to be either offline session OR live data
type SessionHistoryProps =
    | { session : ChatSession; messages?: never;              series?: never                }
    | { session?: never;       messages : LocalChatMessage[]; series : LocalBiomarkerSeries };

// ================================================================================
// Admin ChatSession Messages & Biomarkers View Components
// ================================================================================
// Flexible for active & inactive chats
export function SessionHistory(props: SessionHistoryProps){
    // Normalize inputs once
    const messages = useMemo(() => {return "session" in props ? (props.session.messages ?? [])                       : props.messages;}, [props]);
    const series   = useMemo(() => {return "session" in props ? ChatBiomarkerToLocalSeries(props.session.biomarkers) : props.series;  }, [props]);

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
                <ChatMessages messages={messages}/>
            </div>

            {/* Biomarker Scores */}
            <div ref={bioPanelRef} className={style_biomarkers}>
                <BiomarkerPanel series={series} windowSeconds={"all"} />
            </div>
        
        </div>
    )
}
