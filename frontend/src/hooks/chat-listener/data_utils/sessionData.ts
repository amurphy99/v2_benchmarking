/* Shape of the `session_info` frame the admin listener receives on connecting.
--------------------------------------------------------------------------------
`@frontend/src/hooks/chat-listener/data_utils/sessionData`

Mirrors `send_initial_data()` in `backend/chat_app/websocket/consumers/utils/db_data.py`.

*/
// SessionInfo is sent on the initial connection
type SessionInfo = {
    sessionId     : number;
    username      : string;
    source        : string;                   // webapp | mobile | qtrobot | buddyrobot
    avatarModel ? : string  | null;           // "smiley" | "qt" | "buddy"; only meaningful when source is webapp
    isActive    ? : boolean | null;
    startTs       : number  | null;           // unix seconds
    messageCount  : number;
    chat_type     : string;                   // Harness that ran ("" on sessions from before chat types were recorded)
    condition     : string;                   // Its cue set ("" for none)
    variant       : string;                   // Its task content ("" for none)
    run_biomarkers: boolean;                  // The participant's biomarker switch (off: no biomarker scores are coming)
};

export { SessionInfo }
