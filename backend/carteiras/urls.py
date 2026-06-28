from django.urls import path
from . import views

urlpatterns = [
    path('otimizar-carteira/', views.OtimizarCarteiraView.as_view(), name='otimizar'),
    path('fronteira-eficiente/', views.FronteiraEficienteView.as_view(), name='fronteira'),
    path('info-ativos/', views.InfoAtivosView.as_view(), name='info-ativos'),
]
