/* Avatar picker, hold-time picker, and reset button for the avatar demo page.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/DemoSetupGroup`

*/
import type { ChangeEvent, ReactElement } from "react";

// From this project
import      { btnClass, buttonSectionHeader, groupDivStyle } from "@/hooks/chat-listener/chat-controls/styles";
import type { AvatarEntry                                  } from "@/pages/common/avatar/avatarRegistry";
import      { AVATARS                                      } from "@/pages/common/avatar/avatarRegistry";
import type { DurationOption                               } from "../utils/durationOptions";
import      { DEMO_DURATION_OPTIONS                        } from "../utils/durationOptions";


// --------------------------------------------------------------------------------
// Demo Setup
// --------------------------------------------------------------------------------
// Choose the avatar and the `duration_ms` every action button sends
export default function DemoSetupGroup({avatarId, onAvatarChange, durationMs, onDurationChange, onReset}: {
    // Avatar
    avatarId       : string;                 // Selected avatar's id
    onAvatarChange : (id: string) => void;   // Switch avatars

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
                className = "mt-1 w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm"
                value     = {avatarId}
                onChange  = {(event: ChangeEvent<HTMLSelectElement>) => onAvatarChange(event.target.value)}
            >
                {AVATARS.map((entry: AvatarEntry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>

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
