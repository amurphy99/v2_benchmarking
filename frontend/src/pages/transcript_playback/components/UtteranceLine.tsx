/*
Display row for ChatMessages w audio playback controls & biomarker highlights.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/UtteranceLine`

If we have word-level timestamps (showWordLevel = true), then we can make the 
highlights have word-level detail. If not, we just use the full message text and
starting/ending timestamps for the span. 

TODO: Find a way to also map the capital letters back
TODO: When done, move that method and getPunctSuffixes to a separate file in the utils directory
TODO: Change the icons? There is that one nice user one w the circle built in

TODO: Move the WordSegment stuff and the getPunctSuffixes stuff to a separate file

*/
import { FaUser  } from "react-icons/fa";
import { BsRobot } from "react-icons/bs";

// From this project
import { ChatMessage, ChatWord, ChatBiomarkerScore } from "@/api";
import { PATIENT_HEX, CAREGIVER_HEX                } from "@/utils/styling/colors";
import { formatElapsedMessage                      } from "@/utils/styling/numFormatting";
import   WordSpan                                    from "./WordSpan";
import   BiomarkerGroup                              from "./BiomarkerGroup";

interface Props {
    msg                : ChatMessage;
    userName           : string;
    sessionStartMs     : number;
    currentTime        : number;
    biomarkerWordScores: Map<number, ChatBiomarkerScore>; // word ID -> associated biomarker score object
    onSeek             : (sec: number) => void;
}

// --------------------------------------------------------------------------------
// "Segment" => consecutive words sharing the same biomarker window (or none)
// --------------------------------------------------------------------------------
type WordSegment = { biomarker: ChatBiomarkerScore | null; words: ChatWord[] };

// Build WordSegments for the given list of ChatWords
function buildSegments(words: ChatWord[], scores: Map<number, ChatBiomarkerScore>): WordSegment[] {
    const segments: WordSegment[] = [];
    let current: WordSegment | null = null;
    for (const word of words) {
        // Use the map of word -> ChatBiomarkerScore object to group all words for each biomarker
        const bm     = scores.get(word.id)    ?? null;
        const bmId   = bm?.id                 ?? null;
        const prevId = current?.biomarker?.id ?? null;

        if (!current || bmId !== prevId) { current = { biomarker: bm, words: [word] }; segments.push(current); } 
        else                             { current.words.push(word); }
    }
    return segments;
}

// --------------------------------------------------------------------------------
// Try to map utterance punctuation to the individual words
// --------------------------------------------------------------------------------
function getPunctSuffixes(words: ChatWord[], content: string): (string | null)[] {
    // Match a word token followed by any non-word, non-space characters (punctuation)
    const regex  = /([A-Za-z0-9']+)([^A-Za-z0-9'\s]*)/g;
    const tokens: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) tokens.push(m[2]);
    if (tokens.length !== words.length) return words.map(() => null);
    return tokens.map(t => t || null);
}

// ================================================================================
// Message/Utterance Display Row
// ================================================================================
export default function UtteranceLine({ msg, userName, sessionStartMs, currentTime, biomarkerWordScores, onSeek }: Props) {
    const isUser = msg.role === "user";
    const name   = isUser ? userName : "Cognibot";

    // Show word-level detail for user messages that have word timestamps
    const showWordLevel = isUser && ((msg.words?.length ?? 0) > 0);

    // Elapsed time from session start (shown next to speaker name)
    const elapsedStart = formatElapsedMessage(sessionStartMs, msg.start_ts)
    const elapsedEnd   = formatElapsedMessage(sessionStartMs, msg.  end_ts)

    // --------------------------------------------------------------------------------
    // Word-Level Content (with biomarker grouping)
    // --------------------------------------------------------------------------------
    // No gap in the x axis ("gap-x-1") because I insert a space before the words
    const puncts = showWordLevel ? getPunctSuffixes(msg.words!, msg.content) : [];

    // Build a flat index map so we can look up each word's punct by word.id
    const punctByWordId = new Map<number, string | null>();
    if (showWordLevel) {
        msg.words!.forEach((w, i) => punctByWordId.set(w.id, puncts[i] ?? null));
    }

    const wordContent = showWordLevel && (
        <div className="flex flex-wrap gap-y-1 fs-5">
            {buildSegments(msg.words!, biomarkerWordScores).map((seg, si) => {

                // WordSpans
                const spans = seg.words.map(word => (
                    <WordSpan
                        key           ={word.id}
                        word          ={word}
                        sessionStartMs={sessionStartMs}
                        currentTime   ={currentTime}
                        biomarkerScore={seg.biomarker?.score       ?? null}
                        punct         ={punctByWordId.get(word.id) ?? null}
                        onSeek        ={onSeek}
                    />
                ));
                
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
        start_ts : msg.start_ts,
        end_ts   : msg.  end_ts,
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
                    <span className="text-gray-400 text-sm">{elapsedStart} - {elapsedEnd}</span>
                </div>
                {showWordLevel ? wordContent : fallbackContent}
            </div>

        </div>
    );
}
