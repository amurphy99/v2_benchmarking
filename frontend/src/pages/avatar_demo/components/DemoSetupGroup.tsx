/* Avatar picker, resting-face picker, hold-time picker, and reset button for the avatar demo page.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/DemoSetupGroup`

*/
import type { ChangeEvent, ReactElement } from "react";

// From this project
import      { btnClass, buttonSectionHeader, groupDivStyle } from "@/hooks/chat-listener/chat-controls/styles";
import type { AvatarEntry, RestingOption                   } from "@/pages/common/avatar/avatarRegistry";
import      { AVATARS                                      } from "@/pages/common/avatar/avatarRegistry";
import type { DurationOption                               } from "../utils/durationOptions";
import      { DEMO_DURATION_OPTIONS                        } from "../utils/durationOptions";

// Shared look of the two pickers
const DEMO_SELECT_CLASS = "mt-1 w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm";


// --------------------------------------------------------------------------------
// Demo Setup
// --------------------------------------------------------------------------------
// Choose the avatar, the face it rests on, and the `duration_ms` every action button sends
export default function DemoSetupGroup({avatarId, onAvatarChange, restingOptions, restingExpression, onRestingExpression, durationMs, onDurationChange, onReset}: {
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

    // Reset
    onReset : () => void;   // Send the avatar back to Neutral
}): ReactElement {
    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Demo Setup</div>

            {/* Avatar picker */}
            <label className="mt-2 block text-xs opacity-60" htmlFor="avatar-demo-picker">Avatar</label>
            <select
                id        = "avatar-demo-picker"
                className = {DEMO_SELECT_CLASS}
                value     = {avatarId}
                onChange  = {(event: ChangeEvent<HTMLSelectElement>) => onAvatarChange(event.target.value)}
            >
                {AVATARS.map((entry: AvatarEntry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>

            {/* Resting face: what "Neutral" (and every timed emotion's return) means */}
            {(restingOptions.length > 0) ? (
                <>
                    <label className="mt-3 block text-xs opacity-60" htmlFor="avatar-demo-resting">Resting face (Neutral)</label>
                    <select
                        id        = "avatar-demo-resting"
                        className = {DEMO_SELECT_CLASS}
                        value     = {restingExpression}
                        onChange  = {(event: ChangeEvent<HTMLSelectElement>) => onRestingExpression(event.target.value)}
                    >
                        {restingOptions.map((option: RestingOption) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </>
            ) : null}

            {/* Hold time sent as `duration_ms` */}
            <div className="mt-3 text-xs opacity-60">Emotion duration (sent as duration_ms)</div>
            <div className="mt-1 flex flex-wrap gap-2">
                {DEMO_DURATION_OPTIONS.map((option: DurationOption) => (
                    <button
                        key       = {option.label}
                        className = {btnClass(false, (option.ms === durationMs) ? "primary" : "secondary")}
                        onClick   = {() => onDurationChange(option.ms)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {/* Reset */}
            <button className={`mt-3 ${btnClass(false, "secondary")}`} onClick={onReset}>Reset to Neutral</button>
        </div>
    );
}
