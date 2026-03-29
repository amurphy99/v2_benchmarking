/* 
Display row for ChatMessages w audio playback controls & biomarker highlights.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/UtteranceLine`

If we have word-level timestamps (showWordLevel = true), then we can make the 
highlights have word-level detail. If not, we just use the full message text and
starting/ending timestamps for the span. 

TODO: Find a way to also map the capital letters back
TODO: When done, move that method and getPunctSuffixes to a separate file in the utils directory

TODO: Decide if I care about having the CogniBot responses highlighted or not 
      (right now I never incldue word timestamps for that)

TODO: Change the icons? There is that one nice user one w the circle built in

*/
import { FaUser  } from "react-icons/fa";
import { BsRobot } from "react-icons/bs";

// From this project
import { ChatMessage, ChatWord      } from "@/api";
import { PATIENT_HEX, CAREGIVER_HEX } from "@/utils/styling/colors";
import   WordSpan                     from "./WordSpan";

interface Props {
    msg                : ChatMessage;
    userName           : string;
    sessionStartMs     : number;
    currentTime        : number;
    biomarkerWordScores: Map<number, number>; // word ID -> related biomarker score (0=worst possible, 1=best possible)
    onSeek             : (sec: number) => void;
}

// --------------------------------------------------------------------------------
// Try to map utterance punctuation to the individual words
// --------------------------------------------------------------------------------
// Tokenize the utterance content string and return the trailing punctuation for
// each word position. Returns null for each position if the token count doesn't
// match the word count (e.g. numbers written as digits vs. spelled-out words).
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

    // Show word-level detail if there are words AND if they are the user
    const showWordLevel = isUser && ((msg.words?.length ?? 0) > 0);

    // --------------------------------------------------------------------------------
    // Word-Level Content
    // --------------------------------------------------------------------------------
    // No gap in the x axis ("gap-x-1") because I insert a space before the words
    const puncts = showWordLevel ? getPunctSuffixes(msg.words!, msg.content) : [];
    const wordContent = showWordLevel && (
        <div className="flex flex-wrap gap-y-1 fs-5">
            {msg.words!.map((word, i) => (
                <WordSpan
                    key           ={word.id}
                    word          ={word}
                    sessionStartMs={sessionStartMs}
                    currentTime   ={currentTime}
                    biomarkerScore={biomarkerWordScores.get(word.id) ?? null}
                    punct         ={puncts[i] ?? null}
                    onSeek        ={onSeek}
                />
            ))}
        </div>
    );

    // --------------------------------------------------------------------------------
    // Message-Level Fallback 
    // --------------------------------------------------------------------------------
    // Make a fake "ChatWord" instance where the "word" is the full message text (leave "confidence" out)
    const messageAsWord: ChatWord = {
        id       : msg.id + 10_000, // Can't think of a good way to come up with this / make sure it doesn't overlap
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
        <div className="flex my-[1rem]">

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
                </div>
                {showWordLevel ? wordContent : fallbackContent}
            </div>

        </div>
    );
}
