/* Caregiver form for the participant's chat type, its topic, and their avatar.
--------------------------------------------------------------------------------
`@frontend/src/pages/settings/components/ChatTypeForm`

Saves through `PUT /api/settings/` for the profile the caregiver is linked to.
The avatar options are the same list the admin participant settings page uses
(`AVATAR_MODEL_CHOICES`, copied from the backend's
`UserSettings.MODEL_CHOICES`), leaving out reserved choices with no avatar built.

*/
import { useEffect, useState } from "react";

// From this project
import { AVATAR_MODEL_CHOICES, getUserSettings, updateUserSettings } from "@/api";
import { getAvatarEntry, hasAvatarEntry } from "@/pages/common/avatar/avatarRegistry";
import { useUserSettings } from "@/hooks/queries/useUserSettings";
import { toastMessage    } from "@/utils/functions/toast_helper";
import { borderStyle, disabledStyle, formText, h4, plainButtonStyle, plainButtonStyleDisabled, rowThree } from "@/utils/styling/sharedStyles";

type TaskOptions   = "chat" | "chatTopic" | "chatImage";

export default function ChatTypeForm() {
    const [taskType,  setTaskType ]         = useState<string     >("");
    const [taskSubtype, setTaskSubtype]     = useState<string     >("");
    const [selectedFile, setSelectedFile]   = useState<File | null>(null);
    const [model, setModel]                 = useState<string     >("");
    
    useEffect(() => {
        getUserSettings().then(settings => {
            setTaskType(settings.taskType);
            setTaskSubtype(settings.taskSubtype);
            setModel(settings.modelChoice);
        });
    }, [])

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateUserSettings({
            patientCanSchedule: true,
            patientViewOverall: true,
            taskType: taskType,
            taskSubtype: taskSubtype,
            modelChoice: model,
        });
        toastMessage("Chat Settings updated", true); 
    };

    const handleFileChange = (e: any) => {
        console.log("Changed file")
        const file = e.target.files[0];
        setSelectedFile(file);
    };

    return (
        <form onSubmit={onSubmit} className="flex flex-col p-[1rem] w-full max-w-[50rem]">
        <div className={h4}> Chat Settings </div>
        {/* Main Chat Type */}
        <div className="flex flex-row gap-2 w-full">
            <div className={`w-1/2 ${rowThree}`}>
                <label className={formText}>Chat Type</label>
                <select className={`${borderStyle}`} value={taskType} onChange={(e) => setTaskType(e.target.value as TaskOptions)}>
                    <option value="chat" > Free Chat  </option>
                    <option value="chattopic"> Chat About A Topic </option>
                    <option value="chatimage"> Chat About An Image </option>
                </select>
            </div>
            { /* Avatar Model */}
            <div className={`w-1/2 ${rowThree}`}>
                <label className={formText}>Avatar Model</label>
                <select className={`${borderStyle}`} value={model} onChange={(e) => setModel(e.target.value)}>
                    {AVATAR_MODEL_CHOICES.filter(hasAvatarEntry).map((choice: string) => <option key={choice} value={choice}>{getAvatarEntry(choice).label}</option>)}
                </select>
            </div>
        </div>

        {/* Prompt if chosen chatTopic or chatImage */}
        <span className={formText}>Chat Prompt</span>

        <div className="flex flex-col gap-2">
            <input type="text" disabled={taskType != "chattopic"} 
                className={`w-full max-w-[30rem] ${borderStyle} ${taskType != "chattopic" ? disabledStyle : ""}`} value={taskSubtype} 
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

        <br />

        <button type="submit" className="btn btn-primary w-fit">Save Settings</button>

    </form>
    )
}