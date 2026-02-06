// src/utils/loggingHelpers.js

// ====================================================================
// Quick Helper for Misc. Logging
// ====================================================================
// Could do biomarkers here too maybe

export const formatFloat = (val, decimals=4, padding=10) => {return val.toFixed(decimals).padStart(padding, ' ');};

export const logText    = (string) => console.log(`%c${string}`,                  "color: #FFD700");
export const logOverlap = (      ) => console.log(`%cOverlapped speech detected`, "color: #CD5C5C");
