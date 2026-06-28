from django.contrib import admin
from .models import Ativo, Carteira, CarteiraAtivo

admin.site.register(Ativo)
admin.site.register(Carteira)
admin.site.register(CarteiraAtivo)
