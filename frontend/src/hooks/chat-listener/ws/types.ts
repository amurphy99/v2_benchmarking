
// General WebSocket response type
export type WsEnvelope<T = any> = {
    type        : string;
    data      ? : T;
    client_ts ? : number;
};

// Stable no-ops (can't inline default () => {} in params)
export const noop    = (      ) => {};
export const noopAny = (_: any) => {};
