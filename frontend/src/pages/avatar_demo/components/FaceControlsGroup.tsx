/* Demo controls for the avatars' optional handle methods.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/FaceControlsGroup`

Conversation state, gaze, the mouth (simulated talking, a manual level, and
the sample spoken reply: on its own or after a simulated "user just finished"
think, with an extra sentence-break pause and its current speech phase), and
sleep. Each section shows only when the selected avatar lists that feature, so
the clip-based robots never show controls they would ignore. Under the avatar
the panel is wide, so the sections sit side by side (sleep under the
conversation state).

*/
import type { ChangeEvent, ReactElement } from "react";

// From this project
import      { btnClass, buttonSectionHeader, groupDivStyle          } from "@/hooks/chat-listener/chat-controls/styles";
import type { AvatarFeature, ConversationState, SpeechPhase         } from "@/pages/common/avatar/avatarRegistry";
import type { GazePoint                                             } from "./GazePad";
import        GazePad                                                 from "./GazePad";

// Conversation states in button order
const DEMO_CONVERSATION_STATES: ConversationState[] = ["idle", "listening", "thinking", "speaking"];

// Each section's small label
const DEMO_SECTION_LABEL = "text-xs opacity-60";

// Seconds of silence the picker can add to the sample reply's sentence break
const DEMO_EXTRA_PAUSE_OPTIONS_SEC = [0, 0.25, 0.50, 1];


// ================================================================================
// Face Controls
// ================================================================================
// Buttons, a gaze pad, mouth controls, and sleep buttons for the features the avatar supports
export default function FaceControlsGroup({features, conversationState, onConversationState, gazePoint, onGaze, onClearGaze, talking, onTalkingChange, mouthLevel, onMouthLevel, replyPlaying, onPlayReply, onPlayTurn, extraPauseSec, onExtraPause, speechPhase, asleep, onAsleepChange}: {
    // Which sections to show
    features : AvatarFeature[];   // Optional handle methods the avatar implements

    // Conversation state
    conversationState   : ConversationState;                    // State sent last
    onConversationState : (state: ConversationState) => void;   // Send a new state

    // Gaze
    gazePoint   : GazePoint | null;                 // Point sent last (null while gaze is automatic)
    onGaze      : (x: number, y: number) => void;   // Point the eyes somewhere
    onClearGaze : () => void;                       // Go back to automatic gaze

    // Mouth
    talking         : boolean;                      // Simulated speech is running
    onTalkingChange : (talking: boolean) => void;   // Start or stop simulated speech
    mouthLevel      : number;                       // Manual voice level, 0 to 1
    onMouthLevel    : (level: number) => void;      // Set the manual voice level

    // Sample spoken reply
    replyPlaying  : boolean;                   // The sample reply's audio is playing
    onPlayReply   : () => void;                // Play it from the start
    onPlayTurn    : () => void;                // Think for a moment as if the user just finished, then play it
    extraPauseSec : number;                    // Silence added to its sentence break
    onExtraPause  : (sec: number) => void;     // Choose that silence
    speechPhase   : SpeechPhase;               // Where the avatar is in it ("none" when not speaking)

    // Sleep
    asleep         : boolean;                     // The avatar was last sent to sleep
    onAsleepChange : (asleep: boolean) => void;   // Send it to sleep, or wake it up
}): ReactElement {
    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Face Controls</div>

            <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-[minmax(11rem,1fr)_auto_minmax(0,1.3fr)]">
                {/* Conversation state with sleep under it */}
                <div className="flex flex-col gap-4">
                    {/* -------------------------------------------------------------------------------- */}
                    {/* Conversation State */}
                    {/* -------------------------------------------------------------------------------- */}
                    {features.includes("conversationState") ? (
                        <div>
                            <div className={DEMO_SECTION_LABEL}>Conversation state</div>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                {DEMO_CONVERSATION_STATES.map((state: ConversationState) => (
                                    <button
                                        key       = {state}
                                        className = {btnClass(false, (state === conversationState) ? "primary" : "secondary")}
                                        onClick   = {() => onConversationState(state)}
                                    >
                                        {state}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Sleep */}
                    {/* -------------------------------------------------------------------------------- */}
                    {features.includes("sleep") ? (
                        <div>
                            <div className={DEMO_SECTION_LABEL}>Sleep (while a chat is stopped)</div>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                <button className={btnClass(false, asleep ? "primary"   : "secondary")} onClick={() => onAsleepChange(true )}>Sleep</button>
                                <button className={btnClass(false, asleep ? "secondary" : "primary"  )} onClick={() => onAsleepChange(false)}>Wake up</button>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Gaze */}
                {/* -------------------------------------------------------------------------------- */}
                {features.includes("gaze") ? (
                    <div>
                        <div className={DEMO_SECTION_LABEL}>Gaze (click or drag)</div>
                        <div className="mt-1 flex items-start gap-3">
                            <GazePad point={gazePoint} onGaze={onGaze} />
                            <div className="flex flex-col gap-2">
                                <button className={btnClass(false, "secondary")} onClick={() => onGaze(0, 0)}>Center</button>
                                <button className={btnClass(false, (gazePoint === null) ? "primary" : "secondary")} onClick={onClearGaze}>Auto</button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* -------------------------------------------------------------------------------- */}
                {/* Mouth */}
                {/* -------------------------------------------------------------------------------- */}
                {features.includes("speechLevel") ? (
                    <div>
                        <div className={DEMO_SECTION_LABEL}>Mouth</div>
                        <div className="mt-1 flex flex-col gap-2">
                            {/* The sample reply runs the real audio path (mouth and speech gaze) */}
                            <div className="grid grid-cols-2 gap-2">
                                <button className={btnClass(false, replyPlaying ? "primary" : "secondary")} onClick={onPlayReply}>
                                    {replyPlaying ? "Playing sample reply..." : "Play sample reply"}
                                </button>
                                <button className={btnClass(false, "secondary")} onClick={onPlayTurn}>Think, then reply</button>
                            </div>

                            {/* Extra silence in the reply's sentence break */}
                            <div>
                                <div className="text-xs opacity-70">Extra pause at the sentence break</div>
                                <div className="mt-1 grid grid-cols-4 gap-2 whitespace-nowrap">
                                    {DEMO_EXTRA_PAUSE_OPTIONS_SEC.map((sec: number) => (
                                        <button
                                            key       = {sec}
                                            className = {btnClass(false, (sec === extraPauseSec) ? "primary" : "secondary")}
                                            onClick   = {() => onExtraPause(sec)}
                                        >
                                            +{sec} s
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {features.includes("speechGaze") ? (
                                <div className="text-xs opacity-70">Speech phase: <b>{speechPhase}</b></div>
                            ) : null}

                            {/* Simulated syllables, or a fixed level */}
                            <div className="flex items-center gap-3">
                                <button className={btnClass(false, talking ? "primary" : "secondary")} onClick={() => onTalkingChange(!talking)}>
                                    {talking ? "Stop talking" : "Simulate talking"}
                                </button>
                                <input
                                    type       = "range"
                                    className  = "min-w-0 flex-1"
                                    aria-label = "Voice level"
                                    min        = {0}
                                    max        = {1}
                                    step       = {0.05}
                                    value      = {mouthLevel}
                                    disabled   = {talking}
                                    onChange   = {(event: ChangeEvent<HTMLInputElement>) => onMouthLevel(Number(event.target.value))}
                                />
                            </div>
                        </div>
                    </div>
                ) : null}

            </div>
        </div>
    );
}
