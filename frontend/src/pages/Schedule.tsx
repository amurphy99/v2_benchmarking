import { useMemo, useState } from "react";
import { Button            } from "react-bootstrap";

import FullCalendar   from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import rrulePlugin    from "@fullcalendar/rrule";

import { Reminder     } from "@/api";
import { useReminders } from "@/hooks/queries/useReminders";
import   ReminderModal  from "@/components/modals/ReminderModal";

// Helper: 0-6 -> SU...SA for RRULE
const BYDAY_MAP = ['SU','MO','TU','WE','TH','FR','SA'];


// ====================================================================
// Schedule
// ====================================================================
export default function Schedule() {
    // Call useReminders function from hooks/queries/ to get Reminder objects
    const { data: reminders, isLoading } = useReminders();
    
    // Memoise to rebuild only when reminders change
    const events = useMemo(() => toFcEvents(reminders), [reminders]);

    // Setup a blank reminder object
    const emptyReminder: Reminder = { id: 0, title: "New Reminder", notes: null, start: '', end: null, startTime: '', endTime: '', daysOfWeek: [] };
    const [selected,  setSelected ] = useState<Reminder>(emptyReminder);
    const [showModal, setShowModal] = useState<boolean>(false);
    const [editing,   setEditing  ] = useState<boolean>(false);

    // Handlers
    const openNew = () => {
        setSelected(emptyReminder);
        setEditing(false);
        setShowModal(true);
    };

    const handleEventClick = (info) => {
        const { reminder } = info.event.extendedProps;
        setSelected(reminder);
        setEditing(true);
        setShowModal(true);
    }; 

    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    if (isLoading) { return <p>Loading reminders...</p>; }
    return (
    <div className="mt-[1rem]">
        <div className="h-[75vh] mx-[2rem]">
            <FullCalendar
                plugins     = {[ timeGridPlugin, rrulePlugin ]}
                initialView = "timeGridWeek"
                height      = "100%"
                events      = {events}
                eventClick  = {handleEventClick}
            />
        </div>

        <div className="flex justify-center m-[2rem]">
            <Button onClick={openNew} variant="outline-dark" size="lg"> Create a New Reminder </Button>
        </div>

        <ReminderModal rem={selected} show={showModal} existing={editing} onHide={() => setShowModal(false)} />
    </div>
    );
}


// --------------------------------------------------------------------
// Build an array for FullCalendar
// --------------------------------------------------------------------
// Keeps a back-reference to the original object in 'extendedProps.reminder'
function toFcEvents(reminders: Reminder[]) {
    return reminders.map(r => {
        // Has weekly repetition -> use RRULE
        if (r.daysOfWeek?.length) {
            return {
                id   : r.id.toString(),
                title: r.title,
                rrule: {
                    freq     : "weekly",
                    byweekday: r.daysOfWeek.map(i => BYDAY_MAP[i]),
                    dtstart  : `${r.start}T${r.startTime}`,
                    ...(r.end && { until: r.end })            // stop date 
                },
                duration     : `${r.endTime || r.startTime}`, // FC needs a duration or explicit end
                extendedProps: { reminder: r }                // keeps full object
            };
        }

        // Non-repeating events
        return {
            id    : r.id.toString(),
            title : r.title,
            start : `${r.start}T${r.startTime}`,
            end   : `${r.end ?? r.start}T${r.endTime}`,      // fallback if end/date null
            extendedProps: { reminder: r }
        };
    });
}
