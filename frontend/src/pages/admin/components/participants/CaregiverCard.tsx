/* One caregiver's card on the admin Accounts page.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/participants/CaregiverCard`

Display mode lists the participants linked to the caregiver as plain chips. In
edit mode each chip can be removed, the dropdown links another participant, and
staff can type a new password. Nothing is saved until Save, which sends the
caregiver's whole new set of links (and the password, when one was typed) in one
request. The caregiver's Monitor pages show only the linked participants.

*/
import type { ChangeEvent, ReactElement } from "react";
import      { useState                  } from "react";
import      { LuX                       } from "react-icons/lu";

// From this project
import type { AdminCaregiver, AdminProfile, LinkedParticipant, UpdateCaregiverPayload } from "@/api";
import { useUpdateCaregiver } from "@/hooks/queries/useAdminAccounts";
import { EditableCard       } from "./EditableCard";
import { NewPasswordField   } from "./NewPasswordField";
import { participantName    } from "./ParticipantCard";

// Shared chip styling
const CHIP_CLASS = "inline-flex items-center gap-1 rounded-full border border-admin-border bg-admin-muted px-3 py-0.5 text-sm text-admin-text";


// ================================================================================
// Caregiver Card
// ================================================================================
// Card with the caregiver's name and linked participants, editable in place
export function CaregiverCard({caregiver, participants}: {
    caregiver    : AdminCaregiver;   // Caregiver shown, as last saved
    participants : AdminProfile[];   // Every participant (the dropdown offers the ones not yet linked)
}): ReactElement {
    const update = useUpdateCaregiver();

    // --------------------------------------------------------------------------------
    // Draft
    // --------------------------------------------------------------------------------
    // Edit mode, the staged linked participants, and a typed new password ("" keeps the current one)
    const [editing,  setEditing ] = useState<boolean            >(false);
    const [draft,    setDraft   ] = useState<LinkedParticipant[]>(caregiver.participants);
    const [password, setPassword] = useState<string             >("");

    // Something differs from what is saved (link order does not matter)
    const savedIds     = caregiver.participants.map((linked: LinkedParticipant) => linked.id);
    const draftIds     = draft.map((linked: LinkedParticipant) => linked.id);
    const linksChanged = (draftIds.length !== savedIds.length) || draftIds.some((id: number) => !savedIds.includes(id));
    const changed      = linksChanged || (password !== "");

    // Participants the dropdown can still add
    const unlinked = participants.filter((profile: AdminProfile) => !draftIds.includes(profile.id));

    // Start a fresh draft from the saved links
    const startEditing = (): void => {
        setDraft(caregiver.participants);
        setPassword("");
        setEditing(true);
    };

    // Stage one more participant picked from the dropdown
    const addParticipant = (profile: AdminProfile): void => setDraft([...draft, {id: profile.id, user: profile.user}]);

    // Send the links (and the password only when one was typed), then leave edit mode once saved
    const save = (): void => {
        const body: UpdateCaregiverPayload = (password === "") ? {participant_ids: draftIds} : {participant_ids: draftIds, password};
        update.mutate({id: caregiver.id, body}, {onSuccess: () => setEditing(false)});
    };

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    // Linked participants shown in the current mode (saved ones, or the staged set while editing)
    const shown = editing ? draft : caregiver.participants;

    return (
        <EditableCard
            name     = {participantName(caregiver.user)}
            username = {caregiver.user.username}
            editing  = {editing}
            canSave  = {changed}
            saving   = {update.isPending}
            onEdit   = {startEditing}
            onCancel = {() => setEditing(false)}
            onSave   = {save}
        >
            {/* Linked participants (removable only in edit mode) */}
            <div className="flex flex-col gap-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-admin-subtext">Linked Participants</div>
                <div className="flex gap-2 flex-wrap">
                    {(shown.length === 0) ? <span className="text-sm text-admin-subtext">None yet</span> : null}
                    {shown.map((linked: LinkedParticipant) => (
                        <span key={linked.id} className={editing ? `${CHIP_CLASS} pr-1` : CHIP_CLASS}>
                            {participantName(linked.user)}
                            {editing ? (
                                <button
                                    onClick    = {() => setDraft(draft.filter((other: LinkedParticipant) => other.id !== linked.id))}
                                    disabled   = {update.isPending}
                                    aria-label = {`Unlink ${participantName(linked.user)}`}
                                    className  = "p-0.5 rounded-full text-admin-subtext hover:text-admin-text hover:bg-admin-panel cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <LuX size={14} />
                                </button>
                            ) : null}
                        </span>
                    ))}
                </div>
            </div>

            {/* Edit mode: link one more participant (the dropdown resets to its prompt), and the new password */}
            {editing ? (
                <div className="flex flex-col gap-4">
                    <select
                        value     = ""
                        disabled  = {update.isPending || (unlinked.length === 0)}
                        onChange  = {(event: ChangeEvent<HTMLSelectElement>) => addParticipant(unlinked[Number(event.target.value)])}
                        className = "w-full rounded-md border border-admin-border bg-admin-panel px-3 py-2 text-sm text-admin-text disabled:opacity-50"
                    >
                        <option value="" disabled>{(unlinked.length === 0) ? "Every participant is linked" : "Link a participant..."}</option>
                        {/* Each option's value is its index in `unlinked` */}
                        {unlinked.map((profile: AdminProfile, index: number) => (
                            <option key={profile.id} value={index}>{participantName(profile.user)} (@{profile.user.username})</option>
                        ))}
                    </select>
                    <NewPasswordField value={password} disabled={update.isPending} onChange={setPassword} />
                </div>
            ) : null}
        </EditableCard>
    );
}
