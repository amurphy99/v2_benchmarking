import { FaUser  } from "react-icons/fa";
import { BsRobot } from "react-icons/bs";

// From this project
import { ChatMessage                   } from "@/api";
import { PATIENT_HEX, CAREGIVER_HEX    } from "@/utils/styling/colors";
import WordSpan                          from "./WordSpan";

interface Props {
    msg             : ChatMessage;
    userName        : string;
    sessionStartMs  : number;
    currentTime     : number;
    biomarkerWordIds: Set<number>;
    onSeek          : (sec: number) => void;
}

// --------------------------------------------------------------------------------
// Message/Utterance Display Row (renders word spans if available)
// --------------------------------------------------------------------------------
export default function UtteranceLine({ msg, userName, sessionStartMs, currentTime, biomarkerWordIds, onSeek }: Props) {
    const isUser = msg.role === "user";
    const name   = isUser ? userName : "Cognibot";

    // If word-level data is available, render each word as a clickable span; otherwise fall back to the full message text
    const content = msg.words && msg.words.length > 0
        ? (
            <div className="flex flex-wrap gap-x-1 gap-y-1 fs-5">
                {msg.words.map(word => (
                    <WordSpan
                        key           ={word.id}
                        word          ={word}
                        sessionStartMs={sessionStartMs}
                        currentTime   ={currentTime}
                        isInBiomarker ={biomarkerWordIds.has(word.id)}
                        onSeek        ={onSeek}
                    />
                ))}
            </div>
        )
        : <div className="fs-5">{msg.content}</div>;

    // Display all messages for both
    return (
        <div className="flex my-[1rem]">

            {/* User Icon */}
            <div className="mr-[0.75rem] flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-gray-200">
                {isUser
                    ? <FaUser  size={25} color={  PATIENT_HEX} />
                    : <BsRobot size={25} color={CAREGIVER_HEX} />
                }
            </div>
            
            {/* Message Display (list of WordSpans) */}
            <div className="flex flex-col w-full">
                <div className="h-9 flex items-center gap-[0.75rem] fs-5">
                    <span className="fw-bold">{name}</span>
                </div>
                {content}
            </div>

        </div>
    );
}
