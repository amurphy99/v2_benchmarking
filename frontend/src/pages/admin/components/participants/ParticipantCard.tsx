/* One participant's card on the Accounts (participant settings) page.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/participants/ParticipantCard`

Display mode shows who the participant is, how much they have chatted, and their
current avatar, language, and recording settings. Edit opens the same card in
edit mode: the settings controls, plus a new-password field for staff. Changes
stay on the card until Save, which sends them in one request. The card returns
to display mode only once the backend confirms the save.

*/
import type { ReactElement } from "react";
import      { useState     } from "react";

// From this project
import type { AdminProfile, User    } from "@/api";
import      { useAuth               } from "@/context/AuthProvider";
import      { useUpdateAdminProfile } from "@/hooks/queries/useAdminProfiles";
import      { getAvatarEntry        } from "@/pages/common/avatar/avatarRegistry";
import      { dateFormatLong        } from "@/utils/styling/numFormatting";
import      { formatTimeAgo         } from "../chat_lists/timeGrouping";
import      { Pill                  } from "../ui/Pill";
import      { EditableCard          } from "./EditableCard";
import      { NewPasswordField      } from "./NewPasswordField";

// Card pieces
import type { ParticipantDraft                         } from "./ParticipantSettingsFields";
import      { languageLabel, ParticipantSettingsFields } from "./ParticipantSettingsFields";


// ================================================================================
// Participant Card
// ================================================================================
// Card with the participant's name, chat activity, and settings, editable in place
export function ParticipantCard({participant}: {
    participant : AdminProfile;   // Participant shown, as last saved
}): ReactElement {
    const isStaff = useAuth().account.user.is_staff;
    const update  = useUpdateAdminProfile();

    // Latest chat (null before their first)
    const lastChat = (participant.last_chat_at === null) ? null : new Date(participant.last_chat_at);
    const recordOn = participant.save_audio_by_default;

    // --------------------------------------------------------------------------------
    // Draft
    // --------------------------------------------------------------------------------
    // Edit mode, the draft settings, and a typed new password ("" keeps the current one)
    const [editing,  setEditing ] = useState<boolean         >(false);
    const [draft,    setDraft   ] = useState<ParticipantDraft>(savedSettings(participant));
    const [password, setPassword] = useState<string          >("");

    // Something differs from what is saved
    const saved   = savedSettings(participant);
    const changed =
        (draft.save_audio_by_default !== saved.save_audio_by_default) ||
        (draft.language              !== saved.language)              ||
        (draft.modelChoice           !== saved.modelChoice)           ||
        (password                    !== "");

    // Start a fresh draft from the saved values
    const startEditing = (): void => {
        setDraft(savedSettings(participant));
        setPassword("");
        setEditing(true);
    };

    // Send the settings (and the password only when one was typed), then leave edit mode once saved
    const save = (): void => {
        const body = (password === "") ? draft : {...draft, password};
        update.mutate({id: participant.id, body}, {onSuccess: () => setEditing(false)});
    };

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <EditableCard
            name     = {participantName(participant.user)}
            username = {participant.user.username}
            badge    = {<Pill variant="info" value={(lastChat === null) ? "No chats yet" : formatTimeAgo(lastChat)} />}
            editing  = {editing}
            canSave  = {changed}
            saving   = {update.isPending}
            onEdit   = {startEditing}
            onCancel = {() => setEditing(false)}
            onSave   = {save}
        >
            {editing ? (
                <div className="flex flex-col gap-4">
                    <ParticipantSettingsFields draft={draft} disabled={update.isPending} onChange={setDraft} />
                    {isStaff ? <NewPasswordField value={password} disabled={update.isPending} fromEnv={participant.password_from_env} onChange={setPassword} /> : null}
                </div>
            ) : (
                <>
                    {/* Chat activity */}
                    <div className="flex gap-2 flex-wrap">
                        <Pill label="Chats"     value={participant.chat_count} />
                        <Pill label="Last chat" value={(lastChat === null) ? "—" : dateFormatLong.format(lastChat)} />
                    </div>

                    {/* Current settings */}
                    <div className="flex gap-2 flex-wrap">
                        <Pill label="Avatar"    value={getAvatarEntry(participant.modelChoice).label} />
                        <Pill label="Language"  value={languageLabel(participant.language)} />
                        <Pill label="Recording" value={recordOn ? "On" : "Off"} variant={recordOn ? "accent" : "offline"} dot />
                    </div>
                </>
            )}
        </EditableCard>
    );
}


// The participant's saved settings, in the shape the draft uses
function savedSettings(participant: AdminProfile): ParticipantDraft {
    return {save_audio_by_default: participant.save_audio_by_default, language: participant.language, modelChoice: participant.modelChoice};
}

// Name to show for an account (operational logins may have no first or last name)
export function participantName(user: User): string {
    return `${user.first_name} ${user.last_name}`.trim() || user.username;
}
