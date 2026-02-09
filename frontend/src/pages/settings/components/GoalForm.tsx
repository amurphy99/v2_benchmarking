import { getGoal, getProfile, updateGoal } from "@/api";
import { toastMessage } from "@/utils/functions/toast_helper";
import { dateFormatShort } from "@/utils/styling/numFormatting";
import { borderStyle, disabledStyle, formText, h4, rowThree, switchLabel, switchStyle } from "@/utils/styling/sharedStyles";
import { useEffect, useState } from "react";

const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type PeriodOptions = "N" | "W" | "M";

export default function GoalForm() {
    const [autoRenew, setAutoRenew] = useState<boolean        >();
    const [target,    setTarget   ] = useState<number         >();
    const [period,    setPeriod   ] = useState<"N" | "W" | "M">("N");
    const [startDay,  setStartDay ] = useState<string         >("");
    const [startDOW,  setStartDOW ] = useState<number         >();
    const [windowLabel, setWindowLabel] = useState<string     >();
    const [todayIdx, setTodayIdx  ] = useState<number         >();

    useEffect(() => {
        getGoal().then((goal) => {
            setAutoRenew(goal.auto_renew);
            setTarget(goal.target);
            setPeriod(goal.period);
            setStartDay(goal.start_date);
            setStartDOW(goal.start_dow);
            const { windowLabel: wlabel, todayIdx: tidx } = getWindowLabel(goal.start_dow);
            setWindowLabel(wlabel);
            setTodayIdx(tidx);
        })
    }, [])

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateGoal({
            auto_renew: autoRenew,
            target: target,
            period: period,
            start_date: startDay,
            start_dow: startDOW,
        })
        toastMessage("User goal updated", true); 
    };

    return (
        <form onSubmit={onSubmit} className="flex flex-col px-[1rem] w-full max-w-[50rem]">
        <div className={h4}> Patient Goal </div>
    
        {/*   Auto Renew   */}
        <div className={switchStyle}>
            <label className={switchLabel}> Auto-renew goal frequency </label>
            <input className="form-check-input" type="checkbox" role="switch" checked={autoRenew ?? false} onChange={(e) => setAutoRenew(e.target.checked)}/>
        </div>


        {/*   Frequency   */}
        <div className="flex flex-col w-fit"> 
            <span className={formText}>Frequency</span>

            <div className="flex items-center justify-between gap-2">
                {/* Type of activity we have the goal for (?) */}
                <select disabled className={`w-40 ${disabledStyle}`}> <option>Daily Chat</option> </select>

                {/* Goal number */}
                <input type="number" min={1} className={`w-15 ${borderStyle}`} defaultValue={target} 
                    onChange={(e) => setTarget(+e.target.value)} />

                {/* Time unit */}
                <span className="w-20"> Times Per </span>
                <select className={`w-25 ${borderStyle}`} defaultValue={period} onChange={(e) => setPeriod(e.target.value as PeriodOptions)}>
                    <option value="Week" > Week  </option>
                    <option value="Month"> Month </option>
                </select>
            </div>
        </div>


        {/*   Start Day & Window   */}
        <div className="flex items-center gap-2">
            {/* Start day */}
            <div className={`w-1/2 ${rowThree}`}>
                <label className={formText}>Start Day</label>
                <select className={`mt-1 ${borderStyle}`} defaultValue={startDOW} onChange={(e) => setStartDOW(+e.target.value)} >
                    {weekdayNames.map((day, i) => (<option key={i} value={i}> {day} {i === todayIdx && "(Today)"} </option>))}
                </select>
            </div>

            {/* Current window preview */}
            <div className={`w-1/2 ${rowThree}`}>
                <label className={formText}>Current Goal Window</label>
                <span className={`mt-1 ${disabledStyle}`}> {windowLabel} </span>
            </div>
        </div>

        <button type="submit" className="btn btn-primary w-fit my-2">Save Goal</button>

        </form>
    )
}

// --------------------------------------------------------------------
// Label for the "Current Goal Window" form component
// --------------------------------------------------------------------
function getWindowLabel(startDay: number): { windowLabel: string; todayIdx: number } {
    // Get start day from the current date and the starting form data
    const today       = new Date();
    const todayIdx    = today.getDay();                            // Sun = 0, etc.
    const diff        = (7 + todayIdx - ((startDay + 1) % 7)) % 7; // day of the week
    
    // Set the window start and end dates
    const windowStart = new Date(today      ); windowStart.setDate(today      .getDate() - diff);
    const windowEnd   = new Date(windowStart); windowEnd  .setDate(windowStart.getDate() + 6   );
    const windowLabel = `${dateFormatShort.format(windowStart)} - ${dateFormatShort.format(windowEnd)} (7 Days)`;

    return { windowLabel, todayIdx };
};
    