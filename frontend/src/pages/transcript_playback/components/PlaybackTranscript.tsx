/* 
Tramscript container with audio playback controls & biomarker highlighting.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/PlaybackTranscript`

*/
import { useMemo } from "react";

// From this project
import { ChatMessage, ChatBiomarkerScore } from "@/api";
import { blockStyle                      } from "@/utils/styling/sharedStyles";
import   UtteranceLine                     from "./UtteranceLine";
import { useBiomarkerWordScores          } from "./../utils/useBiomarkerScores";
import { useBiomarkerMessageScores       } from "./../utils/useBiomarkerScores";

interface Props {
    messages         : ChatMessage[];
    biomarkers       : ChatBiomarkerScore[];
    sessionStartMs   : number;
    currentTime      : number;
    selectedBiomarker: string;
    userName         : string;
    onSeek           : (sec: number) => void;
}


// ================================================================================
// Display the transcript (sorted messages with highlighted word IDs)
// ================================================================================
export default function PlaybackTranscript({ messages, biomarkers, sessionStartMs, currentTime, selectedBiomarker, userName, onSeek }: Props) {

    // Map of word/message IDs -> most-severe biomarker score (re-computed only when the biomarker selection or data changes)
    // TODO: Actually use the message scores map
    const biomarkerWordScores = useBiomarkerWordScores   (messages, biomarkers, selectedBiomarker, sessionStartMs);
    const biomarkerMsgsScores = useBiomarkerMessageScores(messages, biomarkers, selectedBiomarker, sessionStartMs);

    // Sort the messages and display; including the list of words to highlight
    const sorted = [...messages].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    return (
        <div className={`${blockStyle} overflow-y-auto`}>
            {sorted.map(msg => (
                <UtteranceLine
                    key                ={msg.id}
                    msg                ={msg}
                    userName           ={userName}
                    sessionStartMs     ={sessionStartMs}
                    currentTime        ={currentTime}
                    biomarkerWordScores={biomarkerWordScores}
                    onSeek             ={onSeek}
                />
            ))}
        </div>
    );
}
