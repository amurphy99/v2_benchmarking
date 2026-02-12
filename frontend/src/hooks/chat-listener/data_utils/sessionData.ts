
// SessionInfo is sent on the initial connection
type SessionInfo = {
    sessionID    : number;
    username     : string;
    source       : string;          // webapp | buddy | qtrobot
    isActive?    : boolean | null;
    startTs      : number  | null;  // unix seconds
    messageCount : number;
};

export { SessionInfo }
