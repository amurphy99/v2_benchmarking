// Misc. Formatting Helpers

export const dateFormat = new Intl.DateTimeFormat("en-US", {
    year  : "numeric",
    month : "short", 
    day   : "2-digit" 
});

export const dateFormatTime = new Intl.DateTimeFormat("en-US", {
    hour   : "2-digit",
    minute : "2-digit",
});

export const dateFormatShort = new Intl.DateTimeFormat("en-US", {
    month : "short", 
    day   : "2-digit" 
});

export const dateFormatLong = new Intl.DateTimeFormat("en-US", {
    year   : "numeric",
    month  : "short", 
    day    : "2-digit",
    hour   : "2-digit",
    minute : "2-digit",
});

export const msgDateFormat = new Intl.DateTimeFormat("en-US", {
    hour   : "2-digit",
    minute : "2-digit",
    second : "2-digit",
});


export function formatElapsed_s(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor( totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    // Show "MM:SS" while < 1 h, otherwise "H:MM:SS"
    return h
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatElapsed(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor( totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const msRemainder = ms % 1000;

    // Always show 3-digit ms 
    const msStr = String(msRemainder).padStart(3, "0");

    // "H:MM:SS.mmm" if ≥ 1h, otherwise "M:SS.mmm"
    return h
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${msStr}`
        : `${m}:${String(s).padStart(2, "0")}.${msStr}`;
}
