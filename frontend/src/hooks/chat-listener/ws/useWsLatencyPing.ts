import { useEffect } from "react";
import type { MutableRefObject } from "react";

// --------------------------------------------------------------------------------
// Helper function for latency pinging during a WebSocket connection
// --------------------------------------------------------------------------------
// (backend responses handled elsewhere)
export function useWsLatencyPing({
    connected,      // Connection status
    wsRef,          // WebSocket reference 
    pingIntervalMs, // Intervals at which to send pings to the backend to check for latency
}: {
    connected      : boolean;
    wsRef          : MutableRefObject<WebSocket | null>;
    pingIntervalMs : number;
}) {
    useEffect(() => {
        // Guards for connection & WebSocket being active
        if (!connected) return;

        // Send a ping every X seconds 
        const id = window.setInterval(() => {
            const ws = wsRef.current;
            if (ws.readyState !== WebSocket.OPEN) return;
            const t = Date.now();
            ws.send(JSON.stringify({ type: "ping", client_ts: t }));
        }, pingIntervalMs);

        return () => window.clearInterval(id); // clean up on unmount
    }, [connected, wsRef, pingIntervalMs]);
}
