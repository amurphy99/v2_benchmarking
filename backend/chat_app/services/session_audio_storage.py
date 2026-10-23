"""
Persist finalized session recordings locally or in Google Cloud Storage.
--------------------------------------------------------------------------------
`backend.chat_app.services.session_audio_storage`

The database stores audio recording metadata for each ChatSession, including an
'opaque' object key. This file handles the corresponding storage path (from the
key to where the actual audio file is stored), upload, deletion, and creation of
short-lived playback URLs.

NOTE: We have two storage options: for local development, we store audio files
      locally on the host computer. When deployed in the cloud server, we store
      audio files in a dedicated Google Cloud Storage (GCS) bucket. Every 
      function here has separate behaviors for whichever mdoe we are in.

"""
from __future__ import annotations

import os, shutil, tempfile

from datetime     import timedelta
from pathlib      import Path, PurePosixPath
from typing       import Any
from urllib.parse import urlencode
from uuid         import uuid4

from django.conf  import settings
from django.core  import signing
from django.http  import HttpRequest
from django.urls  import reverse

# From this project
from ..models import SessionAudio

LOCAL_STORAGE_BACKEND = "local"                   # Store finalized WAV files on the backend filesystem
GCS_STORAGE_BACKEND   = "gcs"                     # Store finalized WAV files in a private Google Cloud Storage bucket
PLAYBACK_TOKEN_SALT   = "session-audio-playback"  # Namespace used to sign scoped local playback tokens


# --------------------------------------------------------------------------------
# Build a storage key without including user names or other identifying details
# --------------------------------------------------------------------------------
def build_recording_object_key(session_id: int) -> str:
    prefix      = str(settings.SESSION_AUDIO_OBJECT_PREFIX).strip("/")
    prefix_path = PurePosixPath(prefix)

    if (prefix_path.is_absolute()) or (".." in prefix_path.parts):
        raise ValueError("SESSION_AUDIO_OBJECT_PREFIX must be a relative object prefix")

    filename = f"session_{session_id}_{uuid4().hex}.wav"
    return str(prefix_path / filename) if prefix else filename


# Resolve a local object key while preventing traversal outside the recording root
def local_recording_path(object_key: str) -> Path:
    root      = Path(settings.SESSION_AUDIO_LOCAL_ROOT).resolve()
    candidate = (root / object_key).resolve()
    
    if not candidate.is_relative_to(root): 
        raise ValueError("Recording object key escapes the local storage root")
        
    return candidate


# ================================================================================
# Store Recording
# ================================================================================
def store_recording(temp_path: Path, object_key: str) -> str:
    # Pull the storage mode from settings
    backend = settings.SESSION_AUDIO_STORAGE

    # --------------------------------------------------------------------------------
    # Local storage
    # --------------------------------------------------------------------------------
    if backend == LOCAL_STORAGE_BACKEND:
        destination = local_recording_path(object_key)
        destination.parent.mkdir(parents=True, exist_ok=True)

        # Copy into the destination filesystem before the atomic rename. Docker
        # commonly places `/tmp` and the bind-mounted media directory on different
        # filesystems, where a direct `os.replace(temp_path, destination)` fails.
        staging_file = tempfile.NamedTemporaryFile(
            prefix = f".{destination.name}.",
            suffix = ".tmp",
            dir    = destination.parent,
            delete = False,
        )
        staging_path = Path(staging_file.name)
        staging_file.close()
        
        try:
            shutil.copyfile(temp_path, staging_path)
            os.replace(staging_path, destination)
            temp_path.unlink(missing_ok=True)
        except Exception:
            staging_path.unlink(missing_ok=True)
            raise
            
        return backend

    # --------------------------------------------------------------------------------
    # Google Cloud Storage (GCS) bucket
    # --------------------------------------------------------------------------------
    if backend == GCS_STORAGE_BACKEND:
        bucket = _gcs_bucket()
        blob   = bucket.blob(object_key)
        
        blob.cache_control       = "private, max-age=0, no-store"
        blob.content_disposition = 'inline; filename="session_audio.wav"'
        
        blob.upload_from_filename(
            str(temp_path),
            content_type        = "audio/wav",
            if_generation_match = 0,
        )
        temp_path.unlink(missing_ok=True)
        return backend

    # Incorrect audio storage location specified
    raise ValueError(f"Unsupported SESSION_AUDIO_STORAGE value: {backend}")


# ================================================================================
# Delete Recording
# ================================================================================
def delete_recording(storage_backend: str, object_key: str) -> None:
    # Local storage
    if storage_backend == LOCAL_STORAGE_BACKEND:
        local_recording_path(object_key).unlink(missing_ok=True)
        return

    # GCS bucket
    if storage_backend == GCS_STORAGE_BACKEND:
        from google.api_core.exceptions import NotFound

        try:  _gcs_bucket().blob(object_key).delete()
        except NotFound: pass
        return

    raise ValueError(f"Unsupported recording storage backend: {storage_backend}")


# ================================================================================
# Create Recording Playback URL
# ================================================================================
def create_recording_playback_url(audio: SessionAudio, request: HttpRequest) -> str:
    # Local storage
    if audio.storage_backend == LOCAL_STORAGE_BACKEND:
        token = signing.dumps(
            {"session_id": audio.session_id, "user_id": request.user.id},
            salt     = PLAYBACK_TOKEN_SALT,
            compress = True,
        )
        path = reverse("session_audio_stream", kwargs={"session_id": audio.session_id})
        return f"{path}?{urlencode({'token': token})}"

    # GCS bucket
    if audio.storage_backend == GCS_STORAGE_BACKEND:
        return _create_gcs_signed_url(audio.object_key)

    raise ValueError(f"Unsupported recording storage backend: {audio.storage_backend}")


# Load the configured bucket lazily so local development does not need GCS credentials
def _gcs_bucket() -> Any:
    from google.cloud import storage

    bucket_name = settings.SESSION_AUDIO_GCS_BUCKET
    if not bucket_name: raise ValueError("SESSION_AUDIO_GCS_BUCKET is required for GCS recording storage")
    return storage.Client().bucket(bucket_name)


# --------------------------------------------------------------------------------
# Get authorization to access the GCS bucket
# --------------------------------------------------------------------------------
def _create_gcs_signed_url(object_key: str) -> str:
    """
    Sign with either:
        1) a local service-account key or 
        2) keyless IAM credentials attached to a VM.
    """
    # Nested imports only when we need them
    from google.auth                    import default
    from google.auth.credentials        import Signing
    from google.auth.transport.requests import Request

    # Option 1: Local service-account key
    credentials, _ = default()
    blob           = _gcs_bucket().blob(object_key)
    expiration     = timedelta(seconds=settings.SESSION_AUDIO_PLAYBACK_URL_TTL_SEC)

    if isinstance(credentials, Signing):
        return blob.generate_signed_url(
            version     = "v4", 
            expiration  = expiration, 
            method      = "GET", 
            credentials = credentials,
        )

    # Option 2: Keyless IAM credentials attached to the host VM
    credentials.refresh(Request())
    service_account_email = getattr(credentials, "service_account_email", None)
    
    if not service_account_email:
        raise ValueError("The active Google credentials cannot sign recording playback URLs")

    return blob.generate_signed_url(
        version               = "v4",
        expiration            = expiration,
        method                = "GET",
        service_account_email = service_account_email,
        access_token          = credentials.token,
    )
