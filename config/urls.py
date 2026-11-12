from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('SA-AG/', include('apps.accounts.urls')),
    path('', RedirectView.as_url(url='/SA-AG/', permanent=False)),  # Automatically redirects root to /SA-AG/
]