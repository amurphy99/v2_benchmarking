/* One participant's card on the admin participant settings page.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/participants/ParticipantCard`

Shows who the participant is, how much they have chatted, and their current
avatar, language, and recording settings. The settings change only through the
modal its button opens.

*/
import type { ReactElement } from "react";

// From this project
import type { AdminProfile, LanguageChoice, User } from "@/api";
import { getAvatarEntry } from "@/pages/common/avatar/avatarRegistry";
import { dateFormatLong } from "@/utils/styling/numFormatting";
import { formatTimeAgo  } from "../chat_lists/timeGrouping";
import { AdminButton    } from "../ui/AdminButton";
import { Pill           } from "../ui/Pill";


// ================================================================================
// Participant Card
// ================================================================================
// Card with the participant's name, chat activity, current settings, and an edit button
export function ParticipantCard({participant, onEdit}: {
    participant : AdminProfile;   // Participant shown
    onEdit      : () => void;     // Open the settings modal for them
}): ReactElement {
    // Latest chat (null before their first)
    const lastChat = (participant.last_chat_at === null) ? null : new Date(participant.last_chat_at);
    const recordOn = participant.save_audio_by_default;

    return (
        <div className="h-full rounded-xl border border-admin-border bg-admin-panel shadow-sm px-4 py-3 flex flex-col gap-2">
            {/* Name, username, and how long ago they last chatted */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-lg font-semibold text-admin-text truncate">{participantName(participant.user)}</div>
                    <div className="text-sm text-admin-subtext truncate">@{participant.user.username}</div>
                </div>
                <Pill variant="info" value={(lastChat === null) ? "No chats yet" : formatTimeAgo(lastChat)} />
            </div>

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

            {/* Settings modal button */}
            <div className="mt-auto flex justify-end pt-1">
                <AdminButton variant="outline" size="sm" onClick={onEdit}>Edit settings</AdminButton>
            </div>
        </div>
    );
}


// Name to show for a participant (operational logins may have no first or last name)
export function participantName(user: User): string {
    return `${user.first_name} ${user.last_name}`.trim() || user.username;
}

// English names for BCP-47 tags ("de-DE" reads "German (Germany)")
const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], {type: "language"});

// Name to show for a participant's chat language
export function languageLabel(language: LanguageChoice): string {
    return LANGUAGE_NAMES.of(language) ?? language;
}
