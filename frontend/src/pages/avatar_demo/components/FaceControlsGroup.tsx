/* Demo controls for the avatars' optional handle methods.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/FaceControlsGroup`

Conversation state, gaze, the mouth's voice level, and sleep. Each section
shows only when the selected avatar lists that feature, so the clip-based
robots never show controls they would ignore.

*/
import type { ChangeEvent, ReactElement } from "react";

// From this project
import      { btnClass, buttonSectionHeader, groupDivStyle } from "@/hooks/chat-listener/chat-controls/styles";
import type { AvatarFeature, ConversationState             } from "@/pages/common/avatar/avatarRegistry";
import type { GazePoint                                    } from "./GazePad";
import        GazePad                                        from "./GazePad";

// Conversation states in button order
const DEMO_CONVERSATION_STATES: ConversationState[] = ["idle", "listening", "thinking", "speaking"];


// ================================================================================
// Face Controls
// ================================================================================
// Buttons, a gaze pad, a mouth slider, and sleep buttons for the features the avatar supports
export default function FaceControlsGroup({features, conversationState, onConversationState, gazePoint, onGaze, onClearGaze, talking, onTalkingChange, mouthLevel, onMouthLevel, asleep, onAsleepChange}: {
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

    // Sleep
    asleep         : boolean;                     // The avatar was last sent to sleep
    onAsleepChange : (asleep: boolean) => void;   // Send it to sleep, or wake it up
}): ReactElement {
    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Face Controls</div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Conversation State */}
            {/* -------------------------------------------------------------------------------- */}
            {features.includes("conversationState") ? (
                <>
                    <div className="mt-2 text-xs opacity-60">Conversation state</div>
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
                </>
            ) : null}

            {/* -------------------------------------------------------------------------------- */}
            {/* Gaze */}
            {/* -------------------------------------------------------------------------------- */}
            {features.includes("gaze") ? (
                <>
                    <div className="mt-3 text-xs opacity-60">Gaze (click or drag on the pad)</div>
                    <div className="mt-1 flex items-start gap-3">
                        <GazePad point={gazePoint} onGaze={onGaze} />
                        <div className="flex flex-col gap-2">
                            <button className={btnClass(false, "secondary")} onClick={() => onGaze(0, 0)}>Center</button>
                            <button className={btnClass(false, (gazePoint === null) ? "primary" : "secondary")} onClick={onClearGaze}>Auto</button>
                        </div>
                    </div>
                </>
            ) : null}

            {/* -------------------------------------------------------------------------------- */}
            {/* Mouth */}
            {/* -------------------------------------------------------------------------------- */}
            {features.includes("speechLevel") ? (
                <>
                    <div className="mt-3 text-xs opacity-60">Mouth (voice level)</div>
                    <div className="mt-1 flex items-center gap-3">
                        <button className={btnClass(false, talking ? "primary" : "secondary")} onClick={() => onTalkingChange(!talking)}>
                            {talking ? "Stop talking" : "Simulate talking"}
                        </button>
                        <input
                            type      = "range"
                            className = "flex-1"
                            min       = {0}
                            max       = {1}
                            step      = {0.05}
                            value     = {mouthLevel}
                            disabled  = {talking}
                            onChange  = {(event: ChangeEvent<HTMLInputElement>) => onMouthLevel(Number(event.target.value))}
                        />
                    </div>
                </>
            ) : null}

            {/* -------------------------------------------------------------------------------- */}
            {/* Sleep */}
            {/* -------------------------------------------------------------------------------- */}
            {features.includes("sleep") ? (
                <>
                    <div className="mt-3 text-xs opacity-60">Sleep (the chat page dozes the avatar off while the chat is stopped)</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        <button className={btnClass(false, asleep ? "primary"   : "secondary")} onClick={() => onAsleepChange(true )}>Sleep</button>
                        <button className={btnClass(false, asleep ? "secondary" : "primary"  )} onClick={() => onAsleepChange(false)}>Wake up</button>
                    </div>
                </>
            ) : null}
        </div>
    );
}
