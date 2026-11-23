from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from django.conf import settings
from django.conf.urls.static import static


urlpatterns = [
    path('admin/', admin.site.urls),
    path('SA-AG/', include('apps.accounts.urls')),
    path('SA-AG/', include('apps.home.urls')),
    path('', RedirectView.as_view(url='/SA-AG/', permanent=False)),  # Automatically redirects root to /SA-AG/
    path('home/', include('apps.home.urls')),
]

# Serve uploaded photos (profile pictures and waypoint photos) while developing
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)