import { getAccess } from "@/context/AuthProvider";
import { useRef, useEffect, useState, useCallback } from "react";

const MAX_PENDING_MESSAGES =   500; // Maximum messages retained while the socket is connecting

// ================================================================================
// Handle the WebSocket Connection to the Backend
// ================================================================================
// ws://localhost:8000/ws/chat/?token=<ACCESS>&source=webapp
// ToDo: change typing to be done like in useAudioStreamer (do I actually NEED to ?)
export default function useChatSocket({
    recording,
    wsPath            = "/ws/chat/", 
    onLLMResponse     = (unknown            ) => {}, 
    onScores          = (WSMessage : any    ) => {},
    onUserUtt         = (text      : string ) => {},
    onAudio           = (data               ) => {},
    onError           = (_                  ) => {},
    onExpression      = (data               ) => {},
    onStreamStatus    = (status    : string ) => {},
    onChatClosed      = (                   ) => {},
    onRecordingStatus = (enabled   : boolean) => {},
    onCancelAudio     = (                   ) => {},
}) {
    // WebSocket setup    
    const [connected, setConnected] = useState(false);

    // Backend WebSocket URL 
    const wsUrlBase =
        location.hostname === "localhost"
            ? `ws://localhost:8000${wsPath}`
            : `wss://${location.host}${wsPath}`;
    const wsUrl = `${wsUrlBase}?token=${getAccess()}&source=webapp`;

    // --------------------------------------------------------------------------------
    // Receive things from the backend: LLM messages, Biomarker scores (sometimes)
    // --------------------------------------------------------------------------------
    // Callback props often receive a new identity on every parent render. Keep the WebSocket
    // message handler stable while still invoking the newest callback implementations.
    const handlersRef = useRef({onLLMResponse, onScores, onUserUtt, onAudio, onError, onExpression, onStreamStatus, onChatClosed, onRecordingStatus, onCancelAudio});
    useEffect(() => {
        handlersRef.current = {onLLMResponse, onScores, onUserUtt, onAudio, onError, onExpression, onStreamStatus, onChatClosed, onRecordingStatus, onCancelAudio};
    }, [onLLMResponse, onScores, onUserUtt, onAudio, onError, onExpression, onStreamStatus, onChatClosed, onRecordingStatus, onCancelAudio]);

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
        
        // Old biomarker-score-specific message types
        else if (type === "biomarker_scores") { console.log("On-Utterance scores received"); handlers.onScores({ type, data }); }
        else if (type === "audio_scores"    ) { console.log("On-Audio scores received"    ); handlers.onScores({ type, data }); }
        else if (type === "periodic_scores" ) { console.log("Periodic scores received"    ); handlers.onScores({ type, data }); }
        else if (type === "expression"      ) { console.log("Received expression:", data  ); handlers.onExpression(    data  ); }

        // Canonical backend robot actions use the same frontend expression callback
        else if (type === "robot_action"    ) { console.log("Received robot action:", data); handlers.onExpression(data); }

        // Backend chat controls (chats can be paused or ended through the backend)
        else if (type === "stream_status"   ) { console.log("Backend changed stream status"); handlers.onStreamStatus(data); }
        else if (type === "chat_ended"      ) { console.log("Backend ended chat"           ); handlers.onChatClosed(); }
        else if (type === "recording_status") { console.log("Recording status updated"     ); handlers.onRecordingStatus(!!data?.enabled); }

        // Cancel audio already buffered by the browser when continued speech invalidates a response
        else if (type === "cancel_audio"    ) { console.log("Backend cancelled audio"      ); handlers.onCancelAudio(); }

        // Primary-client acks are retained for robot/frontend use even though this UI only logs them
        else if (type === "command_ack"     ) { console.log("Backend accepted command:", data); }

        // Miscellaneous 
        else if (type === "lipsync_data"    ) { console.log("Received lipsync data"); } 
        else if (type === "rag_parse_error" || type === "chat_error") { console.log("Json Parsing Error Occured"); handlers.onError(response); }

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
            console.log("WebSocket connected to:", wsUrl);

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
            console.log("WebSocket closed:", event);

            // Stop frontend microphone streaming when the backend connection disappears
            handlersRef.current.onStreamStatus("paused");
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
