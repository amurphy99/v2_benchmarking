/*
Display row for ChatMessages w audio playback controls & biomarker highlights.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/UtteranceLine`

If we have word-level timestamps (showWordLevel = true), then we can make the 
highlights have word-level detail. If not, we just use the full message text and
starting/ending timestamps for the span. 

TODO: Change the icons? There is that one nice user one w the circle built in

*/
import { FaUser  } from "react-icons/fa";
import { BsRobot } from "react-icons/bs";

// From this project
import { ChatMessage, ChatWord, ChatBiomarkerScore                        } from "@/api";
import { PATIENT_HEX, CAREGIVER_HEX                                       } from "@/utils/styling/colors";
import { formatElapsedMessageRange                                        } from "@/utils/styling/numFormatting";
import { getMessageTimespan, getPunctSuffixes, getCapFlags, buildSegments } from "./../utils/utteranceFormatting";
import   WordSpan                                                           from "./WordSpan";
import   BiomarkerGroup                                                     from "./BiomarkerGroup";

interface Props {
    msg                : ChatMessage;
    userName           : string;
    sessionStartMs     : number;
    currentTime        : number;
    biomarkerWordScores: Map<number, ChatBiomarkerScore>; // word ID -> associated biomarker score object
    onSeek             : (sec: number) => void;
}

// ================================================================================
// Message/Utterance Display Row
// ================================================================================
export default function UtteranceLine({ msg, userName, sessionStartMs, currentTime, biomarkerWordScores, onSeek }: Props) {
    const isUser = msg.role === "user";
    const name   = isUser ? userName : "Cognibot";

    // Show word-level detail for user messages that have word timestamps
    const showWordLevel = isUser && ((msg.words?.length ?? 0) > 0);

    // Per-message wall-clock span (words -> msg.start_ts/end_ts -> msg.ts)
    const span         = getMessageTimespan(msg);
    const elapsedRange = formatElapsedMessageRange(sessionStartMs, span.start, span.end);

    // --------------------------------------------------------------------------------
    // Word-Level Content (with biomarker grouping)
    // --------------------------------------------------------------------------------
    // No gap in the x axis ("gap-x-1") because I insert a space before the words
    const puncts = showWordLevel ? getPunctSuffixes(msg.words!, msg.content) : [];

    // Build a flat index map so we can look up each word's punctuation by word.id
    const punctByWordId = new Map<number, string | null>();
    if (showWordLevel) { msg.words!.forEach((w, i) => punctByWordId.set(w.id, puncts[i] ?? null)); }

    // Capitalization flags derived from original content (first word, post-sentence, standalone "I")
    const caps        = showWordLevel ? getCapFlags(msg.words!, msg.content) : [];
    const capByWordId = new Map<number, boolean>();
    if (showWordLevel) { msg.words!.forEach((w, i) => capByWordId.set(w.id, caps[i] ?? false)); }

    const wordContent = showWordLevel && (
        <div className="flex flex-wrap gap-y-1 fs-5">
            {buildSegments(msg.words!, biomarkerWordScores).map((seg, si) => {

                // WordSpans
                const spans = seg.words.map(word => {
                    const cap = capByWordId.get(word.id) ?? false;
                    const displayWord = cap
                        ? { ...word, word: word.word.charAt(0).toUpperCase() + word.word.slice(1) }
                        : word;
                    return (
                        <WordSpan
                            key           ={word.id}
                            word          ={displayWord}
                            sessionStartMs={sessionStartMs}
                            currentTime   ={currentTime}
                            biomarkerScore={seg.biomarker?.score       ?? null}
                            punct         ={punctByWordId.get(word.id) ?? null}
                            onSeek        ={onSeek}
                        />
                    );
                });
                
                // BiomarkerGroup (popup on hover)
                if (seg.biomarker) {
                    return (
                        <BiomarkerGroup key={si} biomarker={seg.biomarker} sessionStartMs={sessionStartMs}>
                            {spans}
                        </BiomarkerGroup>
                    );
                }
                return <span key={si}>{spans}</span>;
            })}
        </div>
    );

    // --------------------------------------------------------------------------------
    // Message-Level Fallback
    // --------------------------------------------------------------------------------
    // Make a fake "ChatWord" instance where the "word" is the full message text (leave "confidence" out)
    const messageAsWord: ChatWord = {
        id       : msg.id + 10_000, // Can't think of a good way to come up with a new ID/make sure it doesn't overlap
        word     : msg.content,
        start_ts : span.start,
        end_ts   : span.end,
        index    : 0,
    };

    // HTML for the fallback
    const fallbackContent = !showWordLevel && (
        <div className="flex flex-wrap gap-x-1 gap-y-1 fs-5">
            <WordSpan
                key           ={msg.id}
                word          ={messageAsWord}
                sessionStartMs={sessionStartMs}
                currentTime   ={currentTime}
                biomarkerScore={null}
                punct         ={null}
                onSeek        ={onSeek}
            />
        </div>
    );

    // --------------------------------------------------------------------------------
    // Final UI Component
    // --------------------------------------------------------------------------------
    return (
        <div className="flex my-[1.0rem]">

            {/* Speaker icon */}
            <div className="mr-[0.75rem] flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-gray-200">
                {isUser
                    ? <FaUser  size={25} color={  PATIENT_HEX} />
                    : <BsRobot size={25} color={CAREGIVER_HEX} />
                }
            </div>

            {/* Message content */}
            <div className="flex flex-col w-full">
                <div className="h-9 flex items-center gap-[0.75rem] fs-5">
                    <span className="fw-bold">{name}</span>
                    <span className="text-gray-400 text-sm">{elapsedRange}</span>
                </div>
                {showWordLevel ? wordContent : fallbackContent}
            </div>

        </div>
    );
}
