import { useState    } from "react";
import { useNavigate } from "react-router-dom";
import { BsPlayCircle, BsPauseCircle, BsStopCircle } from "react-icons/bs";

import useLiveChat   from "@/hooks/useLiveChat";
import SaveChatModal from "@/components/modals/SaveChatModal";

import { LocalChatMessage, useLocalChatSession } from "@/hooks/live-chat";
import Avatar from "../common/avatar/Avatar";
import { Spinner } from "react-bootstrap";
import { useUserSettings } from "@/hooks/queries/useUserSettings";


// ====================================================================
// Chat
// ====================================================================
// ToDo: Move speech providers folder to utils, fix the index
// ToDo: Might need to add the user/token stuff to the websocket
export function Chat() {
    const navigate = useNavigate();
    const { data: settings, isLoading } = useUserSettings();
    const [botMessage, setBotMessage] = useState(<>Chat with me!</>);
    const [emotion, setEmotion] = useState<string>("Neutral");
    const [emoCount, setEmoCount] = useState<number>(0);

    // Local (frontend, view-related only) chat tracking
    const { pushMessage, session } = useLocalChatSession();
    
    const onUserUtterance   = (text: string) => { 
        pushMessage("user",      text); 
        setBotMessage( 
            <div className="flex flex-row gap-2 justify-center">
                <Spinner animation="grow" />
                <Spinner animation="grow" />
                <Spinner animation="grow" />
            </div>
        );
    };
    const onSystemUtterance = (text: string) => { 
        pushMessage("assistant", text); 
        setBotMessage(<>{text}</>)
    };
    // Happy, Sad, Surprised, Scared, Angry, Neutral
    const onEmotion = (emotion: string) => {
        setEmotion(emotion);
        setEmoCount((t) => t + 1);
    }

    // selecting the type of chat
    type ChatMode = "default" | "memory_activity";
    const [chatMode, setChatMode] = useState<ChatMode>("default");

    type DebugTurn = {
        ts: number;
        role: "user" | "assistant";
        text: string;
        state?: string;
    };

    const [debugTurns, setDebugTurns] = useState<DebugTurn[]>([]);

    // Live-chat hook

    const { start, stop, save } = useLiveChat({
        onUserUtterance,
        onSystemUtterance,
        onScores: () => {},
        onEmotion,
        wsPath: chatMode === "memory_activity" ? "/ws/chat/activity/" : "/ws/chat/",
        onDebugTurn: (t) =>
            setDebugTurns((prev) => [...prev, { ts: Date.now(), ...t }]),
        onRagParseError: () => {
            setBotMessage(
              <>Sorry, I didn’t quite catch that. Could you please repeat what you said?</>
            );
        },
        onChatError: () => {
            setBotMessage(
              <>Sorry, I didn’t quite catch that. Could you please repeat what you said?</>
            );
        },
        onChatClosed: () => {
            setRecording(false);
            setShowModal(false);
            navigate("/goal");
        },
    });
    
    // Separate recording flag that we control ourselves
    const [recording, setRecording ] = useState(false);
    const startChat = () => {
		start();
		setRecording(true);
	};
	const pauseChat = () => {
		stop();
		setRecording(false);
	};

    // Modal control
    const [showModal, setShowModal] = useState(false);
    const endChatModal = () => {
		setShowModal(true);
		if (!recording) {
			pauseChat();
		}
	};

    if (isLoading) {
        return <div>Loading...</div>;
    }

    const model = settings.modelChoice;

	const saveChat = () => {
		save();
		setShowModal(false);
		navigate("/chat/end");
	}; // use the stop speaking callback

    // --------------------------------------------------------------------
    // Return UI elements
    // --------------------------------------------------------------------
    const stopStyle = "flex flex-col gap-2 items-center";
    return (
    <>
        <div className="flex flex-col h-[85vh]">
            {!window.isMobile ? 
                <div className="flex flex-row justify-center h-7/10 m-[1rem] mt-[4rem]">
                    <div className="sm:w-1/5" />
                    <div className="mt-[1rem] w-full sm:w-1/2"> 
                        <Avatar emotion={emotion} emoCount={emoCount} model={"qt"} zoom="body" /> 
                    </div> 
                    <div className="hidden sm:inline-block bubble"> 
                        {botMessage} 
                    </div>
                </div>
                :  
                <div className="flex flex-col mx-[1rem] mt-[2rem] h-[65vh]">
                    <Avatar emotion={emotion} emoCount={emoCount} model={model} zoom="head"/>
                    <div className="text-3xl font-extrabold mt-[4rem] mx-[2rem] overflow-y-auto hidden-scrollbar h-full">
                        {botMessage}
                    </div>
                </div>
            }

            {/* Buttons for starting/pausing the chat & saving the chat history/ending the chat */}
           <div
                className={`flex flex-row ${
                    chatMode === "memory_activity" ? "mb-6" : "mb-[5rem]"
                } mx-[20vw] gap-[4em] justify-around`}
            >
                <RecordButton recording={recording} stopRecording={pauseChat} startRecording={startChat}/>
                <button className={stopStyle} onClick={endChatModal}> <BsStopCircle size={"8vh"} color={"black"} /> End Chat </button>

                <select
                value={chatMode}
                onChange={(e) => {
                    setChatMode(e.target.value as ChatMode);
                    setDebugTurns([]);
                }}
                disabled={recording}
                className="border max-h-1/2 rounded px-2 py-2"
                >
                <option value="default">default</option>
                <option value="memory_activity">memory_activity</option>
                </select>
            </div>

            {/* Added only for debugging, will probably remove later */}
            {chatMode === "memory_activity" && (
            <div className="border rounded p-4 mx-[10vw] mb-[2rem] h-[35vh] overflow-y-auto">
                <div className="font-semibold mb-2">
                Memory Activity Debug (testing)
                </div>

                {debugTurns.map((t, i) => (
                <div key={i} className="mb-2">
                    <div className="text-xs text-gray-500">
                    {t.role}
                    {t.state ? ` · state: ${t.state}` : ""}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">
                    {t.text}
                    </div>
                </div>
                ))}
            </div>
            )}
        </div>
        

        {/* SaveChatModal, controlled with props */}
        <SaveChatModal show={showModal} onClose={() => setShowModal(false)} saveChat={saveChat}/>
    </>
    );
}


// Returns the Play or Pause buttons
function RecordButton({ recording, stopRecording, startRecording } : { recording: boolean, stopRecording: () => void, startRecording: () => void }) {
    const style = "flex flex-col gap-2 items-center";

    const icon    = recording ? <BsPauseCircle size={"8vh"} style={{color: "black"}}/> : <BsPlayCircle size={"8vh"} style={{color: "black"}}/>;
    const text    = recording ? "Pause Chat" : "Start Chat";
    const onClick = recording ? stopRecording : startRecording;

    return <button className={style} onClick={onClick}> {icon} {text} </button>;
}

const default_message = `Chat with me!`;
export function getRecentMessage(messages: LocalChatMessage[], fallback = default_message): string {
    const latest = messages.reduce<LocalChatMessage | null>((acc, m) => {
        if (m.role !== "assistant") return acc; // skip
        return !acc || m.ts > acc.ts ? m : acc; // keep newer
    }, null);
    return latest ? latest.content : fallback;
}