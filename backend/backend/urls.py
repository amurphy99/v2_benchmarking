from django.contrib import admin
from django.urls    import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/",   include("chat_app.api.router")), 
    path("api/<int:profileid>/",   include("chat_app.api.router")), 
]
