import { BiomarkerType } from "@/api";

interface Card {
    content: JSX.Element;
    caption: string;
}

const cards = {
    "anomia": {
        practiceCards: [
            {
                content: <img className="h-full" src="/images/anomia-1.png" />,
                caption: "Begin with pleasant topics, keep sentence short, simple and direct."
            },
            {
                content: <h1>"Going to the grocery store makes me hungry."</h1>,
                caption: "Talk to them with statements."
            },
            {
                content: <h1>"What would you like to do today: go to the park or go shopping?"</h1>,
                caption: "Ask easy questions and give clues by offering choices."
            },
            {
                content: <>
                            <h1>"I'd like to eat tacos at Taco Bell."</h1>
                            <h1 className="line-through decoration-red-500">"I'd like to eat those there."</h1>
                        </>,
                caption: "Use specific, concrete nouns, rather than pronouns."
            },
            {
                content: <img className="h-full" src="images/anomia-5.png" />,
                caption: "Use hand signals, pictures, and facial expressions."
            },
        ],
    },
    "alteredgrammar": {
        practiceCards: [
            {
                content: <h1>Talking</h1>,
                caption: "Begin with pleasant topics, keep sentence short, simple and direct"
            },
            {
                content: <h1>"Going to the grocery store makes me hungry."</h1>,
                caption: "Talk to them with statements."
            },
            {
                content: <h1>"What would you like to do today: go to the park or go shopping?"</h1>,
                caption: "Ask easy questions and give clues by offering choices."
            },
            {
                content: <>
                            <h1>"I'd like to eat tacos at Taco Bell."</h1>
                            <h1 className="line-through">"I'd like to eat those there."</h1>
                        </>,
                caption: "Use specific, concrete nouns, rather than pronouns."
            },
            {
                content: <h1>Hand signal</h1>,
                caption: "Use hand signals, pictures, and facial expressions."
            },
        ],
    },
    "pronunciation": {
        practiceCards: [
            {
                content: <h1>Talking</h1>,
                caption: "Begin with pleasant topics, keep sentence short, simple and direct"
            },
            {
                content: <h1>"Going to the grocery store makes me hungry."</h1>,
                caption: "Talk to them with statements."
            },
            {
                content: <h1>"What would you like to do today: go to the park or go shopping?"</h1>,
                caption: "Ask easy questions and give clues by offering choices."
            },
            {
                content: <>
                            <h1>"I'd like to eat tacos at Taco Bell."</h1>
                            <h1 className="line-through">"I'd like to eat those there."</h1>
                        </>,
                caption: "Use specific, concrete nouns, rather than pronouns."
            },
            {
                content: <h1>Hand signal</h1>,
                caption: "Use hand signals, pictures, and facial expressions."
            },
        ],
    },
    "pragmatic": {
        practiceCards: [
            {
                content: <h1>Talking</h1>,
                caption: "Begin with pleasant topics, keep sentence short, simple and direct"
            },
            {
                content: <h1>"Going to the grocery store makes me hungry."</h1>,
                caption: "Talk to them with statements."
            },
            {
                content: <h1>"What would you like to do today: go to the park or go shopping?"</h1>,
                caption: "Ask easy questions and give clues by offering choices."
            },
            {
                content: <>
                            <h1>"I'd like to eat tacos at Taco Bell."</h1>
                            <h1 className="line-through">"I'd like to eat those there."</h1>
                        </>,
                caption: "Use specific, concrete nouns, rather than pronouns."
            },
            {
                content: <h1>Hand signal</h1>,
                caption: "Use hand signals, pictures, and facial expressions."
            },
        ],
    },
    "prosody": {
        practiceCards: [
            {
                content: <h1>Talking</h1>,
                caption: "Begin with pleasant topics, keep sentence short, simple and direct"
            },
            {
                content: <h1>"Going to the grocery store makes me hungry."</h1>,
                caption: "Talk to them with statements."
            },
            {
                content: <h1>"What would you like to do today: go to the park or go shopping?"</h1>,
                caption: "Ask easy questions and give clues by offering choices."
            },
            {
                content: <>
                            <h1>"I'd like to eat tacos at Taco Bell."</h1>
                            <h1 className="line-through">"I'd like to eat those there."</h1>
                        </>,
                caption: "Use specific, concrete nouns, rather than pronouns."
            },
            {
                content: <h1>Hand signal</h1>,
                caption: "Use hand signals, pictures, and facial expressions."
            },
        ],
    },
    "turntaking": {
        practiceCards: [
            {
                content: <h1>Talking</h1>,
                caption: "Begin with pleasant topics, keep sentence short, simple and direct"
            },
            {
                content: <h1>"Going to the grocery store makes me hungry."</h1>,
                caption: "Talk to them with statements."
            },
            {
                content: <h1>"What would you like to do today: go to the park or go shopping?"</h1>,
                caption: "Ask easy questions and give clues by offering choices."
            },
            {
                content: <>
                            <h1>"I'd like to eat tacos at Taco Bell."</h1>
                            <h1 className="line-through">"I'd like to eat those there."</h1>
                        </>,
                caption: "Use specific, concrete nouns, rather than pronouns."
            },
            {
                content: <h1>Hand signal</h1>,
                caption: "Use hand signals, pictures, and facial expressions."
            },
        ],
    }
};


export function getBiomarkerCards(biomarker: BiomarkerType) {
    return cards[biomarker].practiceCards.map((card: Card, idx: number) => {
        return (
            <div key={idx} className="flex flex-col items-center h-full py-[2rem] m-0">
                <div className="h-3/4 m-0">{card.content}</div>
                <p className="h-1/4 mb-0">{card.caption}</p>
            </div>
        )
    });
}
