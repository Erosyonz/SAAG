import os
from django.shortcuts import render
from apps.accounts.models import Account

def saag_home(request):
    accounts = Account.objects.all()

    context = {
        'accounts': accounts,
        'mapbox_token': os.getenv('MAPBOX_KEY')
    }

    return render(request, 'home/home.html', context)


def home(request):
    return render(request, 'home.html', {
        'mapbox_token': 'YOUR_MAPBOX_PUBLIC_TOKEN'
    })