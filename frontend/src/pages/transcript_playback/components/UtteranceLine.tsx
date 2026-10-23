/* Display row for ChatMessages w audio playback controls & biomarker highlights.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/UtteranceLine.tsx`

If we have word-level timestamps (showWordLevel = true), then we can make the 
highlights have word-level detail. If not, we just use the full message text and
starting/ending timestamps for the span. 

Biomarker segments are rendered inline (not as flex items) so a long sentence
wraps word-by-word naturally instead of breaking on biomarker boundaries.

TODO: I still think there could be some bugs here, but idk this is enough for
      now. This whole setup was pretty tough to get working...
*/
import { FaUser  } from "react-icons/fa";
import { BsRobot } from "react-icons/bs";

// From this project
import { ChatMessage, ChatWord, ChatBiomarkerScore                        } from "@/api";
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
    isActiveLine      ?: boolean;
    words             ?: ChatWord[]; // Subset of msg.words to render (for gap-split pieces); defaults to all words
}

// ================================================================================
// Message/Utterance Display Row
// ================================================================================
export default function UtteranceLine({ msg, userName, sessionStartMs, currentTime, biomarkerWordScores, onSeek, isActiveLine, words }: Props) {
    const isUser = msg.role === "user";
    const name   = isUser ? userName : "Cognibot";

    // Words to actually render this row (a gap-split slice, or all of them).
    // Sometimes we split full text from a single 'ChatMessage' into to "messages" 
    // in the transcript view if there was a gap long enough (e.g., longer than 
    // 1.5 seconds between words).
    const renderWords = words ?? msg.words ?? [];

    // Show word-level detail for user messages that have word timestamps
    const showWordLevel = isUser && (renderWords.length > 0);

    // Per-row wall-clock span. For word-level rows use the rendered slice's own
    // bounds (so split pieces show their own time range); otherwise fall back to
    // the message-level span (words -> msg.start_ts/end_ts -> msg.ts).
    const span = showWordLevel
        ? { start: renderWords[0].start_ts, end: renderWords[renderWords.length - 1].end_ts }
        : getMessageTimespan(msg);
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

    // Inline flow (no flex) so word-wrap happens naturally and biomarker boundaries don't force line breaks.
    // NOTE: punct/cap maps above are keyed by word.id from the FULL message, so
    // rendering only a gap-split slice (renderWords) still resolves correctly.
    const wordContent = showWordLevel && (
        <div className="leading-relaxed">
            {buildSegments(renderWords, biomarkerWordScores).map((seg, si) => {

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
    // Check if the message ends with a punctuation mark (. ! ?)
    const match = msg.content.match(/(.*)([.!?]+)$/);
    const cleanWordText  = match ? match[1] : msg.content;
    const extractedPunct = match ? match[2] : null;

    // Make a fake "ChatWord" instance where the "word" is the full message text (leave "confidence" out)
    const messageAsWord: ChatWord = {
        id       : msg.id + 10_000, // Can't think of a good way to come up with a new ID/make sure it doesn't overlap
        word     : cleanWordText,
        start_ts : span.start,
        end_ts   : span.end,
        index    : 0,
    };

    // HTML for the fallback
    const fallbackContent = !showWordLevel && (
        <div className="leading-relaxed">
            <WordSpan
                key           ={msg.id}
                word          ={messageAsWord}
                sessionStartMs={sessionStartMs}
                currentTime   ={currentTime}
                biomarkerScore={null}
                punct         ={extractedPunct}
                onSeek        ={onSeek}
            />
        </div>
    );

    // Distinct styling for each speaker type (user vs. assistant)
    const containerClass = isUser ? "border-l-2 border-admin-borderStrong pl-4" : "pl-12";
    const textSize       = isUser ? "text-[1.0625rem]"                          : "text-base";
    const nameClass      = isUser ? "font-semibold text-admin-text text-base"   : "font-medium text-admin-accent text-sm";
    const tsClass        = isUser ? "text-xs text-admin-subtext"                : "text-xs text-admin-subtext italic";


    // --------------------------------------------------------------------------------
    // Final UI Component
    // --------------------------------------------------------------------------------
    return (
        <div className={`relative flex gap-3 items-start ${containerClass}`}>
            {/* Active-line caret in the left margin */}
            {isActiveLine && (
                <span
                    aria-hidden = "true"
                    className   = "absolute -left-5 top-3 text-admin-accent text-lg leading-none transition-all duration-150"
                >
                    ▸
                </span>
            )}

            {/* Speaker icon */}
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-admin-muted" : "bg-admin-accentSoft"}`}>
                {isUser
                    ? <FaUser  size={26} className="text-admin-subtext" />
                    : <BsRobot size={26} className="text-admin-accent2"  />
                }
            </div>

            {/* Message content */}
            <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-baseline gap-3 mb-1">
                    <span className={nameClass}>{name}</span>
                    <span className={tsClass}>{elapsedRange}</span>
                </div>
                <div className={textSize}>
                    {showWordLevel ? wordContent : fallbackContent}
                </div>
            </div>

        </div>
    );
}
