/* Run one participant chat: socket, microphone stream, and TTS playback.
--------------------------------------------------------------------------------
`@frontend/src/hooks/useLiveChat`

The chat page starts, pauses, and ends the chat through this hook. A backend
pause or resume (`stream_status`) stops or restarts the microphone here, and
the page hears about both through `onChatPaused` and `onChatResumed`. The TTS
player's `systemSpeaking`, `readSpeechLoudness`, and `readSpeechRemaining`
pass through for the avatar.

Ending the chat sends `end_chat` and leaves the socket open, so the backend can
send the task's reveal (`onTaskReveal`) before it closes the socket; one that
doesn't close it in time is closed from here. The chat is over once the socket
closes, whichever side closed it, since a primary socket never reconnects
(`chatOver`, `onChatClosed`). A reply that ends the chat sends `chat_ended`
just before that close, and its goodbye keeps playing. The committed message
echoes pass through for the page to count (`onCommittedMessage`).

A chat type that drives the avatar from the backend sends setups and plans
(`backend/chat_app/websocket/consumers/HARNESS_PROTOCOL.md`). They run here, on
the page's avatar (`useAvatarPlans`), timed against this player's replies, and
their feedback goes back on the same socket. Each reply's text and every
`robot_action` are noted for the plans, and the setup is forgotten when the
socket closes. Task cards pass through to the page (`onTaskCard`).

Commands go out through `sendCommand`, and every ack's control state is kept
(`controlState`). For debug mode, the page can hide the backend's cues on the
avatar (`hideCues`, `useCueHiding`), ping the backend to time the round trip
(`pingMs`, `onLatency`), and hear each reply's timing (`onReplyTiming`).

*/
import      { useQueryClient                           } from "@tanstack/react-query";
import type { RefObject                                } from "react";
import      { useState, useEffect, useRef, useCallback } from "react";

// From this project
import type { CommandAck, ControlState        } from "@/hooks/chat-listener/chat-controls/types";
import      { useChatSocket, useAudioStreamer } from "@/hooks/live-chat";
import type { AvatarFeedback                  } from "@/hooks/live-chat/avatarPlanFrames";
import      { avatarFeedbackFrame             } from "@/hooks/live-chat/avatarPlanFrames";
import type { ReplyTimingFrame                } from "@/hooks/live-chat/debugFrames";
import type { TaskCard                        } from "@/hooks/live-chat/taskCardFrame";
import type { TaskReveal                      } from "@/hooks/live-chat/taskRevealFrame";
import type { AvatarHandle                    } from "@/pages/common/avatar/avatarRegistry";
import      { useAvatarPlans                  } from "@/pages/common/avatar/plans/useAvatarPlans";
import      { useCueHiding                    } from "@/pages/common/avatar/plans/useCueHiding";
import      { useAudioPlayer                  } from "./live-chat/useAudioPlayer";

// How long an ending chat waits for the backend to close the socket before closing it from here
const CHAT_END_CLOSE_WAIT_MS = 5_000;

// What the hook gives the chat page
interface LiveChatControls {
    start               : () => void;                                              // Connect if needed, then stream the microphone and play replies
    stop                : () => void;                                              // Pause: stop the microphone and drop buffered speech
    save                : () => void;                                              // End the chat (the backend sends the task's reveal, then closes the socket)
    chatEnding          : boolean;                                                 // The chat is ending: the participant ended it, or the backend said `chat_ended`
    chatOver            : boolean;                                                 // The socket closed: the chat is over (a goodbye may still be playing)
    systemSpeaking      : boolean;                                                 // Reply speech is playing
    readSpeechLoudness  : (fromSec: number, frameCount: number) => Float32Array;   // Vowel-band loudness of the reply heard from `fromSec` from now, per frame
    readSpeechRemaining : () => number | null;                                     // Seconds until the reply's final audio is heard (null while unknown)
    controlState        : ControlState | null;                                     // The backend's latest control state (null until the first command's ack)
    sendCommand         : (name: string, data?: Record<string, unknown>) => void;  // Send one command (its ack comes back through `onCommandAck`)
}

