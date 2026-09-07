from django.urls import path
from . import views
urlpatterns = [
    path('home/', views.saag_home, name = 'home'),
    path('login/', views.account_login, name='login'),
    path('register/', views.account_register, name='register'),
]