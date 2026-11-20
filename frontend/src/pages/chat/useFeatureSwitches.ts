/* Debug mode's switches for the chat type's shared features, before and during the chat.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/useFeatureSwitches`

Each feature starts on, as the backend runs it in debug mode (whose chats always
run the `cues` condition). Before the chat connects, a switch keeps the choice
made on the page. The backend's control state arrives with the ack of the
command that starts the chat (every ack carries it): from then on the switches
show the backend's states, and each choice that differs goes out once as a
`set_feature` command. After that, flipping a switch sends the command, and the
switch shows as pending until the next control state.

*/
import { useEffect, useRef, useState } from "react";

// From this project
import type { ControlState } from "@/hooks/chat-listener/chat-controls/types";

// One shared feature's switch
export type FeatureSwitch = {
    name    : string;    // The feature's backend name (`set_feature`)
    on      : boolean;   // On (the backend's state once the chat connects, the page's choice before)
    pending : boolean;   // A change went out, and no control state has come back since
};

// Sends one command on the chat socket (`useLiveChat`)
type SendCommand = (name: string, data?: Record<string, unknown>) => void;


// ================================================================================
// Feature Switches
// ================================================================================
// The chat type's feature switches, and what flipping one does
export function useFeatureSwitches(
    names        : readonly string[],    // The chat type's shared features (`ChatMode.features`; none outside debug mode)
    controlState : ControlState | null,  // The backend's latest control state (null until the chat connects)
    sendCommand  : SendCommand,          // Sends one command on the chat socket
): {switches: FeatureSwitch[]; toggle: (name: string) => void} {
    const [chosen,  setChosen ] = useState<Record<string, boolean>>({});    // Choices made before the chat connected
    const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
    const sentChosenRef = useRef(false);                                     // Those choices went out with the first control state

    // Each control state ends every wait; the first one also sends the choices made before it that differ
    useEffect(() => {
        if (controlState === null) return;
        if (sentChosenRef.current) { setPending(new Set()); return; }

        sentChosenRef.current = true;
        const differing = names.filter((name: string) => (name in chosen) && (chosen[name] !== controlState.features[name]));
        for (const name of differing) sendCommand("set_feature", {feature: name, on: chosen[name]});
        setPending(new Set(differing));
    }, [controlState]);

    // Flip one switch: a choice kept for later before the chat connects, a command once it has
    const toggle = (name: string): void => {
        if (controlState === null) { setChosen((now: Record<string, boolean>) => ({...now, [name]: !(now[name] ?? true)})); return; }
        sendCommand("set_feature", {feature: name, on: !controlState.features[name]});
        setPending((now: ReadonlySet<string>) => new Set([...now, name]));
    };

    // Before the chat connects, every listed feature as chosen (on until switched off); after, the ones the backend has, as it has them
    const switches = (controlState === null)
        ? names.map((name: string): FeatureSwitch => ({name, on: chosen[name] ?? true, pending: false}))
        : names.filter((name: string) => name in controlState.features).map((name: string): FeatureSwitch => ({name, on: controlState.features[name], pending: pending.has(name)}));
    return {switches, toggle};
}
