import nltk
nltk.download('vader_lexicon')
nltk.download('stopwords')
nltk.download('punkt_tab')

from nltk.sentiment.vader import SentimentIntensityAnalyzer
from nltk.tokenize        import word_tokenize
from nltk.corpus          import stopwords

from collections import Counter

def sentiment_scores(sentence): # From Geeks for Geeks
    # Create a SentimentIntensityAnalyzer object.
    sid_obj = SentimentIntensityAnalyzer()

    # polarity_scores method of SentimentIntensityAnalyzer object gives a sentiment dictionary.
    # which contains pos, neg, neu, and compound scores.
    sentiment_dict = sid_obj.polarity_scores(sentence)
    
    if   sentiment_dict['compound'] >=  0.05: return "Positive"
    elif sentiment_dict['compound'] <= -0.05: return "Negative"
    else:                                     return "Neutral"
    
    
def get_topics(text): # From freeCodeCamp
    english_stopwords = stopwords.words("english")
    tokens = word_tokenize(text)
    alpha_lower_tokens = [word.lower() for word in tokens if word.isalpha()]
    alpha_no_stopwords = [word for word in alpha_lower_tokens if word not in english_stopwords]
    BoW = Counter(alpha_no_stopwords)
    most_common = BoW.most_common(6)
    
    topics = []
    for token in most_common:
        topics.append(token[0])
        
    return str(topics).strip()


def get_sentiment_topics(msgs):
    '''Gets the sentiment and topics of a set of user utterances.'''
    message_text = "Message message message message message"
    try:
        messages = [msg for msg in msgs]
        message_text = " ".join(messages)
    except:
        None
    # Sentiment
    try:    
        sentiment = sentiment_scores(message_text)
    except: 
        sentiment = "N/A"
    # Topics
    try:    
        topics = get_topics(message_text)
    except: 
        topics = "['No','Topics','Available']"
    return sentiment, topics