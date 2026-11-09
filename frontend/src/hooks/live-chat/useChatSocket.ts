/* Open the participant chat's socket, route each frame, and queue early sends.
--------------------------------------------------------------------------------
`@frontend/src/hooks/live-chat/useChatSocket`

The socket opens when the chat starts recording and closes when it stops. Every
frame type goes to its own callback. The frames only some chat types send
(`avatar_setup`, `avatar_plan`, `task_card`;
`backend/chat_app/websocket/consumers/HARNESS_PROTOCOL.md`) are checked here,
where they arrive: a malformed avatar frame gets one warning and a rejection
sent back (`onAvatarRejected`), and a task card this page can't show is dropped
with a warning. `extraQuery` adds the chat type's parameters (`chat_type`,
`condition`, `variant`) to the socket URL. The URL carries the access token, so
it is never logged.

*/
import { useRef, useEffect, useState, useCallback } from "react";

// From this project
import      { getAccess                               } from "@/context/AuthProvider";
import      { parseAvatarPlan, parseAvatarSetup       } from "@/hooks/live-chat/avatarPlanChecks";
import type { AvatarFeedback, AvatarPlan, AvatarSetup } from "@/hooks/live-chat/avatarPlanFrames";
import type { TaskCard                                } from "@/hooks/live-chat/taskCardFrame";
import      { parseTaskCard                           } from "@/hooks/live-chat/taskCardFrame";

const MAX_PENDING_MESSAGES =   500; // Maximum messages retained while the socket is connecting

