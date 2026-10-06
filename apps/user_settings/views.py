from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.decorators import login_required

@login_required
def user_settings(request):
    if request.method == 'POST':
        user = request.user
        
        # 1. Save First Name, Last Name, and Email
        user.first_name = request.POST.get('first_name', '')
        user.last_name = request.POST.get('last_name', '')
        user.email = request.POST.get('email', '')

        # 2. Process Password Change (Only if fields are filled)
        old_password = request.POST.get('old_password')
        new_password1 = request.POST.get('new_password1')
        new_password2 = request.POST.get('new_password2')

        if old_password or new_password1:
            if not user.check_password(old_password):
                messages.error(request, 'Current password is incorrect.')
                return redirect('user_settings')
            
            if new_password1 != new_password2:
                messages.error(request, 'New passwords do not match.')
                return redirect('user_settings')

            if len(new_password1) < 8:
                messages.error(request, 'Password must be at least 8 characters long.')
                return redirect('user_settings')

            user.set_password(new_password1)
            update_session_auth_hash(request, user)

        user.save()
        messages.success(request, 'Account settings updated successfully!')
        return redirect('user_settings')

    return render(request, 'user_settings/settings.html')