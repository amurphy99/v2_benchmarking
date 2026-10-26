/* Public demo page for trying every avatar's behaviors without a live chat.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/AvatarDemo`

Pick an avatar, then trigger its emotions and animations with the same buttons
the AdminChat panel shows (`AvatarActionsGroup`, fed by the same capability
profile). Each button hands a `RobotAction` straight to the avatar's
`performAction`, the same path a live chat's `robot_action` frames take, so a
behavior that works here works in a chat. Avatars with optional features (gaze,
conversation state, speech level, sleep) also get the face controls.

For tuning one face, the URL can pick the avatar and hold a face from the start
(`/avatar-demo?avatar=smiley&face=Ponder`), so a reload after an edit
lands right back on it.

NOTE: `AvatarActionsGroup` and `AdminPage` stay in `pages/admin/` even though
      this page uses them too (an agreed exception to moving shared UI into
      `components/`).

*/
import type { ReactElement                } from "react";
import      { useEffect, useRef, useState } from "react";
import      { useSearchParams             } from "react-router-dom";
import        toast                         from "react-hot-toast";

// From this project
import      { btnClass, groupDivStyle                                   } from "@/hooks/chat-listener/chat-controls/styles";
import      { useAudioPlayer                                            } from "@/hooks/live-chat/useAudioPlayer";
import      { getCapabilityProfile                                      } from "@/pages/admin/capabilities/profiles";
import        AvatarActionsGroup                                          from "@/pages/admin/components/controlGroups/AvatarActionsGroup";
import      { AdminPage                                                 } from "@/pages/admin/components/ui/AdminPage";
import      { Avatar                                                    } from "@/pages/common/avatar/Avatar";
import type { AvatarHandle, ConversationState, RobotAction, SpeechPhase } from "@/pages/common/avatar/avatarRegistry";
import      { getAvatarEntry                                            } from "@/pages/common/avatar/avatarRegistry";
import      { useSpeakingAvatar                                         } from "@/pages/common/avatar/useSpeakingAvatar";
import type { LoggedAction                                              } from "./components/ActionLog";
import        ActionLog                                                   from "./components/ActionLog";
import        DemoSetupGroup                                              from "./components/DemoSetupGroup";
import        DemoSetupModal                                              from "./components/DemoSetupModal";
import        FaceControlsGroup                                           from "./components/FaceControlsGroup";
import type { GazePoint                                                 } from "./components/GazePad";
import      { DEMO_DEFAULT_DURATION_MS                                  } from "./utils/durationOptions";
import      { useSampleReply                                            } from "./utils/useSampleReply";
import      { useSimulatedSpeech                                        } from "./utils/useSimulatedSpeech";
import      { useSimulatedTurn                                          } from "./utils/useSimulatedTurn";

// Avatar shown when the page opens
const DEMO_DEFAULT_AVATAR_ID = "smiley";

// Most actions the log keeps
const DEMO_LOG_LENGTH = 10;

// Commands "Think, then reply" sends when the reply's text arrives (each sent and logged on its own): a nod at its own
// length, and a smile held until this far into the speech, then back to Neutral
const DEMO_REPLY_CUES = [
    {kind: "animation", value: "Nod",          intoSpeechMs: null },
    {kind: "emotion",   value: "Smiling Face", intoSpeechMs: 1_500},
];


// Resting face an avatar starts on (its first option; empty for avatars without a resting picker)
function defaultResting(avatarId: string): string {
    const options = getAvatarEntry(avatarId).restingOptions;
    return (options.length > 0) ? options[0].value : "";
}


