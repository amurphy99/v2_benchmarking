import { Message } from "@/utils/misc/descriptions";
// import DOMPurify from 'dompurify';

export default function ChatExample( {messages} : {messages: Message[]} ) {
    return (
        <div className="flex flex-col gap-2">
            {messages.map((message, idx) => {
                // const msg = DOMPurify.sanitize(message.text);
                return (
                    <div key={idx} className="flex flex-row gap-2">
                        <b>{message.sender}:</b> <div dangerouslySetInnerHTML={{ __html: message.text}}></div>
                    </div>
                )
            })}
        </div>
    )
}