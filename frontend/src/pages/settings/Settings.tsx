import { useAuth } from "@/context/AuthProvider";
import { toastMessage } from "@/utils/functions/toast_helper";
import { dateFormatShort } from "@/utils/styling/numFormatting";
import { h4, plainButtonStyle, plainButtonStyleDisabled, switchLabel, switchStyle } from "@/utils/styling/sharedStyles";
import { ChangeEventHandler, useState } from "react";
import { Button } from "react-bootstrap";

const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type PeriodOptions = "N" | "W" | "M";
type TaskOptions   = "chat" | "chatTopic" | "chatImage";
type Methods = { submit: () => void };

export function Settings() {
    const { profile } = useAuth();
    const [autoRenew, setAutoRenew] = useState<boolean        >(profile.goal.auto_renew);
    const [target,    setTarget   ] = useState<number         >(profile.goal.target);
    const [period,    setPeriod   ] = useState<"N" | "W" | "M">(profile.goal.period);
    const [startDay,  setStartDay ] = useState<string         >(profile.goal.start_date);
    const [startDOW,  setStartDOW ] = useState<number         >(profile.goal.start_dow);
    const [taskType,  setTaskType ] = useState<string         >(profile.settings.taskType);
    const [taskSubtype, setTaskSubtype] = useState<string     >(profile.settings.taskSubtype);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const { windowLabel, todayIdx } = getWindowLabel(startDOW);
    
    // Form submission logic 
    // ToDo: actually change the goal -- maybe do the async/await here + try and except
    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        toastMessage("Settings updated (To-do)", true); 
    };

    const handleFileChange = (e) => {
        console.log("Changed file")
        const file = e.target.files[0];
        setSelectedFile(file);
    };

    // Common styles
    const formText      = "font-medium fw-bold";
    const borderStyle   = "border border-gray-100 py-1 px-2";
    const disabledStyle = `bg-gray-100 text-gray-400 ${borderStyle}`;
    const rowThree      = "flex flex-col justify-around gap-0 w-50";

    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    return (
    <form onSubmit={onSubmit} className="flex flex-col w-3/4 sm:w-1/2 m-[1rem]">
        <div className={h4}> Patient Goal </div>
    
        {/*   Auto Renew   */}
        <div className={switchStyle}>
            <label className={switchLabel}> Auto-renew goal frequency </label>
            <input className="form-check-input" type="checkbox" role="switch" checked={autoRenew ?? false} onChange={(e) => setAutoRenew(e.target.checked)}/>
        </div>


        {/*   Frequency   */}
        <div className="flex flex-col"> 
            <span className={formText}>Frequency</span>

            <div className="flex items-center justify-between gap-2">
                {/* Type of activity we have the goal for (?) */}
                <select disabled className={`w-40 ${disabledStyle}`}> <option>Daily Chat</option> </select>

                {/* Goal number */}
                <input type="number" min={1} className={`w-15 ${borderStyle}`} value={target} 
                    onChange={(e) => setTarget(+e.target.value)} />

                {/* Time unit */}
                <span className="w-20"> Times Per </span>
                <select className={`w-25 ${borderStyle}`} value={period} onChange={(e) => setPeriod(e.target.value as PeriodOptions)}>
                    <option value="Week" > Week  </option>
                    <option value="Month"> Month </option>
                </select>
            </div>
        </div>


        {/*   Start Day & Window   */}
        <div className="flex items-center gap-2">
            {/* Start day */}
            <div className={rowThree}>
                <label className={formText}>Start Day</label>
                <select className={`mt-1 ${borderStyle}`} value={startDOW} onChange={(e) => setStartDOW(+e.target.value)} >
                    {weekdayNames.map((day, i) => (<option key={i} value={i}> {day} {i === todayIdx && "(Today)"} </option>))}
                </select>
            </div>

            {/* Current window preview */}
            <div className={rowThree}>
                <label className={formText}>Current Goal Window</label>
                <span className={`mt-1 ${disabledStyle}`}> {windowLabel} </span>
            </div>
        </div>

        <br />

        <div className={h4}> Chat Settings </div>
        {/*   Chat Task Type   */}
        <div className="flex flex-col"> 
            <span className={formText}>Chat Type</span>

            {/* Main Chat Type */}
            <div className="flex items-center justify-between gap-2">
                <select className={`w-50 ${borderStyle}`} value={taskType} onChange={(e) => setTaskType(e.target.value as TaskOptions)}>
                    <option value="chat" > Free Chat  </option>
                    <option value="chatTopic"> Chat About A Topic </option>
                    <option value="chatImage"> Chat About An Image </option>
                </select>
            </div>

            {/* Prompt if chosen chatTopic or chatImage */}
            <span className={formText}>Chat Prompt</span>

            <div className="flex flex-col gap-2">
                <input type="text" disabled={taskType != "chatTopic"} className={`w-full ${borderStyle} ${taskType != "chatTopic" ? disabledStyle : ""}`} value={taskSubtype} 
                    onChange={(e) => setTaskSubtype(e.target.value)} />
                <input
                    type="file"
                    accept="image/*"
                    id="upload-image"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
                <label 
                    htmlFor="upload-image"
                    className={` ${taskType != "chatImage" ? plainButtonStyleDisabled : plainButtonStyle} `}
                    onClick={(e) => {
                        if (taskType !== "chatImage") {
                        e.preventDefault(); // stop the file picker from opening
                        }
                    }}
                >
                    Upload Image
                </label>
                <div className="italic text-gray-500"> {selectedFile ? `Selected file: ${selectedFile.name}` : "No file selected"} </div>
            </div>
        </div>

        <br />

        <button type="submit" className="btn btn-primary w-fit">Save Settings</button>

    </form>
    );
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
    