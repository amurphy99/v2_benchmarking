"""
Custom view for streaming audio files to the frontend.
--------------------------------------------------------------------------------
`backend.chat_app.api.media_view`

Was not able to seek through the audio files using the default media serving
methods in Django, so trying this out instead.

"""
import os
from django.conf import settings
from django.http import FileResponse, Http404
from ranged_response import RangedFileResponse


# Stream audio files to the frontend
def stream_media(request, path):
    # Construct full path
    file_path = os.path.join(settings.MEDIA_ROOT, path)
    
    if not os.path.exists(file_path):
        raise Http404("Media file does not exist")

    # FileResponse automatically handles Range requests (seeking)
    #response = FileResponse(open(file_path, 'rb'))
    response = RangedFileResponse(request, open(file_path, 'rb'), content_type='audio/mpeg')
    return response
