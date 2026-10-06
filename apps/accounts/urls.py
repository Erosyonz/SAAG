# apps/accounts/urls.py
from django.urls import path
from apps.home.views import saag_home
from apps.login.views import account_login
from apps.register.views import account_register
from .views import account_logout
from apps.profiles.views import profile_view
from apps.user_settings.views import user_settings

urlpatterns = [
    path('home/', saag_home, name='home'),
    path('login/', account_login, name='login'),
    path('register/', account_register, name='register'),
    path('logout/', account_logout, name='logout'),
    path('profile/', profile_view, name='profile'),
    path('settings/', user_settings, name='user_settings'),
]