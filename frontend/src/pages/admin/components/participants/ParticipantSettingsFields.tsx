/* Recording, language, and avatar controls for a participant card in edit mode.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/participants/ParticipantSettingsFields`

The controls only change the card's draft; nothing reaches the backend until the
card's Save. Every control is disabled while that save runs.

*/
import type { ChangeEvent, ReactElement } from "react";
import      { useId                     } from "react";

// From this project
import type { AdminProfile, AvatarModelChoice, LanguageChoice } from "@/api";
import      { AVATAR_MODEL_CHOICES, LANGUAGE_CHOICES          } from "@/api";
import      { getAvatarEntry, hasAvatarEntry                  } from "@/pages/common/avatar/avatarRegistry";
import      { AdminSwitch                                     } from "../ui/AdminSwitch";

// The three settings a participant card edits, as the backend names them
export type ParticipantDraft = Pick<AdminProfile, "save_audio_by_default" | "language" | "modelChoice">;

// Avatars that can be picked (reserved choices stay hidden until their avatar is built)
const PICKABLE_AVATARS = AVATAR_MODEL_CHOICES.filter(hasAvatarEntry);

// Shared dropdown styling
const SELECT_CLASS = "mt-1 w-full rounded-md border border-admin-border bg-admin-panel px-3 py-2 text-sm text-admin-text";

// English names for BCP-47 tags ("de-DE" reads "German (Germany)")
const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], {type: "language"});


// --------------------------------------------------------------------------------
// Participant Settings Fields
// --------------------------------------------------------------------------------
// Recording switch plus language and avatar dropdowns, editing one draft
export function ParticipantSettingsFields({draft, disabled, onChange}: {
    draft    : ParticipantDraft;                     // Current draft values
    disabled : boolean;                              // A save is running
    onChange : (draft: ParticipantDraft) => void;    // Replace the draft with one setting changed
}): ReactElement {
    // Ids tying the labels to their controls
    const languageId = useId();
    const avatarId   = useId();

    return (
        <div className="flex flex-col gap-4">
            {/* Recording default for each new chat */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-sm font-medium text-admin-text">Save chat audio automatically</div>
                    <div className="text-xs text-admin-subtext mt-0.5">Each new chat starts with this. You can still change it during a live chat.</div>
                </div>
                <AdminSwitch
                    checked  = {draft.save_audio_by_default}
                    onChange = {(checked: boolean) => onChange({...draft, save_audio_by_default: checked})}
                    label    = "Save chat audio automatically"
                    disabled = {disabled}
                />
            </div>

            {/* Language their chats will use */}
            <div>
                <label htmlFor={languageId} className="text-sm font-medium text-admin-text">Language</label>
                <select
                    id        = {languageId}
                    value     = {draft.language}
                    disabled  = {disabled}
                    onChange  = {(event: ChangeEvent<HTMLSelectElement>) => onChange({...draft, language: event.target.value as LanguageChoice})}
                    className = {SELECT_CLASS}
                >
                    {LANGUAGE_CHOICES.map((choice: LanguageChoice) => <option key={choice} value={choice}>{languageLabel(choice)}</option>)}
                </select>
                <div className="text-xs text-admin-subtext mt-1">Saved for their speech recognition, responses, and voice. Chats are still in English for now.</div>
            </div>

            {/* Avatar on their web chat page */}
            <div>
                <label htmlFor={avatarId} className="text-sm font-medium text-admin-text">Avatar</label>
                <select
                    id        = {avatarId}
                    value     = {draft.modelChoice}
                    disabled  = {disabled}
                    onChange  = {(event: ChangeEvent<HTMLSelectElement>) => onChange({...draft, modelChoice: event.target.value as AvatarModelChoice})}
                    className = {SELECT_CLASS}
                >
                    {PICKABLE_AVATARS.map((choice: AvatarModelChoice) => <option key={choice} value={choice}>{getAvatarEntry(choice).label}</option>)}
                </select>
                <div className="text-xs text-admin-subtext mt-1">Shown the next time their chat page opens.</div>
            </div>
        </div>
    );
}


// Name to show for a participant's chat language
export function languageLabel(language: LanguageChoice): string {
    return LANGUAGE_NAMES.of(language) ?? language;
}
