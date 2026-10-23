/* Participant settings, plus caregiver links and new accounts for staff.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/AdminParticipants`

Lists the participants this user monitors as cards, most recent chat first:
every participant for staff, only the linked ones for a caregiver. A participant
is a patient profile; caregivers own no profile, so they never appear there. A
card's Edit settings button opens a modal, and nothing is saved until its Save
button.

Staff also see a Caregivers section, where each card adds or removes the
participants that caregiver monitors, and a button to the account creation page.
Opened from the Monitor page at `/admin/participants`.

*/
import type { ReactElement } from "react";
import      { useState     } from "react";
import      { useNavigate  } from "react-router-dom";

// From this project
import type { AdminCaregiver, AdminProfile, UpdateAdminProfilePayload } from "@/api";
import      { useAuth                                                 } from "@/context/AuthProvider";
import      { useAdminCaregivers, useUpdateCaregiverLinks             } from "@/hooks/queries/useAdminAccounts";
import      { useAdminProfiles, useUpdateAdminProfile                 } from "@/hooks/queries/useAdminProfiles";

// Components
import { CaregiverCard            } from "./components/participants/CaregiverCard";
import { ParticipantCard          } from "./components/participants/ParticipantCard";
import { ParticipantSettingsModal } from "./components/participants/ParticipantSettingsModal";
import { AdminButton              } from "./components/ui/AdminButton";
import { AdminPage                } from "./components/ui/AdminPage";
import { SectionHeader            } from "./components/ui/SectionHeader";


// ================================================================================
// Admin Participants
// ================================================================================
// Participant cards with a settings modal, plus caregiver link cards for staff
export function AdminParticipants(): ReactElement {
    const navigate = useNavigate();
    const isStaff  = useAuth().account.user.is_staff;

    // Participants, and the save that changes one of them
    const {data: participants, isLoading} = useAdminProfiles();
    const updateParticipant                = useUpdateAdminProfile();

    // Caregivers and their links (staff only; the backend refuses everyone else)
    const {data: caregivers, isLoading: caregiversLoading} = useAdminCaregivers(isStaff);
    const updateLinks                                      = useUpdateCaregiverLinks();

    // Participant whose settings modal is open (null while it is closed)
    const [editing, setEditing] = useState<AdminProfile | null>(null);

    // --------------------------------------------------------------------------------
    // Saving
    // --------------------------------------------------------------------------------
    // Save the modal's settings and close it once they are saved (a failed save keeps it open)
    const save = (participant: AdminProfile, body: UpdateAdminProfilePayload): void => {
        updateParticipant.mutate({id: participant.id, body}, {onSuccess: () => setEditing(null)});
    };

    // Save one caregiver's whole new set of links
    const saveLinks = (caregiver: AdminCaregiver, participantIds: number[]): void => {
        updateLinks.mutate({id: caregiver.id, body: {participant_ids: participantIds}});
    };

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <AdminPage>
            <div className="flex flex-col gap-6 pt-6">
                {/* Back link, page title, and (for staff) the account creation button */}
                <div className="bg-admin-panel border border-admin-border rounded-xl shadow-sm p-4">
                    <button className="text-sm text-admin-subtext hover:text-admin-text transition-colors mb-4 w-fit cursor-pointer" onClick={() => navigate("/admin")}>
                        ← Back to Monitor
                    </button>
                    <SectionHeader
                        title    = {isStaff ? "Accounts" : "Participant Settings"}
                        subtitle = {isStaff
                            ? "Create accounts, choose which participants each caregiver monitors, and change each participant's settings."
                            : "Choose each of your participants' avatar, language, and whether their chat audio is saved automatically. Changes apply from their next chat."}
                        actions  = {isStaff ? <AdminButton variant="primary" size="sm" onClick={() => navigate("/admin/accounts/new")}>Create account</AdminButton> : undefined}
                    />
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Caregivers (staff only) */}
                {/* -------------------------------------------------------------------------------- */}
                {isStaff ? (
                    <section className="flex flex-col gap-3">
                        <SectionHeader title="Caregivers" subtitle="Each caregiver's Monitor pages show only the participants linked here." />
                        {caregiversLoading ? (
                            <p className="text-sm text-admin-subtext">Loading caregivers...</p>
                        ) : (caregivers.length === 0) ? (
                            <p className="text-sm text-admin-subtext">No caregivers yet. Create one with the Create account button.</p>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {caregivers.map((caregiver: AdminCaregiver) => (
                                    <CaregiverCard
                                        key          = {caregiver.id}
                                        caregiver    = {caregiver}
                                        participants = {participants}
                                        saving       = {updateLinks.isPending}
                                        onChange     = {(participantIds: number[]) => saveLinks(caregiver, participantIds)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                ) : null}

                {/* -------------------------------------------------------------------------------- */}
                {/* Participants */}
                {/* -------------------------------------------------------------------------------- */}
                <section className="flex flex-col gap-3">
                    {isStaff ? <SectionHeader title="Participants" subtitle="Avatar, language, and recording default for each participant. Changes apply from their next chat." /> : null}
                    {isLoading ? (
                        <p className="text-sm text-admin-subtext">Loading participants...</p>
                    ) : (participants.length === 0) ? (
                        <p className="text-sm text-admin-subtext">{isStaff ? "No participants yet. Create one with the Create account button." : "No participants are linked to your account yet."}</p>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {participants.map((participant: AdminProfile) => (
                                <ParticipantCard key={participant.id} participant={participant} onEdit={() => setEditing(participant)} />
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* Settings modal for the participant being edited */}
            {(editing !== null) ? (
                <ParticipantSettingsModal
                    key         = {editing.id}
                    participant = {editing}
                    saving      = {updateParticipant.isPending}
                    onSave      = {(body: UpdateAdminProfilePayload) => save(editing, body)}
                    onClose     = {() => setEditing(null)}
                />
            ) : null}
        </AdminPage>
    );
}