// ================================================================================
// Avatar Demo
// ================================================================================
// Show one avatar beside every control it supports
export function AvatarDemo(): ReactElement {
    // Optional starting avatar and held face from the URL (unknown avatars fall back like any model choice)
    const [searchParams] = useSearchParams();
    const startAvatarId  = getAvatarEntry(searchParams.get("avatar") ?? DEMO_DEFAULT_AVATAR_ID).id;
    const startFace      = searchParams.get("face");

    // Selected avatar, the hold time every action sends (held when the URL names a face), and the actions sent so far
    const [avatarId,   setAvatarId  ] = useState<string>(startAvatarId);
    const [durationMs, setDurationMs] = useState<number | null>((startFace === null) ? DEMO_DEFAULT_DURATION_MS : null);
    const [log,        setLog       ] = useState<LoggedAction[]>([]);
    const avatarRef = useRef<AvatarHandle>(null);
    const logIdRef  = useRef<number>(0);

    // Face inputs the page drives (a newly picked avatar starts from these defaults too)
    const [restingExpression, setRestingExpression] = useState<string>(defaultResting(startAvatarId));
    const [conversationState, setConversationState] = useState<ConversationState>("idle");
    const [gazePoint,         setGazePoint        ] = useState<GazePoint | null>(null);
    const [talking,           setTalking          ] = useState<boolean>(false);
    const [mouthLevel,        setMouthLevel       ] = useState<number>(0);
    const [asleep,            setAsleep           ] = useState<boolean>(false);

    // Whether the Demo Setup modal is open
    const [setupOpen, setSetupOpen] = useState<boolean>(false);

    // What the selected avatar can do (the admin panel resolves the same profile)
    const entry        = getAvatarEntry(avatarId);
    const capabilities = getCapabilityProfile("webapp", avatarId);

    // Feed simulated speech into the avatar's mouth while "talking" is on
    useSimulatedSpeech(talking, (level: number): void => { avatarRef.current?.setSpeechLevel?.(level); });

    // The sample spoken reply plays through a live chat's audio player, which drives the mouth and the speech gaze
    const [speechPhase,   setSpeechPhase  ] = useState<SpeechPhase>("none");
    const [extraPauseSec, setExtraPauseSec] = useState<number>(0);   // Silence added to the reply's sentence break
    const player          = useAudioPlayer({});
    const playSampleReply = useSampleReply(player.cancelAudio, player.sendAudio);
    useSpeakingAvatar(avatarRef, player, player.systemSpeaking, true, setSpeechPhase);

    // Close the audio timeline when the page goes away
    const stopPlayer = player.stopPlayer;
    useEffect(() => stopPlayer, [stopPlayer]);

    // Hold the URL's face once the avatar is up (a 3D robot still loading its model ignores it)
    useEffect(() => {
        if (startFace !== null) avatarRef.current?.performAction({kind: "emotion", value: startFace});
    }, [startFace]);

    // --------------------------------------------------------------------------------
    // Robot Actions
    // --------------------------------------------------------------------------------
    // Record one action at the top of the log
    const logAction = (action: RobotAction): void => {
        const logged: LoggedAction = {...action, id: logIdRef.current, sentAt: Date.now()};
        logIdRef.current += 1;
        setLog((previous: LoggedAction[]) => [logged, ...previous].slice(0, DEMO_LOG_LENGTH));
    };

    // Send an action the way a live chat would (with the chosen `duration_ms`, or none for "Hold", unless it brings its own)
    const sendAction = (kind: string, value: string, holdMs: number | null = durationMs): void => {
        const action: RobotAction = (holdMs === null) ? {kind, value} : {kind, value, duration_ms: holdMs};
        avatarRef.current?.performAction(action);
        logAction(action);
    };

    // Return to Neutral at once
    const resetAvatar = (): void => {
        avatarRef.current?.reset();
        logAction({kind: "reset", value: "Neutral"});
    };

    // Switch avatars (the new one mounts fresh, so the page's inputs go back to their defaults)
    const changeAvatar = (id: string): void => {
        setAvatarId(id);
        setLog([]);
        setRestingExpression(defaultResting(id));
        setConversationState("idle");
        setGazePoint(null);
        setTalking(false);
        setMouthLevel(0);
        setAsleep(false);
        cancelTurn();
        stopPlayer();
    };

    // --------------------------------------------------------------------------------
    // Face Inputs
    // --------------------------------------------------------------------------------
    // Each control updates the page's copy and passes the value to the avatar
    const changeRestingExpression = (value: string): void            => { setRestingExpression(value);  avatarRef.current?.setRestingExpression?.(value); };
    const changeConversationState = (state: ConversationState): void => { setConversationState(state);  avatarRef.current?.setConversationState?.(state); };
    const changeGaze              = (x: number, y: number): void     => { setGazePoint({x, y});         avatarRef.current?.setGaze?.(x, y);               };
    const clearGaze               = (): void                         => { setGazePoint(null);           avatarRef.current?.clearGaze?.();                 };
    const changeMouthLevel        = (level: number): void            => { setMouthLevel(level);         avatarRef.current?.setSpeechLevel?.(level);       };

    // Simulated speech starts and stops with a closed mouth (the slider resets with it)
    const changeTalking = (on: boolean): void => {
        setTalking(on);
        setMouthLevel(0);
    };

    // Play the sample reply from the start with the chosen extra pause (a missing clip shows as a toast)
    const playSample = (freshTimeline: boolean): void => {
        playSampleReply(extraPauseSec, freshTimeline).catch((error: Error) => toast.error(error.message));
    };

    // A simulated turn: think for a moment right after the user's last word, then reply (see `useSimulatedTurn`)
    const prepareToSpeak          = (inMs: number): void => avatarRef.current?.prepareToSpeak?.(inMs);
    const sendReplyCues           = (untilVoiceMs: number): void => DEMO_REPLY_CUES.forEach(({kind, value, intoSpeechMs}) => sendAction(kind, value, (intoSpeechMs === null) ? durationMs : untilVoiceMs + intoSpeechMs));
    const {startTurn, cancelTurn} = useSimulatedTurn(changeConversationState, prepareToSpeak, sendReplyCues, player.cancelAudio, () => playSample(false), player.systemSpeaking);

    // The reply on its own ends any running turn (back to listening, so no "thinking" or "speaking" is left on)
    const playReply = (): void => {
        if (cancelTurn()) changeConversationState("listening");
        playSample(true);
    };

    // Doze the avatar off, or wake it with its yawn (what the chat page does as the chat stops and starts)
    const changeAsleep = (on: boolean): void => {
        setAsleep(on);
        if (on) avatarRef.current?.sleep?.();
        else    avatarRef.current?.wake?.();
    };

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <AdminPage>
            {/* -------------------------------------------------------------------------------- */}
            {/* Page Header */}
            {/* -------------------------------------------------------------------------------- */}
            {/* Title, subtitle, and setup button in one row (a wrapper div pushes the button right) */}
            <div className="pt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                <h1 className="text-2xl font-semibold">Avatar Demo</h1>
                <p className="text-sm text-admin-subtext">Try each avatar's behaviors outside of a live chat.</p>
                <div className="ml-auto">
                    <button className={btnClass(false, "secondary")} onClick={() => setSetupOpen(true)}>Demo Setup</button>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
                {/* -------------------------------------------------------------------------------- */}
                {/* Avatar and Face Controls */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex flex-col gap-4">
                    <div className={`${groupDivStyle} h-[42vh] lg:h-[50vh]`}>
                        <Avatar model={avatarId} zoom="body" ref={avatarRef} />
                    </div>

                    {(entry.features.length > 0) ? (
                        <FaceControlsGroup
                            features            = {entry.features}
                            conversationState   = {conversationState}
                            onConversationState = {changeConversationState}
                            gazePoint           = {gazePoint}
                            onGaze              = {changeGaze}
                            onClearGaze         = {clearGaze}
                            talking             = {talking}
                            onTalkingChange     = {changeTalking}
                            mouthLevel          = {mouthLevel}
                            onMouthLevel        = {changeMouthLevel}
                            replyPlaying        = {player.systemSpeaking}
                            onPlayReply         = {playReply}
                            onPlayTurn          = {startTurn}
                            extraPauseSec       = {extraPauseSec}
                            onExtraPause        = {setExtraPauseSec}
                            speechPhase         = {speechPhase}
                            asleep              = {asleep}
                            onAsleepChange      = {changeAsleep}
                        />
                    ) : null}
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Controls */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex flex-col gap-4">
                    {/* Same buttons as the AdminChat panel (always "connected": nothing goes over a socket) */}
                    <AvatarActionsGroup
                        connected    = {true}
                        capabilities = {capabilities}
                        pending      = {{robot_emotion: false, robot_animation: false}}
                        onEmotion    = {(value: string) => sendAction("emotion",   value)}
                        onAnimation  = {(value: string) => sendAction("animation", value)}
                    />

                    <ActionLog log={log} />
                </div>
            </div>

            {/* Setup controls, applied as they change */}
            {setupOpen ? (
                <DemoSetupModal onClose={() => setSetupOpen(false)}>
                    <DemoSetupGroup
                        avatarId            = {avatarId}
                        onAvatarChange      = {changeAvatar}
                        restingOptions      = {entry.restingOptions}
                        restingExpression   = {restingExpression}
                        onRestingExpression = {changeRestingExpression}
                        durationMs          = {durationMs}
                        onDurationChange    = {setDurationMs}
                        onReset             = {resetAvatar}
                    />
                </DemoSetupModal>
            ) : null}
        </AdminPage>
    );
}
