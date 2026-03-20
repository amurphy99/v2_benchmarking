import re, logging
logger = logging.getLogger(__name__)

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

EMOTIONS = ["Happy", "Sad", "Surprised", "Angry", "Scared", "Neutral"]

# cue lists, can be expanded over time
class WordCues:
    HAPPY = {"great","good","awesome","amazing","love","glad","yay","cool","perfect","lol","haha"}
    SAD = {"sad","down","depressed","upset","heartbroken","lonely","miserable","cry", "fail","miserable", "woe", "unhappy",}
    SCARED = {"scared","afraid","terrified","anxious","worried","nervous","panic","fear", "horror"}
    SURPRISED = {"wow","whoa","no way","wait what","what?","really?","oh my god", "omg", "surprise"}
    ANGRY = {"grumpy","cranky","grouchy","irritable","moody","testy", "whatever","annoying","bother","sucks"}



def _tokens(s: str):
    s = s.lower()
    return re.findall(r"[a-z'’]+|[!?]+|[\U0001F300-\U0001FAFF]", s)

def classify_emotion_with_vader(text: str):
    # Compound Valence via VADER
    try: 
        analyzer = SentimentIntensityAnalyzer()
        vs = analyzer.polarity_scores(text)
        compound = vs["compound"]  # [-1, 1]
    except Exception as e:
        logger.error(f"VADER analysis failed: {e}")

    try:
        # get tokens
        toks = _tokens(text)
        joined = " ".join(toks)

        # Initialize emotion scores
        emo_score = {e: 0 for e in EMOTIONS}

        # Word/phrase cues
        def has_any(cues): 
            return any(c in joined for c in cues)
        
        if has_any(WordCues.HAPPY):     
            emo_score["Happy"] += 2
        if has_any(WordCues.SAD):       
            emo_score["Sad"] += 2
        if has_any(WordCues.SCARED):    
            emo_score["Scared"] += 2
        if has_any(WordCues.SURPRISED):  
            emo_score["Surprised"] += 2
        if has_any(WordCues.ANGRY): 
            emo_score["Angry"] += 2

        # 6) Map VADER valence to emotions
        POS_THR, NEG_THR = 0.35, -0.35
        # Slight-negative band for angry/annoyed
        SLIGHT_NEG_MIN, SLIGHT_NEG_MAX = -0.50, -0.10
        # 

        if compound > POS_THR:
            emo_score["Happy"] += 1
        elif compound < NEG_THR:
            emo_score["Sad"] += 1
            emo_score["Scared"] += 1
        
        # If slightly negative overall, nudge Angry
        if SLIGHT_NEG_MIN <= compound <= SLIGHT_NEG_MAX:
            emo_score["Angry"] += 1

        # Prefer Angry over Sad when annoyance cues are present and scores are close
        if emo_score["Angry"] > 0 and emo_score["Sad"] > 0:
            if abs(emo_score["Angry"] - emo_score["Sad"]) <= 1 and has_any(WordCues.ANGRY):
                emo_score["Angry"] += 1
                
        # Final selection
        top_emo = max(emo_score, key=emo_score.__getitem__)
        
        if emo_score[top_emo] == 0:
            return "Neutral"


        # for Low/ambiguous total- top emo_score <2 
        # checks for how many emotions in the emo_score dictionary have a score equal to the top_emo's score. 
        # The second condition is true if this count is > 1.
        if emo_score[top_emo] < 2 and sum(1 for v in emo_score.values() if v == emo_score[top_emo]) > 1:
            return "Neutral"

        return top_emo
    
    except Exception as e:
        logger.error(f"Error occured during word cue-based emotion score calculation: {e}")