"""
Stream media files to authenticated users.
--------------------------------------------------------------------------------
`backend.backend.media_view`

The `<audio>` element cannot attach an Authorization header, so auth is handled 
via a short-lived JWT access token passed as a query parameter. This is the same 
method the WebSocket consumers use in `services/middleware.py`.

URL format:
    GET /media/<path>?token=<access_token>

Range requests (for audio seeking) are handled by RangedFileResponse from the
`ranged-response` package, which issues `206 Partial Content` and sets the
appropriate `Content-Range` / `Accept-Ranges` headers.  This is required for the
browser's <audio> seek bar to work and scales to arbitrarily large files because
it never loads the full file into memory.

"""
import os, mimetypes
from django.conf                             import settings
from django.http                             import Http404, HttpResponse
from django.contrib.auth.models              import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication
from ranged_response                         import RangedFileResponse

_jwt_auth = JWTAuthentication()


# --------------------------------------------------------------------------------
# Get the user from the given token
# --------------------------------------------------------------------------------
def _user_from_token(token_str: str | None):
    """
    Validate a simplejwt access token string -> User or None.
    """
    if not token_str: return None
    try:              return _jwt_auth.get_user(_jwt_auth.get_validated_token(token_str))
    except Exception: return None


# ================================================================================
# Stream the audio file
# ================================================================================
def stream_media(request, path):
    """
    Serve a media file after validating the JWT token supplied in the
    `?token=` query parameter.  Supports HTTP Range requests so the browser
    audio player can seek without downloading the full file first.
    """
    # --------------------------------------------------------------------------------
    # Authentication
    # --------------------------------------------------------------------------------
    token = request.GET.get("token")
    user  = _user_from_token(token)
    if not user or isinstance(user, AnonymousUser) or not getattr(user, "is_active", False):
        return HttpResponse("Unauthorized", status=401)

    # --------------------------------------------------------------------------------
    # Resolve file
    # --------------------------------------------------------------------------------
    # Prevent directory traversal
    safe_path = os.path.normpath(path).lstrip("/")
    file_path = os.path.join(settings.MEDIA_ROOT, safe_path)
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise Http404(f"Media file not found: {safe_path}")

    # --------------------------------------------------------------------------------
    # Content-Type
    # --------------------------------------------------------------------------------
    content_type, _ = mimetypes.guess_type(file_path)
    content_type    = content_type or "application/octet-stream"

    # --------------------------------------------------------------------------------
    # Stream with Range Support
    # --------------------------------------------------------------------------------
    # RangedFileResponse handles Content-Range / Accept-Ranges headers and reads the 
    # file in chunks, so even a 200 MB recording is served without loading it into 
    # memory.
    return RangedFileResponse(request, open(file_path, "rb"), content_type=content_type)

