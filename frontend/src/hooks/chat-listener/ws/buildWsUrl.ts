import { getAccess } from "@/context/AuthProvider";

// Construct the URL for the chat listener WebSocket (with authorization included)
export function buildChatListenerWsUrl(session_id?: string) {
    if (!session_id) return null;

    // Build base URL endpoint (for local testing or deployed use)
    const base =
        location.hostname === "localhost"
            ? `ws://localhost:8000/ws/chat/${session_id}/listen/`
            : `wss://${location.host}/ws/chat/${session_id}/listen/`;

    // Add auth & the source field
    return `${base}?token=${getAccess()}&source=webapp`;
}
