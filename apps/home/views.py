from django.shortcuts import render
from apps.accounts.models import Account

def saag_home(request):
    accounts = Account.objects.all()
    return render(request, 'home/home.html', {'accounts': accounts})