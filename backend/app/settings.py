import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


# ============================================================
# SEGURANÇA / AMBIENTE
# ============================================================

SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'markowitz-dev-key-2024'
)

DEBUG = (
    os.environ
    .get('DEBUG', 'True')
    .lower()
    == 'true'
)


def env_list(name, default=''):
    """
    Lê variáveis de ambiente separadas por vírgula.

    Exemplo:
    ALLOWED_HOSTS=.up.railway.app,localhost,127.0.0.1
    """
    return [
        item.strip()
        for item in os.environ.get(name, default).split(',')
        if item.strip()
    ]


# Permite localhost no desenvolvimento e Railway em produção.
ALLOWED_HOSTS = env_list(
    'ALLOWED_HOSTS',
    'localhost,127.0.0.1,.up.railway.app,.railway.app'
)

# Railway pode disponibilizar o domínio público nesta variável.
RAILWAY_PUBLIC_DOMAIN = os.environ.get(
    'RAILWAY_PUBLIC_DOMAIN',
    ''
).strip()

if RAILWAY_PUBLIC_DOMAIN and RAILWAY_PUBLIC_DOMAIN not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(
        RAILWAY_PUBLIC_DOMAIN
    )


# ============================================================
# APPS
# ============================================================

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


# ============================================================
# MIDDLEWARE
# ============================================================

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',

    'django.contrib.sessions.middleware.SessionMiddleware',

    'corsheaders.middleware.CorsMiddleware',

    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',

    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',

    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]


ROOT_URLCONF = 'app.urls'


# ============================================================
# TEMPLATES
# ============================================================

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',

        'DIRS': [
            os.path.join(
                BASE_DIR,
                '..',
                'frontend',
                'templates'
            )
        ],

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


# ============================================================
# BANCO DE DADOS
# ============================================================

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# ============================================================
# INTERNACIONALIZAÇÃO
# ============================================================

LANGUAGE_CODE = 'pt-br'

TIME_ZONE = 'America/Sao_Paulo'

USE_I18N = True

USE_TZ = True


# ============================================================
# STATIC FILES
# ============================================================

STATIC_URL = '/static/'

STATICFILES_DIRS = [
    os.path.join(
        BASE_DIR,
        '..',
        'frontend',
        'static'
    ),
]

STATIC_ROOT = os.path.join(
    BASE_DIR,
    'staticfiles'
)

STATICFILES_STORAGE = (
    'whitenoise.storage.CompressedManifestStaticFilesStorage'
)


# ============================================================
# CORS / CSRF
# ============================================================

# Em desenvolvimento, libera tudo.
# Em produção, como frontend e backend estão no mesmo domínio,
# não precisa liberar CORS globalmente.
CORS_ALLOW_ALL_ORIGINS = DEBUG

CORS_ALLOWED_ORIGINS = env_list(
    'CORS_ALLOWED_ORIGINS',
    ''
)

CSRF_TRUSTED_ORIGINS = env_list(
    'CSRF_TRUSTED_ORIGINS',
    'https://*.up.railway.app,https://*.railway.app'
)

if RAILWAY_PUBLIC_DOMAIN:
    origem_railway = f'https://{RAILWAY_PUBLIC_DOMAIN}'

    if origem_railway not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(
            origem_railway
        )


# Railway/proxy HTTPS
SECURE_PROXY_SSL_HEADER = (
    'HTTP_X_FORWARDED_PROTO',
    'https'
)


# ============================================================
# DJANGO REST FRAMEWORK
# ============================================================

REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
    ],

    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
    },
}


# ============================================================
# DEFAULT
# ============================================================

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'