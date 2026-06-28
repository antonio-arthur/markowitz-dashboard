import os
from pathlib import Path

# Caminho base - sua pasta existente
base = Path("MARKOWITZ-DASHBOARD")

# Lista de arquivos a criar
arquivos = {
    "backend/manage.py": """#!/usr/bin/env python
import os
import sys

def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError:
        raise ImportError("Django não instalado. Execute: pip install -r requirements.txt")
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
""",
    
    "backend/app/__init__.py": "",

    "backend/app/settings.py": """import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'markowitz-dev-key-2024'
DEBUG = True
ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'carteiras',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'app.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, '..', 'frontend', 'templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'app.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.path.join(BASE_DIR, '..', 'database', 'db.sqlite3'),
    }
}

LANGUAGE_CODE = 'pt-br'
TIME_ZONE = 'America/Sao_Paulo'

STATIC_URL = '/static/'
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, '..', 'frontend', 'static'),
]

CORS_ALLOW_ALL_ORIGINS = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
""",

    "backend/app/urls.py": """from django.contrib import admin
from django.urls import path, include
from django.shortcuts import render

def index(request):
    return render(request, 'index.html')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('carteiras.urls')),
    path('', index, name='index'),
]
""",

    "backend/app/wsgi.py": """import os
from django.core.wsgi import get_wsgi_application
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')
application = get_wsgi_application()
""",

    "backend/app/asgi.py": """import os
from django.core.asgi import get_asgi_application
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')
application = get_asgi_application()
""",

    "backend/carteiras/__init__.py": "",

    "backend/carteiras/apps.py": """from django.apps import AppConfig
class CarteirasConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'carteiras'
""",

    "backend/carteiras/models.py": """from django.db import models

class Ativo(models.Model):
    ticker = models.CharField(max_length=10, unique=True)
    nome = models.CharField(max_length=100)
    setor = models.CharField(max_length=50, blank=True, null=True)
    
    def __str__(self):
        return self.ticker

class Carteira(models.Model):
    nome = models.CharField(max_length=100)
    data_criacao = models.DateTimeField(auto_now_add=True)
    ativos = models.ManyToManyField(Ativo, through='CarteiraAtivo')
    
    def __str__(self):
        return self.nome

class CarteiraAtivo(models.Model):
    carteira = models.ForeignKey(Carteira, on_delete=models.CASCADE)
    ativo = models.ForeignKey(Ativo, on_delete=models.CASCADE)
    peso = models.DecimalField(max_digits=5, decimal_places=4)
    
    class Meta:
        unique_together = ['carteira', 'ativo']
""",

    "backend/carteiras/views.py": """from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import yfinance as yf
import numpy as np
from scipy.optimize import minimize

class OtimizarCarteiraView(APIView):
    def post(self, request):
        tickers = request.data.get('tickers', ['AAPL', 'MSFT', 'GOOGL'])
        periodo = request.data.get('periodo', '1y')
        
        try:
            dados = yf.download(tickers, period=periodo, progress=False)['Adj Close']
            if len(tickers) == 1:
                dados = dados.to_frame()
            
            retornos = dados.pct_change().dropna()
            retorno_medio = retornos.mean() * 252
            cov_matrix = retornos.cov() * 252
            num_ativos = len(tickers)
            
            def volatilidade(pesos):
                return np.sqrt(np.dot(pesos.T, np.dot(cov_matrix, pesos)))
            
            restricoes = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
            limites = tuple((0, 1) for _ in range(num_ativos))
            
            resultado = minimize(
                volatilidade,
                np.array([1/num_ativos] * num_ativos),
                method='SLSQP',
                bounds=limites,
                constraints=restricoes
            )
            
            pesos_otimos = resultado.x
            
            return Response({
                'sucesso': True,
                'pesos': {ticker: float(p) for ticker, p in zip(tickers, pesos_otimos)},
                'retorno_esperado': float(np.sum(retorno_medio * pesos_otimos)),
                'volatilidade': float(volatilidade(pesos_otimos)),
                'indice_sharpe': float(np.sum(retorno_medio * pesos_otimos) / volatilidade(pesos_otimos))
            })
        except Exception as e:
            return Response({'erro': str(e)}, status=400)

class FronteiraEficienteView(APIView):
    def post(self, request):
        tickers = request.data.get('tickers', ['AAPL', 'MSFT', 'GOOGL'])
        
        try:
            dados = yf.download(tickers, period='1y', progress=False)['Adj Close']
            retornos = dados.pct_change().dropna()
            retorno_medio = retornos.mean() * 252
            cov_matrix = retornos.cov() * 252
            num_ativos = len(tickers)
            
            def volatilidade(pesos):
                return np.sqrt(np.dot(pesos.T, np.dot(cov_matrix, pesos)))
            
            limites = tuple((0, 1) for _ in range(num_ativos))
            retornos_alvo = np.linspace(retorno_medio.min(), retorno_medio.max(), 20)
            
            pontos = []
            for ret in retornos_alvo:
                restricoes = (
                    {'type': 'eq', 'fun': lambda x: np.sum(x) - 1},
                    {'type': 'eq', 'fun': lambda x, r=ret: np.sum(retorno_medio * x) - r}
                )
                resultado = minimize(volatilidade, 
                                   np.array([1/num_ativos]*num_ativos),
                                   method='SLSQP', bounds=limites, 
                                   constraints=restricoes)
                if resultado.success:
                    pontos.append({'retorno': float(ret), 'volatilidade': float(resultado.fun)})
            
            ativos = [{'ticker': t, 'retorno': float(retorno_medio[i]),
                      'volatilidade': float(np.sqrt(cov_matrix.iloc[i,i]))} 
                     for i, t in enumerate(tickers)]
            
            return Response({'fronteira_eficiente': pontos, 'ativos_individual': ativos})
        except Exception as e:
            return Response({'erro': str(e)}, status=400)
""",

    "backend/carteiras/urls.py": """from django.urls import path
from . import views

urlpatterns = [
    path('otimizar-carteira/', views.OtimizarCarteiraView.as_view(), name='otimizar'),
    path('fronteira-eficiente/', views.FronteiraEficienteView.as_view(), name='fronteira'),
]
""",

    "backend/carteiras/admin.py": """from django.contrib import admin
from .models import Ativo, Carteira, CarteiraAtivo

admin.site.register(Ativo)
admin.site.register(Carteira)
admin.site.register(CarteiraAtivo)
""",

    "backend/requirements.txt": """Django==4.2.7
djangorestframework==3.14.0
django-cors-headers==4.3.1
yfinance==0.2.33
pandas==2.1.4
numpy==1.26.2
scipy==1.11.4
""",

    "database/.gitkeep": "",
}

# Criar estrutura
criados = []
for caminho, conteudo in arquivos.items():
    destino = base / caminho
    destino.parent.mkdir(parents=True, exist_ok=True)
    if not destino.exists():
        destino.write_text(conteudo, encoding='utf-8')
        criados.append(caminho)
        print(f"✅ Criado: {caminho}")
    else:
        print(f"⏭️  Já existe: {caminho}")

print(f"\n📁 {len(criados)} arquivos novos criados!")
print("""
🚀 Agora execute:

  cd MARKOWITZ-DASHBOARD/backend
  python -m venv venv
  
  # Ativar ambiente:
  # Windows: venv\\Scripts\\activate  
  # Linux/Mac: source venv/bin/activate
  
  pip install -r requirements.txt
  python manage.py migrate
  python manage.py runserver
  
  # Acessar: http://localhost:8000
  
""")