// ================================================================================
// Hook that handles everything involved with the chat
// ================================================================================
// Could expose more useState flags: connected, recording, userSpeaking.
// TODO: Some of these logging utilities are outdated
export default function useLiveChat({
    onUserUtterance,
    onSystemUtterance = (_: string) => {},
    onScores          = (         ) => {},
    onRobotAction     = (         ) => {},
    wsPath = "/ws/chat/",
    onDebugTurn,
    onChatClosed,
    onChatPaused,      // Backend sent message telling us that the chat is paused
    onChatResumed,     // Backend sent message telling us that the chat is listening again
    onRecordingStatus, // Backend updates the recording status (if we are saving the audio on chat end)
    onTaskCard,        // The participant's task card arrived (chat types that show one)
    onTaskReveal,      // The task's reveal arrived, just before the backend closes the socket (task chat types)
    onCommittedMessage, // A message the backend saved (its echo), for the page to count
    avatarRef,         // The page's avatar, which runs the backend's plans
    avatarModel,       // The avatar showing (null while the settings load)
    extraQuery = "",   // The chat type's socket parameters, already encoded ("chat_type=map_task")
    onCommandAck,      // A command's ack arrived (its control state is kept as `controlState` too)
    onReplyTiming,     // Debug mode: a reply's timing arrived (once it is saved, and again once its audio started)
    onLatency,         // A ping's round trip came back, in ms
    pingMs   = null,   // Ping the backend this often while connected (null: never)
    hideCues = false,  // Keep the backend's cues off the avatar (debug mode's switch acts in the browser only)
} : {
    onUserUtterance   : (text    : string) => void;
    onSystemUtterance : (text    : string) => void;
    onScores          : (                ) => void;
    onRobotAction     : (data    : any   ) => void;
    wsPath            ?: string;
    onDebugTurn       ?: (turn: { role: "user" | "assistant"; text: string; state?: string; }) => void;
    onChatClosed      ?: () => void;
    onChatPaused      ?: () => void;
    onChatResumed     ?: () => void;
    onRecordingStatus ?: (enabled: boolean) => void;
    onTaskCard        ?: (card: TaskCard) => void;
    onTaskReveal      ?: (reveal: TaskReveal) => void;
    onCommittedMessage?: (role: "user" | "assistant", content: string) => void;
    avatarRef          : RefObject<AvatarHandle | null>;
    avatarModel        : string | null;
    extraQuery        ?: string;
    onCommandAck      ?: (ack: CommandAck) => void;
    onReplyTiming     ?: (timing: ReplyTimingFrame) => void;
    onLatency         ?: (ms: number) => void;
    pingMs            ?: number | null;
    hideCues          ?: boolean;
}): LiveChatControls {
    // Misc. setup
    const qc = useQueryClient();

    // Handle LLM responses from the backend
    const onLLMres = (response: any) => {
        // Parse incoming data
		const payload = response.data;
        const text    = typeof payload === "string" ? payload : payload?.text ?? "";

        // System utterance behavior (avatar plans timed to this reply learn its text has arrived)
        if (typeof response.responseId === "number") plans.noteReplyText(response.responseId);
        onSystemUtterance(text);

        // Maybe there is extra data
        const state = typeof payload === "object" ? payload.current_scenario || payload.next_scenario : undefined;
        onDebugTurn?.({role: "assistant", text, state, });
	};

    // Chat status trackers
    const [recording,   setRecording  ] = useState(false);  // The socket should be open (it opens on start, and closes once the chat is over)
    const [chatEnding,  setChatEnding ] = useState(false);  // The participant ended the chat, or the backend sent "chat_ended"
    const [chatOver,    setChatOver   ] = useState(false);  // The socket closed after the chat started: the chat is over

    // The backend's control state, from every command's ack (and in debug mode, from an admin's command)
    const [controlState, setControlState] = useState<ControlState | null>(null);

    // Playback events use the same socket but the audio player is initialized first
    const socketSendRef = useRef<(message: object) => void>(() => {});
    const reportPlaybackState = useCallback((responseId: number, state: "started" | "finished") => {
        socketSendRef.current({type: "tts_playback", data: {responseId, state}});
    }, []);

    // TODO: Maybe these values should be pulled from a config file somewhere...
    // Instantiate the audio player for backend-sent TTS
    const { startPlayer, sendAudio, stopPlayer, cancelAudio, systemSpeaking, readSpeechLoudness, readSpeechRemaining, readReplyTimeline, readAudioLeadMs, holdNextReply } = useAudioPlayer({
        sampleRate      : 24_000,
        numChannels     : 1,
        bitsPerSample   : 16,
        bufferAhead     : 0.2,
        onPlaybackState : reportPlaybackState,
    });

    // Backend avatar plans run on the page's avatar, timed to this player's replies (their feedback goes back on the socket)
    const sendAvatarFeedback = useCallback((feedback: AvatarFeedback) => { socketSendRef.current(avatarFeedbackFrame(feedback)); }, []);
    const plans = useAvatarPlans(avatarRef, avatarModel, {read: readReplyTimeline, leadMs: readAudioLeadMs, holdNext: holdNextReply}, sendAvatarFeedback);

    // The backend's setups and plans reach the avatar through the cue gate (it holds them back while debug mode hides the cues)
    const cues = useCueHiding(plans, hideCues);

    // A command's ack carries the complete control state
    const onAck = (ack: CommandAck) => { setControlState(ack.state); onCommandAck?.(ack); };

    // A `robot_action` counts as a newer plan (it drops the running plan's waiting steps)
    const onRobotActionWrapped = (data: any) => { plans.noteRobotAction(); onRobotAction(data); };

    // Wrap user utterances
    const onUserUttWrapped = (text: string) => { onUserUtterance(text); onDebugTurn?.({ role: "user", text }); };

    // --------------------------------------------------------------------------------
    // Backend chat status updates (pause/resume/end)
    // --------------------------------------------------------------------------------
    // Ref so onStreamStatus can call stopAud without depending on declaration order
    // (useAudioStreamer is defined after useChatSocket which needs onStreamStatus)
    const startAudRef = useRef<() => void>(() => {});
    const stopAudRef  = useRef<() => void>(() => {});

    // Backend-initiated stream status change ({status: "paused" | "active"})
    // Apply backend status without sending another set_listening command back
    const onStreamStatus = (data: any) => {
        const status = data?.status;
        if (status === "paused") {  stopAudRef.current(); onChatPaused ?.(); }
        if (status === "active") { startAudRef.current(); onChatResumed?.(); }
        // TODO: Depends on how we want this behavior to work. Should we stop talking on pause always?
        // ...
    };

    // The backend said `chat_ended`: its close comes next (the goodbye may still be playing)
    const handleChatEnded = () => { setChatEnding(true); };

    // The socket closed, from either side: the chat is over (the chat type's avatar setup no longer applies)
    const handleConnectionClosed = () => { cues.clearSetup(); setRecording(false); setChatOver(true); onChatClosed?.(); };

    // An ending chat whose socket the backend hasn't closed in time is closed from here (its reveal never comes)
    useEffect(() => {
        if (!chatEnding || chatOver) return;
        const timer = window.setTimeout(() => setRecording(false), CHAT_END_CLOSE_WAIT_MS);
        return () => window.clearTimeout(timer);
    }, [chatEnding, chatOver]);

    // --------------------------------------------------------------------------------
    // Chat Socket
    // --------------------------------------------------------------------------------
	const { send, connected, prepareConnection } = useChatSocket({
		recording,
        wsPath,
        extraQuery,
		onLLMResponse      : onLLMres,
		onScores,
		onUserUtt          : onUserUttWrapped,
		onAudio            : sendAudio,
        onStreamStatus,
        onChatClosed       : handleChatEnded,
        onRobotAction      : onRobotActionWrapped,
        onRecordingStatus  : (enabled) => onRecordingStatus?.(enabled),
        onCancelAudio      : cancelAudio,
        onAvatarSetup      : cues.applySetup,
        onAvatarPlan       : cues.runPlan,
        onAvatarRejected   : sendAvatarFeedback,
        onTaskCard         : (card: TaskCard) => onTaskCard?.(card),
        onTaskReveal       : (reveal: TaskReveal) => onTaskReveal?.(reveal),
        onCommittedMessage : (role: "user" | "assistant", content: string) => onCommittedMessage?.(role, content),
        onConnectionClosed : handleConnectionClosed,
        onCommandAck       : onAck,
        onControlState     : setControlState,
        onReplyTiming      : (timing: ReplyTimingFrame) => onReplyTiming?.(timing),
        onPong             : (clientTs: number) => onLatency?.(Date.now() - clientTs),
	});
    socketSendRef.current = send;
	const { start: startAud, stop: stopAud } = useAudioStreamer({ chunkMs: 64, sendToServer: send, });
    startAudRef.current = startAud;
    stopAudRef .current = stopAud;

    // Debug mode: time the round trip to the backend every `pingMs` while the socket is open
    useEffect(() => {
        if ((pingMs === null) || !connected) return;
        const timer = window.setInterval(() => socketSendRef.current({type: "ping", client_ts: Date.now()}), pingMs);
        return () => window.clearInterval(timer);
    }, [pingMs, connected]);

    // --------------------------------------------------------------------------------
    // Commands, Start, Stop, & Save
    // --------------------------------------------------------------------------------
    // Send one command (a body left out is left out of the frame too)
    const sendCommand = useCallback((name: string, data?: Record<string, unknown>): void => {
        socketSendRef.current({type: "command", data: {id: crypto.randomUUID(), name, data}});
    }, []);
    const setListening = (state: "active" | "paused") => sendCommand("set_listening", {state});

    const start = () => { prepareConnection(); setRecording(true); startAud(); startPlayer(); setListening("active"); };
	const stop  = () => {                                           stopAud();  stopPlayer(); setListening("paused"); };

    // End the chat: the microphone and any reply stop, and the socket stays open for the backend's reveal and its close
    const save = () => {
        stopAud(); stopPlayer(); setChatEnding(true);
        send({type: "end_chat", data: Date.now()});
        qc.invalidateQueries({ queryKey: ["chatSessions"] }); // Ending invalidates chatSessions queries to force a DB refresh
    };

    // Exposes start, stop, save, where the chat is (ending, over), the reply speech state for the avatar, and commands
    return { start, stop, save, chatEnding, chatOver, systemSpeaking, readSpeechLoudness, readSpeechRemaining, controlState, sendCommand };
}
