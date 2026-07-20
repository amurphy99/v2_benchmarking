"""
Custom view for streaming audio files to the frontend.
--------------------------------------------------------------------------------
`backend.chat_app.api.media_view`

Was not able to seek through the audio files using the default media serving
methods in Django, so trying this out instead.

TODO: Do certain files require certain users to be logged in?

"""
import os
from django.conf                      import settings
from django.http                      import Http404
from django.contrib.auth.decorators   import login_required
from ranged_response                  import RangedFileResponse


# Stream audio files to authenticated users only (supports Range requests for seeking)
@login_required
def stream_media(request, path):
    # Construct full path
    file_path = os.path.join(settings.MEDIA_ROOT, path)

    # Return 404 if the file doesn't exist
    if not os.path.exists(file_path):
        raise Http404("Media file does not exist")

    # FileResponse automatically handles Range requests (seeking)
    return RangedFileResponse(request, open(file_path, "rb"), content_type="audio/wav")
