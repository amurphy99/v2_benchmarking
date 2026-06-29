import { useRef, useState } from "react";
import { useNavigate      } from "react-router-dom";
import { Spinner          } from "react-bootstrap";
import { BsPlayCircle, BsPauseCircle, BsStopCircle } from "react-icons/bs";

// From this project
import { LocalChatMessage, useLocalChatSession } from "@/hooks/live-chat";
import { Avatar          } from "../common/avatar/Avatar";
import { useUserSettings } from "@/hooks/queries/useUserSettings";
import   SaveChatModal     from "@/components/modals/SaveChatModal";
import   useLiveChat       from "@/hooks/useLiveChat";


// ================================================================================
// Chat Page (UI that users see during a webapp chat)
// ================================================================================
// TODO: Move speech providers folder to utils, fix the index
// TODO: Might need to add the user/token stuff to the websocket
export function Chat() {
    const navigate = useNavigate();
    const { data: settings, isLoading } = useUserSettings();
    const [botMessage, setBotMessage] = useState(<>Chat with me!</>);
    const avatarRef = useRef<any>(null);

    // Local (frontend, view-related only) chat tracking
    const { pushMessage, session } = useLocalChatSession();
    
    // --------------------------------------------------------------------------------
    // WebSocket Response Callbacks
    // --------------------------------------------------------------------------------
    // User utterance received (STT result from the backend) -> set "thinking" spinner indicator
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

    // System utterance received
    const onSystemUtterance = (text: string) => { pushMessage("assistant", text); setBotMessage(<>{text}</>); };

    // Happy, Sad, Surprised, Scared, Angry, Neutral
    const onEmotion = (emotion: string) => {
        if (avatarRef.current) { avatarRef.current.playEmotion(emotion); }
    }

    const onExpression = (data: any) => {
        if (avatarRef.current) {
            if      (data.type == "emotion"  ) { avatarRef.current.playEmotion  (data.value); } 
            else if (data.type == "animation") { avatarRef.current.playAnimation(data.value); }
        }
    }

    // --------------------------------------------------------------------------------
    // IDK, unlabeled stuff people add in
    // --------------------------------------------------------------------------------
    // Selecting the type of chat
    type ChatMode = "default" | "memory_activity";
    const [chatMode, setChatMode] = useState<ChatMode>("default");


    // This should be deleted
    type DebugTurn = {
        ts: number;
        role: "user" | "assistant";
        text: string;
        state?: string;
    };

    const [debugTurns, setDebugTurns] = useState<DebugTurn[]>([]);



    // Live-chat hook
    const { start, stop, save, chatEnding } = useLiveChat({
        onUserUtterance,
        onSystemUtterance,
        onScores: () => {},
        onEmotion,
        onExpression,
        wsPath: chatMode === "memory_activity" ? "/ws/chat/activity/" : "/ws/chat/",

        onDebugTurn     : (t) => { setDebugTurns((prev) => [...prev, { ts: Date.now(), ...t }]);                                 },
        onRagParseError : ( ) => { setBotMessage(<>Sorry, I didn't quite catch that. Could you please repeat what you said?</>); },
        onChatError     : ( ) => { setBotMessage(<>Sorry, I didn't quite catch that. Could you please repeat what you said?</>); },

        // Chat ended
        onChatClosed: () => {
            setRecording(false);
            setShowModal(false);
            navigate("/chat/end"); // navigate("/goal")
        },
        onChatPaused      : (       ) => { setRecording     (false  ); },
        onRecordingStatus : (enabled) => { setAdminRecording(enabled); },
    });
    
    // Separate recording flag that we control ourselves
    const [recording,       setRecording      ] = useState(false);
    const [adminRecording,  setAdminRecording ] = useState(false); // true when admin has enabled audio saving
    const startChat = () => { start(); setRecording(true ); };
	const pauseChat = () => { stop (); setRecording(false); };
	const saveChat  = () => { save (); setShowModal(false); navigate("/chat/end"); }; // use the stop speaking callback

    // Modal control
    const [showModal, setShowModal] = useState(false);
    const endChatModal = () => {setShowModal(true); if (!recording) { pauseChat(); } };

    // Is this the avatar? idk we need comments
    const model = settings.modelChoice;

    // ================================================================================
    // Return UI elements
    // ================================================================================
    if (isLoading) { return <div>Loading...</div>; }

    const stopStyle = "flex flex-col gap-2 items-center";
    return (
    <>
        <div className="flex flex-col h-[85vh]">
            {!window.isMobile ? 
                <div className="flex flex-row justify-center h-7/10 m-[1rem] mt-[4rem]">
                    <div className="sm:w-1/5" />
                    <div className="mt-[1rem] w-full sm:w-1/2"> 
                        <Avatar model={model} zoom="body" ref={avatarRef} /> 
                    </div> 
                    <div className="hidden sm:inline-block bubble"> 
                        {botMessage} 
                    </div>
                </div>
                :  
                <div className="flex flex-col mx-[1rem] mt-[2rem] h-[65vh]">
                    <Avatar model={model} zoom="head" ref={avatarRef}/>
                    <div className="text-3xl font-extrabold mt-[4rem] mx-[2rem] overflow-y-auto hidden-scrollbar h-full">
                        {botMessage}
                    </div>
                </div>
            }

            {/* Buttons for starting/pausing the chat & saving the chat history/ending the chat */}
           <div className={`flex flex-col ${chatMode === "memory_activity" ? "mb-6" : "mb-[5rem]"} items-center gap-3`}>

                {/* -------------------------------------------------------------------------------- */}
                {/* Recording Indicator (shown when admin has set audio to be saved on chat end) */}
                {/* -------------------------------------------------------------------------------- */}
                {adminRecording && (
                    <div className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                        Recording
                    </div>
                )}


                <div className="flex flex-row mx-[20vw] gap-[4em] justify-around w-full">

                    {/* Again, I don't know what this is... */}
                    {chatEnding
                        ? <div className="flex flex-col gap-2 items-center text-gray-500">
                            <BsStopCircle size={"8vh"} color={"gray"} />
                            Ending chat...
                        </div>
                        : <>
                            <RecordButton recording={recording} stopRecording={pauseChat} startRecording={startChat}/>
                            <button className={stopStyle} onClick={endChatModal}> <BsStopCircle size={"8vh"} color={"black"} /> End Chat </button>
                        </>
                    }

                    
                    {/* -------------------------------------------------------------------------------- */}
                    {/* Select Chat Mode */}
                    {/* -------------------------------------------------------------------------------- */}
                    <select
                        value     = {chatMode}
                        onChange  = {(e) => {setChatMode(e.target.value as ChatMode); setDebugTurns([]); }}
                        disabled  = {recording}
                        className = "border max-h-1/2 rounded px-2 py-2"
                    >
                        <option value="default"         >default</option>
                        <option value="memory_activity" >memory_activity</option>
                    </select>



                </div>  {/* end flex-row buttons */}
            </div>  {/* end flex-col wrapper */}

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


// --------------------------------------------------------------------------------
// Returns the Play or Pause buttons
// --------------------------------------------------------------------------------
function RecordButton({ recording, stopRecording, startRecording } : { recording: boolean, stopRecording: () => void, startRecording: () => void }) {
    const style = "flex flex-col gap-2 items-center";

    const icon    = recording ? <BsPauseCircle size={"8vh"} style={{color: "black"}}/> : <BsPlayCircle size={"8vh"} style={{color: "black"}}/>;
    const text    = recording ? "Pause Chat" : "Start Chat";
    const onClick = recording ? stopRecording : startRecording;

    return <button className={style} onClick={onClick}> {icon} {text} </button>;
}


// --------------------------------------------------------------------------------
// idk the purpose of this, was unlabeled
// --------------------------------------------------------------------------------
const default_message = `Chat with me!`;
export function getRecentMessage(messages: LocalChatMessage[], fallback = default_message): string {
    const latest = messages.reduce<LocalChatMessage | null>((acc, m) => {
        if (m.role !== "assistant") return acc; // skip
        return !acc || m.ts > acc.ts ? m : acc; // keep newer
    }, null);
    return latest ? latest.content : fallback;
}

