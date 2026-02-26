// Misc. Formatting Helpers
// TODO: Can probably get the elapsed time + some of these other calculations to share logic here...

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

export const dateFormatOptionsMonth: Intl.DateTimeFormatOptions = {
    month   : "short",
};

export const dateFormatOptionsShort: Intl.DateTimeFormatOptions = {
    month   : "short",
    day     : "numeric",
};

export const dateFormatOptionsMed: Intl.DateTimeFormatOptions = {
    weekday : "short",
    month   : "short",
    day     : "numeric",
};

export const dateFormatOptionsLong: Intl.DateTimeFormatOptions = {
    month   : "short",
    day     : "numeric",
    year    : "numeric",
    hour   : "2-digit",
    minute : "2-digit",
};

export const dateFormatOptions: Intl.DateTimeFormatOptions = {
    month   : "short",
    day     : "numeric",
    year    : "numeric",
};

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


// ================================================================================
// IDK, there's just three of these I guess...
// ================================================================================
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

// --------------------------------------------------------------------------------
// From the admin chat page headers
// --------------------------------------------------------------------------------
export function formatElapsedTime(elapsed: number | null | undefined): string {
    if (!elapsed) return "-";

    // Hours, minutes, seconds
    const h = Math.floor( elapsed / 3_600);
    const m = Math.floor((elapsed % 3_600) / 60);
    const s = elapsed % 60;

    // Format as a string
    if (h > 0) { return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }
    else       { return `${m}:${String(s).padStart(2, "0")}`; }
}

// Format the "time since last update" field (this gets time in MS though...)
export function formatAgo(d: Date | null | undefined): string {
    if (!d) return "—";
    // Get the elapsed time in 
    const elapsed = Date.now() - d.getTime();
    const s = Math.max(0, Math.floor(elapsed / 1_000));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);

    // Return an estimation
    if      (s <  5) { return  "just now"; }
    else if (s < 60) { return `${s}s ago`; }
    else if (m < 60) { return `${m}m ago`; }
    else             { return `${h}h ago`; }
}


