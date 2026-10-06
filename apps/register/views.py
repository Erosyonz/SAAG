from django.contrib import messages
from django.shortcuts import redirect, render
from apps.accounts.models import Account

def account_register(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        confirm_password = request.POST.get('confirm_password')
        
        if password != confirm_password:
            messages.error(request, 'Passwords do not match.')
            return render(request, 'register/register.html')
            
        if Account.objects.filter(username=username).exists():
            messages.error(request, 'Username already exists.')
            return render(request, 'register/register.html')
            
        Account.objects.create_user(username=username, email=email, password=password)
        messages.success(request, "Account created successfully!")
        return redirect('login')
        
    return render(request, 'register/register.html')