// ================================================================================
// Handle the WebSocket Connection to the Backend
// ================================================================================
// ws://localhost:8000/ws/chat/?token=<ACCESS>&source=webapp
// ToDo: change typing to be done like in useAudioStreamer (do I actually NEED to ?)
export default function useChatSocket({
    recording,
    wsPath             = "/ws/chat/",
    onLLMResponse      = (unknown                   ) => {},
    onScores           = (WSMessage : any           ) => {},
    onUserUtt          = (text      : string        ) => {},
    onAudio            = (data                      ) => {},
    onRobotAction      = (data                      ) => {},
    onStreamStatus     = (data      : any           ) => {},
    onChatClosed       = (                          ) => {},
    onRecordingStatus  = (enabled   : boolean       ) => {},
    onCancelAudio      = (                          ) => {},
    extraQuery         = "",                                  // More socket URL parameters, already encoded ("chat_type=map_task")
    onAvatarSetup      = (setup     : AvatarSetup   ) => {},  // A checked `avatar_setup` arrived
    onAvatarPlan       = (plan      : AvatarPlan    ) => {},  // A checked `avatar_plan` arrived
    onAvatarRejected   = (rejection : AvatarFeedback) => {},  // An avatar frame failed its checks (send the rejection back)
    onTaskCard         = (card      : TaskCard      ) => {},  // A `task_card` this page can show arrived
    onConnectionClosed = (                          ) => {},  // The socket closed (the chat type's avatar setup no longer applies)
}) {
    // WebSocket setup    
    const [connected, setConnected] = useState(false);

    // Backend WebSocket URL 
    const wsUrlBase =
        location.hostname === "localhost"
            ? `ws://localhost:8000${wsPath}`
            : `wss://${location.host}${wsPath}`;
    const wsUrl = `${wsUrlBase}?token=${getAccess()}&source=webapp${extraQuery ? `&${extraQuery}` : ""}`;

    // --------------------------------------------------------------------------------
    // Receive things from the backend: LLM messages, Biomarker scores (sometimes)
    // --------------------------------------------------------------------------------
    // Callback props often receive a new identity on every parent render. Keep the WebSocket
    // message handler stable while still invoking the newest callback implementations.
    const handlersRef = useRef({onLLMResponse, onScores, onUserUtt, onAudio, onRobotAction, onStreamStatus, onChatClosed, onRecordingStatus, onCancelAudio, onAvatarSetup, onAvatarPlan, onAvatarRejected, onTaskCard, onConnectionClosed});
    useEffect(() => {
        handlersRef.current = {onLLMResponse, onScores, onUserUtt, onAudio, onRobotAction, onStreamStatus, onChatClosed, onRecordingStatus, onCancelAudio, onAvatarSetup, onAvatarPlan, onAvatarRejected, onTaskCard, onConnectionClosed};
    }, [onLLMResponse, onScores, onUserUtt, onAudio, onRobotAction, onStreamStatus, onChatClosed, onRecordingStatus, onCancelAudio, onAvatarSetup, onAvatarPlan, onAvatarRejected, onTaskCard, onConnectionClosed]);

    const onMessage = useCallback((event: MessageEvent) => {
        // One malformed backend frame should not break handling of later socket messages
        let response: any;
        try   {response = JSON.parse(event.data);}
        catch (error) {console.error("WebSocket message was not valid JSON:", error); return;}
        const type     = response.type;
        const data     = response.data;
        const handlers = handlersRef.current;

        // Basic LLM response received through the WebSocket
        if      (type === "llm_response"    ) { handlers.onLLMResponse(response); }
        else if (type === "user_utt"        ) { console.log("User utterance received"     ); handlers.onUserUtt(data); }
        else if (type === "audio_chunk"     ) { handlers.onAudio(data); }
        else if (type === "biomarker_scores") { console.log("On-Utterance scores received"); handlers.onScores({ type, data }); }

        // Emotion or animation for the avatar to perform: {kind, value, duration_ms}
        else if (type === "robot_action"    ) { console.log("Received robot action:", data); handlers.onRobotAction(data); }

        // Backend chat controls (chats can be paused or ended through the backend)
        else if (type === "stream_status"   ) { console.log("Backend changed stream status"); handlers.onStreamStatus(data); }
        else if (type === "chat_ended"      ) { console.log("Backend ended chat"           ); handlers.onChatClosed(); }
        else if (type === "recording_status") { console.log("Recording status updated"     ); handlers.onRecordingStatus(!!data?.enabled); }

        // Cancel audio already buffered by the browser when continued speech invalidates a response
        else if (type === "cancel_audio"    ) { console.log("Backend cancelled audio"      ); handlers.onCancelAudio(); }

        // A chat type driving the avatar with plans: each frame is checked here, and a malformed one is sent back rejected
        else if (type === "avatar_setup"    ) {
            const parsed = parseAvatarSetup(data);
            if (parsed.ok) { handlers.onAvatarSetup(parsed.frame); }
            else           { console.warn("Rejected an avatar setup:", parsed.rejection); handlers.onAvatarRejected(parsed.rejection); }
        }
        else if (type === "avatar_plan"     ) {
            const parsed = parseAvatarPlan(data);
            if (parsed.ok) { handlers.onAvatarPlan(parsed.frame); }
            else           { console.warn("Rejected an avatar plan:", parsed.rejection); handlers.onAvatarRejected(parsed.rejection); }
        }

        // The participant's task card (a kind this page can't show is dropped)
        else if (type === "task_card"       ) {
            const card = parseTaskCard(data);
            if (card !== null) { handlers.onTaskCard(card); }
            else               { console.warn("Dropped a task card this page can't show"); }
        }

        // Committed transcript echo (this UI renders from user_utt/llm_response instead) & command results
        else if (type === "message"         ) { /* transcript echo; nothing to do here */ }
        else if (type === "command_ack"     ) { console.log("Backend accepted command:", data); }

        else { console.debug("Unhandled WS event type:", type, response); }
    }, []);

    // --------------------------------------------------------------------------------
    // Open and close the websocket connection on change of the "recording" flag
    // --------------------------------------------------------------------------------
    const wsRef              = useRef<WebSocket | null>(null);
    const pendingMessagesRef = useRef<string[]>([]);  // Hold already-encoded startup traffic so audio chunks and commands preserve their order
    const canQueueRef        = useRef(true);          // Distinguish "still connecting" from a deliberately stopped or disconnected chat

    useEffect(() => {
        if (!recording) {
            // Never carry unsent audio or commands from one chat connection into another
            canQueueRef.current         = false;
            pendingMessagesRef.current = [];
            wsRef.current?.close();
            wsRef.current = null;
            return;
        }

        canQueueRef.current = true;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => {
            setConnected(true);
            console.log("WebSocket connected to:", wsPath);

            // Flush in original production order; this ordering also matters for reply_now barriers
            while ((ws.readyState === WebSocket.OPEN) && pendingMessagesRef.current.length) {
                ws.send(pendingMessagesRef.current.shift()!);
            }
        };
        ws.onclose = (event) => {
            // A stale socket callback must not clear a replacement socket reference
            if (wsRef.current === ws) wsRef.current = null;
            canQueueRef.current         = false;
            pendingMessagesRef.current = [];
            setConnected(false);
            console.log("WebSocket closed:", event.code);
            handlersRef.current.onConnectionClosed();

            // Stop frontend microphone streaming when the backend connection disappears
            handlersRef.current.onStreamStatus({ status: "paused" });
        };
        ws.onerror   = (error) => {console.error("WebSocket connection failed, error:", error);};
        ws.onmessage = onMessage;

        return () => {
            // Primary sockets intentionally do not reconnect: backend disconnect ends the session
            canQueueRef.current         = false;
            pendingMessagesRef.current = [];
            wsRef.current?.close();
            wsRef.current = null;
            setConnected(false);
        };
    }, [recording, wsUrl, onMessage]);

    // Send helper
    const send = useCallback((msg: any) => {
        const encoded = JSON.stringify(msg);
        const ws      = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(encoded);
            return;
        }

        // Queue only during startup; traffic after a deliberate close is rejected
        if (!canQueueRef.current) {console.warn("WebSocket is closed; message not sent"); return;}
        if (pendingMessagesRef.current.length >= MAX_PENDING_MESSAGES) pendingMessagesRef.current.shift();
        pendingMessagesRef.current.push(encoded);
    }, []);

    // `start()` calls this before setRecording/startAud so their first messages cannot be dropped
    const prepareConnection = useCallback(() => {canQueueRef.current = true;}, []);

    // Expose
    return { send, connected, prepareConnection };
}
