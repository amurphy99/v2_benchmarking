import { Word, WordCloud } from "@isoterik/react-word-cloud";

function MyWordCloud( { topics } : { topics: string[] }) {
    const words: Word[] = topics.map((topic, i) => ({
        text: topic,
        value: getWordValue(i, topic),
    }))

    function getWordValue(i: number, word: string): number {
        const minFontSize = 25;
        const maxFontSize = 200;
        const fontSize = ((topics.length - i) / topics.length) * (maxFontSize - minFontSize) + minFontSize;
        return Math.round(fontSize);
    }

    if (topics.length > 0) {
        return (
            <WordCloud 
                words={words} 
                width={150} 
                height={100} 
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