from django.http import HttpResponse
from django.contrib import admin
from django.urls import path, include

def index(request):
    return HttpResponse("Markowitz Dashboard OK! Acesse a API em /api/")

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('carteiras.urls')),
    path('', index, name='index'),
]
