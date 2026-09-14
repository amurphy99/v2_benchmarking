
// SessionInfo is sent on the initial connection
type SessionInfo = {
    sessionId     : number;
    username      : string;
    source        : string;                   // webapp | mobile | qtrobot | buddyrobot
    avatarModel ? : string  | null;           // "qt" | "buddy"; only meaningful when source is webapp
    isActive    ? : boolean | null;
    startTs       : number  | null;           // unix seconds
    messageCount  : number;
};

export { SessionInfo }
