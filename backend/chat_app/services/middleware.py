"""
Read a connection's token, source, chat selection, and setup into its scope.
--------------------------------------------------------------------------------
`backend.chat_app.services.middleware`

`token` becomes `scope["user"]` (an `AnonymousUser` when it is missing or
invalid), and an unrecognized `source` becomes "unknown". The optional chat
selection (`chat_type`, `condition`, `variant`) is copied as sent; the chat
consumer checks it against the chat types when it connects. The optional
starting setup (`avatar`, `subtitles`) is copied as sent too, as "" when left
out, and the chat consumer checks it as well.

"""
from urllib.parse                    import parse_qs
from django.contrib.auth.models      import AnonymousUser
#from rest_framework.authtoken.models import Token
from rest_framework_simplejwt.authentication import JWTAuthentication
from channels.middleware             import BaseMiddleware
from asgiref.sync                    import sync_to_async

ALLOWED_SOURCES = {"webapp", "mobile", "qtrobot", "buddyrobot"}

jwt_auth = JWTAuthentication() # re-use a single instance

# =======================================================================
# Authentication  
# =======================================================================
#@sync_to_async
#def _get_user(token_key):
#    """ Turns token=<key> into scope["user"] """
#    try:                       return Token.objects.select_related("user").get(key=token_key).user
#    except Token.DoesNotExist: return AnonymousUser()

@sync_to_async
def _get_user(token_str: str):
    """Validate JWT and return the associated user (or AnonymousUser)."""
    try:              return jwt_auth.get_user(jwt_auth.get_validated_token(token_str))
    except Exception: return AnonymousUser()
    

# =======================================================================
# Middleware: parse & validate
# =======================================================================
class QueryAuthMiddleware(BaseMiddleware):
    """
    Parse data from the WebSocket connection.
        * token/user -> authentication for the user making the request/having the conversation
        * source     -> identify the source of the request (i.e. the web app, robot, etc.)
        * chat_type, condition, variant -> optional chat selection (None when left out)
        * avatar, subtitles             -> optional starting setup ("" when left out)
    """
    async def __call__(self, scope, receive, send):
        query = parse_qs(scope.get("query_string", b"").decode())

        # Get values from the request
        token_key = query.get("token",     [None     ])[0]
        source    = query.get("source",    ["unknown"])[0].lower()
        chat_type = query.get("chat_type", [None     ])[0]
        condition = query.get("condition", [None     ])[0]
        variant   = query.get("variant",   [None     ])[0]
        avatar    = query.get("avatar",    [""       ])[0]
        subtitles = query.get("subtitles", [""       ])[0]

        # Add to the scope (the chat consumer checks the chat selection and setup when it connects)
        scope["user"     ] = await _get_user(token_key)
        scope["source"   ] = source if source in ALLOWED_SOURCES else "unknown"
        scope["chat_type"] = chat_type
        scope["condition"] = condition
        scope["variant"  ] = variant
        scope["avatar"   ] = avatar
        scope["subtitles"] = subtitles

        return await super().__call__(scope, receive, send)

