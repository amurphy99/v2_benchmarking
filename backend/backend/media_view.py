"""
Stream one locally stored session recording through a scoped, expiring URL.
--------------------------------------------------------------------------------
`backend.backend.media_view`

The REST API first authorizes the requesting user and signs a token containing
only that user and session. This endpoint validates the token and authorization
again, then serves the WAV with HTTP Range support for browser seeking.

"""
import mimetypes

from django.conf         import settings
from django.contrib.auth import get_user_model
from django.core         import signing
from django.http         import Http404, HttpRequest, HttpResponse
from ranged_response     import RangedFileResponse

# From this project
from chat_app.api.mixins import can_access_chat_session
from chat_app.models     import SessionAudio
from chat_app.services.session_audio_storage import (
    LOCAL_STORAGE_BACKEND,
    PLAYBACK_TOKEN_SALT,
    local_recording_path,
)

# ================================================================================
# Stream a single authorized local recording without accepting a caller-supplied path
# ================================================================================
def stream_session_audio(request: HttpRequest, session_id: int) -> HttpResponse:
    # 1) Decode and validate the temporary playback token
    token = request.GET.get("token", "")
    try:
        claims  = signing.loads(token, salt=PLAYBACK_TOKEN_SALT, max_age=settings.SESSION_AUDIO_PLAYBACK_URL_TTL_SEC)
        user_id = int(claims["user_id"])
        if int(claims["session_id"]) != session_id: raise signing.BadSignature("Session does not match token")
    except (signing.BadSignature, signing.SignatureExpired, KeyError, TypeError, ValueError):
        return HttpResponse("Unauthorized", status=401)

    # 2) Verify the user is active and authorized to access this session
    user = get_user_model().objects.filter(id=user_id, is_active=True).first()
    if (user is None) or (not can_access_chat_session(user, session_id)):
        return HttpResponse("Forbidden", status=403)

    # 3) Locate the database record for this local audio file
    try: audio = SessionAudio.objects.get(session_id=session_id, storage_backend=LOCAL_STORAGE_BACKEND)
    except SessionAudio.DoesNotExist: raise Http404("Session recording not found")

    # 4) Safely resolve the physical file path and ensure it exists
    try: file_path = local_recording_path(audio.object_key)
    except ValueError: raise Http404("Session recording not found")
    
    if not file_path.is_file(): raise Http404("Session recording not found")

    # 5) Stream the file back with HTTP range support and secure headers
    content_type = mimetypes.guess_type(file_path.name)[0] or "audio/wav"
    response     = RangedFileResponse(request, file_path.open("rb"), content_type=content_type)
    
    response["Content-Disposition"   ] = f'inline; filename="session_{session_id}.wav"'
    response["Cache-Control"         ] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"

    return response
