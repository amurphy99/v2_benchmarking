from django.contrib          import admin
from django.urls             import path, include
from django.conf             import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/",   include("chat_app.api.router")),
]

# Serve media files in development (audio recordings, etc.)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
