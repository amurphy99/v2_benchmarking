interface ChatMessage {
    role: string;
    text: string;
    ts  : string;
}

const dateFormatOptionsTS: Intl.DateTimeFormatOptions = {
    hour   : "2-digit",
    minute : "2-digit",
    second : "2-digit",
};

export default function BasicTranscript({ messages } : { messages: ChatMessage[] }) {
    return (
        <div>
            {messages.map((msg, index) => (
                <div key={index} className="flex flex-row gap-2">
                    <strong>{msg.role === "user" ? "User" : "LLM"}:</strong> 
                    <p>{msg.text}</p>
                    <i>{new Date(msg.ts).toLocaleDateString("en-US", dateFormatOptionsTS)}</i>
                </div>
            ))}
        </div>
    )
}