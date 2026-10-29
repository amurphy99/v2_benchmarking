/* Demo Setup's pickers (avatar, resting face, hold, strength) and its reset button.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/DemoSetupGroup`

Shown inside `DemoSetupModal`, which gives it its title and frame.

*/
import type { ChangeEvent, ReactElement } from "react";

// From this project
import      { btnClass                    } from "@/hooks/chat-listener/chat-controls/styles";
import type { AvatarEntry, RestingOption  } from "@/pages/common/avatar/avatarRegistry";
import      { AVATARS                     } from "@/pages/common/avatar/avatarRegistry";
import type { DurationOption              } from "../utils/durationOptions";
import      { DEMO_DURATION_OPTIONS       } from "../utils/durationOptions";

// Shared look of the two pickers
const DEMO_SELECT_CLASS = "mt-1 w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm";

// Expression strengths the picker offers, strongest first (1 is the full face)
const DEMO_STRENGTH_OPTIONS = [1, 0.75, 0.5, 0.25];


// --------------------------------------------------------------------------------
// Demo Setup
// --------------------------------------------------------------------------------
// Choose the avatar, the face it rests on, and the `duration_ms` and strength every action button sends
export default function DemoSetupGroup({avatarId, onAvatarChange, restingOptions, restingExpression, onRestingExpression, durationMs, onDurationChange, strength, onStrengthChange, onReset}: {
    // Avatar
    avatarId       : string;                 // Selected avatar's id
    onAvatarChange : (id: string) => void;   // Switch avatars

    // Resting face (the picker shows only for avatars that offer options)
    restingOptions      : RestingOption[];          // Faces the avatar can rest on
    restingExpression   : string;                   // Face it rests on now
    onRestingExpression : (value: string) => void;  // Pick another resting face

    // Hold time
    durationMs       : number | null;                         // Sent with each action (null sends none)
    onDurationChange : (durationMs: number | null) => void;   // Pick a new hold time

    // Expression strength
    strength         : number;                        // How far each expression is shown from the resting face, 0 to 1
    onStrengthChange : (strength: number) => void;    // Pick a new strength

    // Reset
    onReset : () => void;   // Send the avatar back to Neutral
}): ReactElement {
    return (
        <div>
            {/* Pickers, side by side when there is room */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Avatar picker */}
                <div>
                    <label className="block text-xs opacity-60" htmlFor="avatar-demo-picker">Avatar</label>
                    <select
                        id        = "avatar-demo-picker"
                        className = {DEMO_SELECT_CLASS}
                        value     = {avatarId}
                        onChange  = {(event: ChangeEvent<HTMLSelectElement>) => onAvatarChange(event.target.value)}
                    >
                        {AVATARS.map((entry: AvatarEntry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                    </select>
                </div>

                {/* Resting face: what "Neutral" (and every timed emotion's return) means */}
                {(restingOptions.length > 0) ? (
                    <div>
                        <label className="block text-xs opacity-60" htmlFor="avatar-demo-resting">Resting face (Neutral)</label>
                        <select
                            id        = "avatar-demo-resting"
                            className = {DEMO_SELECT_CLASS}
                            value     = {restingExpression}
                            onChange  = {(event: ChangeEvent<HTMLSelectElement>) => onRestingExpression(event.target.value)}
                        >
                            {restingOptions.map((option: RestingOption) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </div>
                ) : null}
            </div>

            {/* Hold time sent as `duration_ms`, with the reset button at the end of the row */}
            <div className="mt-3 text-xs opacity-60">Emotion duration (sent as duration_ms)</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
                {DEMO_DURATION_OPTIONS.map((option: DurationOption) => (
                    <button
                        key       = {option.label}
                        className = {btnClass(false, (option.ms === durationMs) ? "primary" : "secondary")}
                        onClick   = {() => onDurationChange(option.ms)}
                    >
                        {option.label}
                    </button>
                ))}
                <div className="ml-auto">
                    <button className={btnClass(false, "secondary")} onClick={onReset}>Reset to Neutral</button>
                </div>
            </div>

            {/* Expression strength (passed beside each action; no backend frame carries it yet) */}
            <div className="mt-3 text-xs opacity-60">Expression strength (shown that far from the resting face)</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
                {DEMO_STRENGTH_OPTIONS.map((option: number) => (
                    <button
                        key       = {option}
                        className = {btnClass(false, (option === strength) ? "primary" : "secondary")}
                        onClick   = {() => onStrengthChange(option)}
                    >
                        {Math.round(option * 100)}%
                    </button>
                ))}
            </div>
        </div>
    );
}
