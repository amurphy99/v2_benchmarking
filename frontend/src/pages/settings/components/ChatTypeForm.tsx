import { updateUserSettings } from "@/api";
import { useAuth } from "@/context/AuthProvider";
import { toastMessage } from "@/utils/functions/toast_helper";
import { borderStyle, disabledStyle, formText, h4, plainButtonStyle, plainButtonStyleDisabled } from "@/utils/styling/sharedStyles";
import { useState } from "react";

type TaskOptions   = "chat" | "chatTopic" | "chatImage";

export default function ChatTypeForm() {
    const { profile } = useAuth();

    const [taskType,  setTaskType ] = useState<string         >(profile.settings.taskType);
    const [taskSubtype, setTaskSubtype] = useState<string     >(profile.settings.taskSubtype);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateUserSettings({
            patientCanSchedule: true,
            patientViewOverall: true,
            taskType: taskType,
            taskSubtype: taskSubtype,
        });
        toastMessage("Chat Settings updated", true); 
    };

    const handleFileChange = (e) => {
        console.log("Changed file")
        const file = e.target.files[0];
        setSelectedFile(file);
    };

    return (
        <form onSubmit={onSubmit} className="flex flex-col m-[1rem]">
        <div className={h4}> Chat Settings </div>
        {/*   Chat Task Type   */}
        <div className="flex flex-col"> 
            <span className={formText}>Chat Type</span>

            {/* Main Chat Type */}
            <div className="flex items-center justify-between gap-2">
                <select className={`w-50 ${borderStyle}`} value={taskType} onChange={(e) => setTaskType(e.target.value as TaskOptions)}>
                    <option value="chat" > Free Chat  </option>
                    <option value="chattopic"> Chat About A Topic </option>
                    <option value="chatimage"> Chat About An Image </option>
                </select>
            </div>

            {/* Prompt if chosen chatTopic or chatImage */}
            <span className={formText}>Chat Prompt</span>

            <div className="flex flex-col gap-2">
                <input type="text" disabled={taskType != "chattopic"} className={`w-full ${borderStyle} ${taskType != "chattopic" ? disabledStyle : ""}`} value={taskSubtype} 
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
                        if (taskType !== "chatimage") {
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
    )
}