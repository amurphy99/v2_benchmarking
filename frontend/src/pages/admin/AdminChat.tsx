import { useState  }   from "react";
import { useParams }   from "react-router-dom";
import BasicTranscript from "./components/BasicTranscript";
import LiveBiomarkers  from "./components/LiveBiomarkers";

// Hook for handling the WebSocket connection
import useChatListener from "@/hooks/chat-listener/useChatListener";

// --------------------------------------------------------------------------------
// WebSocket message type interfaces
// --------------------------------------------------------------------------------
interface ChatMessage {
    role: string;
    text: string;
    ts  : string;
}

interface BiomarkerScoreSet {
    anomia?       : number;
    grammar?      : number;
    pragmatic?    : number;
    pronunciation?: number;
    prosody?      : number;
    turntaking?   : number;
}

// ================================================================================
// AdminChat
// ================================================================================
// Monitor a participant's ChatSession in real time
export function AdminChat() {
    // Setup
    const { id } = useParams();
    const [messages,        setMessages       ] = useState<ChatMessage      []>([]);
    const [biomarkerScores, setBiomarkerScores] = useState<BiomarkerScoreSet[]>([]);

    // WebSocket Setup
    const { send, connected } = useChatListener({
        recording   : true,
        session_id  : id,
        onWSMessage : handleWsMessage,
    });

    // --------------------------------------------------------------------------------
    // Handle Incoming Data
    // --------------------------------------------------------------------------------
    function addMessage(message: ChatMessage) {
        setMessages((prevMessages) => [...prevMessages, message]);
    }

    function handleWsMessage(event: any) {
        const data = JSON.parse(event);
        if (data.type == "history") {
            const messages: ChatMessage[] = data.messages;
            for (const msg of messages) { addMessage(msg); }
        } 
        else if (data.type == "biomarker_scores") { setBiomarkerScores((prevScores) => [...prevScores, data.data]); } 
        else if (data.type == "message"         ) { addMessage(data); }
    }

    // --------------------------------------------------------------------------------
    // Sample Methods 
    // --------------------------------------------------------------------------------
    function addSampleMessage() {
        const sampleMessage = `{
            "type": "message",
            "role": "user",
            "text": "This is a sample message.",
            "ts"  : "${new Date().toISOString()}"
        }`;
        handleWsMessage(sampleMessage);
    }

    function addSampleBiomarkerScore() {
        const sampleScore = `{
            "type": "biomarker_scores",
            "data": {
                "prosody": ${Math.random().toFixed(3)},
                "pronunciation": ${Math.random().toFixed(3)},
                "turntaking": ${Math.random().toFixed(3)},
                "grammar": ${Math.random().toFixed(3)},
                "anomia": ${Math.random().toFixed(3)},
                "pragmatic": ${Math.random().toFixed(3)}
            }
        }`;
        handleWsMessage(sampleScore);
    }

    // ================================================================================
    // Page Components
    // ================================================================================
    return (
        <div>
            <h1 className="m-[2rem]">Admin Page For Chat {id}</h1>
            <div className="flex flex-row gap-[2rem] m-[2rem]">
                <button className="btn btn-primary" onClick={addSampleMessage}>Add sample message</button>
                <button className="btn btn-primary" onClick={addSampleBiomarkerScore}>Add sample biomarker score</button>
            </div>
            <div className="flex flex-row m-[1rem]">
                <div className="w-1/2">
                    <BasicTranscript messages={messages} />
                </div>
                <div className="w-1/2 min-h-[400px]">
                    <LiveBiomarkers scores={biomarkerScores} />
                </div>
            </div>
        </div>
    )
}