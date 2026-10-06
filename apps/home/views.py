import os
from django.shortcuts import render
from apps.accounts.models import Account

def saag_home(request):
    accounts = Account.objects.all()
    context = {
        'accounts': accounts,
        'carto_api_key': os.getenv('CARTO_API_KEY', '')
    }
    return render(request, 'home/home.html', context)