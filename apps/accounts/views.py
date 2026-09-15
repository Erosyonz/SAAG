from django.contrib.auth import authenticate, login, logout
from django.shortcuts import redirect, render
from django.contrib import messages
from .models import Account

# Create your views here.

def saag_home(request):
    accounts = Account.objects.all()
    return render(request, 'home.html', {'accounts': accounts})

def account_login(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        user = authenticate(request, username=username, password=password)
        
        if user is not None:
            login(request, user)
            messages.success(request, "Login successful!")
            return redirect('home')
        else:
            messages.error(request, "Invalid username or password.")
    
    return render(request, 'login.html')

def account_register(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        confirm_password = request.POST.get('confirm_password')
        
        if password != confirm_password:
            messages.error(request, 'Passwords do not match.')
            return render(request, 'register.html')
        
        if Account.objects.filter(username=username).exists():
            messages.error(request, 'Username already exists.')
            return render(request, 'register.html')
        
        Account.objects.create_user(username=username, email=email, password=password)
        
        messages.success(request, "Account created successfully!")
        return redirect('login')
    
    return render(request, 'register.html')

def account_logout(request):
    logout(request)
    messages.info(request, "You have been logged out.")
    return redirect('login')



def user_settings(request):
    return render(request, 'user_settings/settings.html')