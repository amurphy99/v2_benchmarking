/* Modal for changing one participant's recording default and avatar.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/participants/ParticipantSettingsModal`

Edits a draft copy of the two settings, and nothing reaches the backend until
Save. Escape, the close button, Cancel, and a click on the backdrop all close
it and drop the draft. While a save runs, every control is disabled and the
modal stays open; the page closes it once the save succeeds.

*/
import type { ChangeEvent, ReactElement  } from "react";
import      { useEffect, useId, useState } from "react";
import      { LuX                        } from "react-icons/lu";

// From this project
import type { AdminProfile, AvatarModelChoice, UpdateAdminProfilePayload } from "@/api";
import { AVATAR_MODEL_CHOICES } from "@/api";
import { getAvatarEntry       } from "@/pages/common/avatar/avatarRegistry";

// UI Components
import { AdminButton     } from "../ui/AdminButton";
import { AdminSwitch     } from "../ui/AdminSwitch";
import { participantName } from "./ParticipantCard";


// ================================================================================
// Participant Settings Modal
// ================================================================================
// Recording switch and avatar dropdown for one participant, saved together
export function ParticipantSettingsModal({participant, saving, onSave, onClose}: {
    participant : AdminProfile;                                // Participant being edited (its values start the draft)
    saving      : boolean;                                     // A save is running
    onSave      : (body: UpdateAdminProfilePayload) => void;   // Send the draft settings
    onClose     : () => void;                                  // Close without saving
}): ReactElement {
    // --------------------------------------------------------------------------------
    // Draft Settings
    // --------------------------------------------------------------------------------
    // Copies of the two settings, changed freely until Save
    const [saveAudio, setSaveAudio] = useState<boolean          >(participant.save_audio_by_default);
    const [avatar,    setAvatar   ] = useState<AvatarModelChoice>(participant.modelChoice);
    const changed = (saveAudio !== participant.save_audio_by_default) || (avatar !== participant.modelChoice);

    // Ids tying the labels to their controls
    const titleId  = useId();
    const avatarId = useId();

    // --------------------------------------------------------------------------------
    // Closing
    // --------------------------------------------------------------------------------
    // Escape closes the modal (not during a save, so its answer always arrives here)
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => { if ((event.key === "Escape") && !saving) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [saving, onClose]);

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={saving ? undefined : onClose}>
            <div
                role            = "dialog"
                aria-modal      = "true"
                aria-labelledby = {titleId}
                className       = "w-full max-w-md rounded-xl bg-admin-panel border border-admin-border shadow-xl overflow-hidden"
                onClick         = {(event) => event.stopPropagation()}
            >
                {/* -------------------------------------------------------------------------------- */}
                {/* Header */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-admin-border">
                    <div className="min-w-0">
                        <div id={titleId} className="text-lg font-semibold text-admin-text truncate">{participantName(participant.user)}</div>
                        <div className="text-sm text-admin-subtext">Participant settings</div>
                    </div>
                    <button
                        onClick    = {onClose}
                        disabled   = {saving}
                        className  = "p-1.5 rounded text-admin-subtext hover:text-admin-text hover:bg-admin-muted cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label = "Close"
                    >
                        <LuX size={18} />
                    </button>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Settings */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="px-5 py-4 space-y-5">
                    {/* Recording default for each new chat */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-sm font-medium text-admin-text">Save chat audio automatically</div>
                            <div className="text-xs text-admin-subtext mt-0.5">Each new chat starts with this. You can still change it during a live chat.</div>
                        </div>
                        <AdminSwitch checked={saveAudio} onChange={setSaveAudio} label="Save chat audio automatically" disabled={saving} />
                    </div>

                    {/* Avatar on their web chat page */}
                    <div>
                        <label htmlFor={avatarId} className="text-sm font-medium text-admin-text">Avatar</label>
                        <select
                            id        = {avatarId}
                            value     = {avatar}
                            disabled  = {saving}
                            onChange  = {(event: ChangeEvent<HTMLSelectElement>) => setAvatar(event.target.value as AvatarModelChoice)}
                            className = "mt-1 w-full rounded-md border border-admin-border bg-admin-panel px-3 py-2 text-sm text-admin-text"
                        >
                            {AVATAR_MODEL_CHOICES.map((choice: AvatarModelChoice) => <option key={choice} value={choice}>{getAvatarEntry(choice).label}</option>)}
                        </select>
                        <div className="text-xs text-admin-subtext mt-1">Shown the next time their chat page opens.</div>
                    </div>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Footer */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex justify-end gap-2 px-5 py-3 border-t border-admin-border bg-admin-muted">
                    <AdminButton variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</AdminButton>
                    <AdminButton
                        variant  = "primary"
                        size     = "sm"
                        disabled = {!changed || saving}
                        onClick  = {() => onSave({save_audio_by_default: saveAudio, modelChoice: avatar})}
                    >
                        {saving ? "Saving..." : "Save"}
                    </AdminButton>
                </div>
            </div>
        </div>
    );
}
