import { WordCloud } from "@isoterik/react-word-cloud";
import { ChatMessage } from "@/api";

function MyWordCloud( { messages } : { messages: ChatMessage[] }) {

    const tokenize = () => {
        // Initialize an empty object to store word frequencies
        const wordFrequency = {};

        // Iterate over each message in the data array
        messages.forEach(item => {
            // Split the message into words, remove punctuation, and convert to lowercase
            if (item.role === "user") {
                const words = item.content.replace(/[^\w\s]/g, '').toLowerCase().split(/\s+/);

                // Count the frequency of each word
                words.forEach(word => {
                    if (word.length > 3) {
                        if (wordFrequency[word]) {
                            wordFrequency[word]++;
                        } else {
                            wordFrequency[word] = 1;
                        }
                    }
                });
            }
        });

        // Convert the wordFrequency object into an array of objects with 'text' and 'value' properties
        const result = Object.keys(wordFrequency).map(word => ({
            text: word,
            value: wordFrequency[word]
        }));

        const minOccurences = Math.min(...result.map(w => w.value));
        const maxOccurences = Math.max(...result.map(w => w.value)) + 1;

        return {words: result, minOccurences: minOccurences, maxOccurences: maxOccurences};
    }

    const {words, minOccurences, maxOccurences} = tokenize();

    const resolveFontSize = (word) => {
        const minFontSize = 8;
        const maxFontSize = 36;
        const normalizedValue = (word.value - minOccurences) / (maxOccurences - minOccurences);
        const fontSize = minFontSize + normalizedValue * (maxFontSize - minFontSize);
        return Math.round(fontSize);
    }

    if (messages.length > 0) {
        return (
            <WordCloud 
                words={words} 
                width={100} 
                height={100} 
                fontSize={resolveFontSize}
                transition="all .3s ease"
                padding={1}
                rotate={() => { return 0;}}
                timeInterval={1}
            />
        );
    } else {
        return (
            <p className="text-5xl">Not available</p>
        )
    }
}

export default MyWordCloud;