import nltk
nltk.download('vader_lexicon')
nltk.download('stopwords')
nltk.download('punkt_tab')

from nltk.tokenize        import word_tokenize
from nltk.corpus          import stopwords

from collections import Counter
    
def get_topics(message_text): # From freeCodeCamp
    english_stopwords = stopwords.words("english")
    tokens = word_tokenize(message_text)
    alpha_lower_tokens = [word.lower() for word in tokens if word.isalpha()]
    alpha_no_stopwords = [word for word in alpha_lower_tokens if word not in english_stopwords]
    BoW = Counter(alpha_no_stopwords)
    most_common = BoW.most_common(6)
    
    topics = []
    for token in most_common:
        topics.append(token[0])
        
    return str(topics).strip()