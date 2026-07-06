import json
import logging
import os
import unicodedata

from django.conf import settings
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

import numpy as np
import pandas as pd
import yfinance as yf

from scipy.optimize import minimize

from .serializers import AnaliseCarteiraSerializer


# ============================================================
# CONFIGURAÇÕES
# ============================================================

logger = logging.getLogger(__name__)

TAXA_LIVRE_RISCO = float(os.environ.get("TAXA_LIVRE_RISCO", "0.10"))


def normalizar_texto(texto):
    """Remove acentos e converte para minúsculas."""
    if not texto:
        return ""
    texto = str(texto).strip().lower()
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
BENCHMARK_PADRAO = "^BVSP"

DIAS_UTEIS_ANO = 252
MIN_OBSERVACOES = 60
TOLERANCIA = 1e-6
SIMULACOES_CARTEIRAS = 5000

PERFIS_VALIDOS = {
    "conservador",
    "moderado",
    "arrojado",
}

# O perfil arrojado será posicionado em uma região
# de retorno mais alto da fronteira eficiente.
FRACAO_RETORNO_ARROJADO = 0.80


# ============================================================
# FUNÇÕES AUXILIARES
# ============================================================

def normalizar_tickers(tickers):
    """
    Limpa os tickers e remove duplicados,
    preservando a ordem original.
    """
    if isinstance(tickers, str):
        tickers = [tickers]

    resultado = []

    for ticker in tickers or []:
        ticker_limpo = (
            str(ticker)
            .strip()
            .upper()
        )

        if (
            ticker_limpo
            and ticker_limpo not in resultado
        ):
            resultado.append(
                ticker_limpo
            )

    return resultado


def normalizar_perfil(perfil):
    """
    Garante que o perfil seja:
    conservador, moderado ou arrojado.
    """
    perfil_normalizado = (
        str(perfil or "moderado")
        .strip()
        .lower()
    )

    if perfil_normalizado not in PERFIS_VALIDOS:
        return "moderado"

    return perfil_normalizado


def extrair_precos_fechamento(
    dados,
    tickers=None
):
    """
    Extrai Adj Close ou Close da resposta
    retornada pelo yfinance.

    Funciona com colunas simples e MultiIndex.
    """
    if dados is None or dados.empty:
        return None

    precos = None

    if isinstance(
        dados.columns,
        pd.MultiIndex
    ):
        primeiro_nivel = (
            dados.columns
            .get_level_values(0)
        )

        if "Adj Close" in primeiro_nivel:
            precos = dados["Adj Close"]

        elif "Close" in primeiro_nivel:
            precos = dados["Close"]

    else:
        if "Adj Close" in dados.columns:
            precos = dados["Adj Close"]

        elif "Close" in dados.columns:
            precos = dados["Close"]

    if precos is None:
        return None

    if isinstance(
        precos,
        pd.Series
    ):
        precos = precos.to_frame()

    precos = precos.copy()

    # Para apenas um ticker, o yfinance
    # pode não usar o ticker como nome da coluna.
    if (
        tickers
        and len(tickers) == 1
        and precos.shape[1] == 1
    ):
        precos.columns = [
            tickers[0]
        ]

    else:
        precos.columns = [
            str(coluna)
            for coluna in precos.columns
        ]

    indice = pd.to_datetime(
        precos.index
    )

    if getattr(
        indice,
        "tz",
        None
    ) is not None:
        indice = indice.tz_localize(
            None
        )

    precos.index = indice

    precos = precos.apply(
        pd.to_numeric,
        errors="coerce"
    )

    precos = precos.dropna(
        axis=1,
        how="all"
    )

    return precos


def limpar_pesos(pesos):
    """
    Remove resíduos numéricos,
    limita pesos entre zero e um
    e renormaliza a soma para um.
    """
    pesos = np.asarray(
        pesos,
        dtype=float
    )

    pesos[
        np.abs(pesos) < TOLERANCIA
    ] = 0.0

    pesos = np.clip(
        pesos,
        0.0,
        1.0
    )

    soma = float(
        pesos.sum()
    )

    if soma <= TOLERANCIA:
        return pesos

    return pesos / soma


def serializar_pesos(
    tickers,
    pesos
):
    """
    Converte os pesos para um dicionário JSON.
    """
    return {
        ticker: float(peso)
        for ticker, peso in zip(
            tickers,
            pesos
        )
    }


# ============================================================
# CÁLCULOS DE MARKOWITZ
# ============================================================

def calcular_retorno_anual(
    retornos
):
    """
    Retorno médio diário anualizado.
    """
    return (
        retornos.mean()
        * DIAS_UTEIS_ANO
    )


def calcular_matriz_covariancia(
    retornos
):
    """
    Matriz de covariância anualizada.
    """
    return (
        retornos.cov()
        * DIAS_UTEIS_ANO
    )


def calcular_volatilidade(
    pesos,
    cov_matrix
):
    """
    Volatilidade anualizada da carteira.
    """
    pesos = np.asarray(
        pesos,
        dtype=float
    )

    cov_array = np.asarray(
        cov_matrix,
        dtype=float
    )

    variancia = float(
        np.dot(
            pesos.T,
            np.dot(
                cov_array,
                pesos
            )
        )
    )

    variancia = max(
        variancia,
        0.0
    )

    return float(
        np.sqrt(variancia)
    )


def calcular_retorno_carteira(
    pesos,
    retorno_medio
):
    """
    Retorno anualizado da carteira.
    """
    pesos = np.asarray(
        pesos,
        dtype=float
    )

    retornos = np.asarray(
        retorno_medio,
        dtype=float
    )

    return float(
        np.dot(
            pesos,
            retornos
        )
    )


def calcular_sharpe(
    pesos,
    retorno_medio,
    cov_matrix,
    taxa_livre_risco=TAXA_LIVRE_RISCO
):
    """
    Índice de Sharpe anualizado.
    """
    retorno = calcular_retorno_carteira(
        pesos,
        retorno_medio
    )

    volatilidade = calcular_volatilidade(
        pesos,
        cov_matrix
    )

    if volatilidade < TOLERANCIA:
        return 0.0

    return float(
        (
            retorno
            - taxa_livre_risco
        )
        / volatilidade
    )


def restricoes_basicas():
    """
    Restrição de soma dos pesos igual a um.
    """
    return (
        {
            "type": "eq",
            "fun": lambda pesos: (
                np.sum(pesos) - 1.0
            ),
        },
    )


def limites_basicos(
    num_ativos
):
    """
    Impede venda a descoberto:
    todos os pesos ficam entre zero e um.
    """
    return tuple(
        (0.0, 1.0)
        for _ in range(num_ativos)
    )


def pesos_iniciais_iguais(
    num_ativos
):
    """
    Começa a otimização com pesos iguais.
    """
    return np.repeat(
        1.0 / num_ativos,
        num_ativos
    )


# ============================================================
# OTIMIZAÇÕES
# ============================================================

def otimizar_minima_variancia(
    retorno_medio,
    cov_matrix,
    num_ativos
):
    """
    Carteira global de mínima variância.

    Utilizada para o perfil conservador.
    """
    resultado = minimize(
        fun=lambda pesos: calcular_volatilidade(
            pesos,
            cov_matrix
        ),

        x0=pesos_iniciais_iguais(
            num_ativos
        ),

        method="SLSQP",

        bounds=limites_basicos(
            num_ativos
        ),

        constraints=restricoes_basicas(),

        options={
            "maxiter": 1000,
            "ftol": 1e-12
        }
    )

    if not resultado.success:
        return None, None, None

    pesos = limpar_pesos(
        resultado.x
    )

    retorno = calcular_retorno_carteira(
        pesos,
        retorno_medio
    )

    volatilidade = calcular_volatilidade(
        pesos,
        cov_matrix
    )

    return (
        pesos,
        retorno,
        volatilidade
    )


def otimizar_maximo_sharpe(
    retorno_medio,
    cov_matrix,
    num_ativos,
    taxa_livre_risco=TAXA_LIVRE_RISCO
):
    """
    Carteira com maior Índice de Sharpe.

    Utilizada para o perfil moderado.
    """

    def sharpe_negativo(pesos):
        return -calcular_sharpe(
            pesos,
            retorno_medio,
            cov_matrix,
            taxa_livre_risco
        )

    resultado = minimize(
        fun=sharpe_negativo,

        x0=pesos_iniciais_iguais(
            num_ativos
        ),

        method="SLSQP",

        bounds=limites_basicos(
            num_ativos
        ),

        constraints=restricoes_basicas(),

        options={
            "maxiter": 1000,
            "ftol": 1e-12
        }
    )

    if not resultado.success:
        return None, None, None

    pesos = limpar_pesos(
        resultado.x
    )

    retorno = calcular_retorno_carteira(
        pesos,
        retorno_medio
    )

    volatilidade = calcular_volatilidade(
        pesos,
        cov_matrix
    )

    return (
        pesos,
        retorno,
        volatilidade
    )


def otimizar_retorno_alvo(
    retorno_medio,
    cov_matrix,
    num_ativos,
    retorno_alvo,
    pesos_iniciais=None
):
    """
    Minimiza a volatilidade para um retorno-alvo.

    Essa função é usada para criar a carteira
    do perfil arrojado.
    """
    if pesos_iniciais is None:
        pesos_iniciais = (
            pesos_iniciais_iguais(
                num_ativos
            )
        )

    restricoes = (
        {
            "type": "eq",
            "fun": lambda pesos: (
                np.sum(pesos) - 1.0
            ),
        },

        {
            "type": "eq",
            "fun": (
                lambda pesos, alvo=retorno_alvo:
                calcular_retorno_carteira(
                    pesos,
                    retorno_medio
                ) - alvo
            ),
        },
    )

    resultado = minimize(
        fun=lambda pesos: calcular_volatilidade(
            pesos,
            cov_matrix
        ),

        x0=np.asarray(
            pesos_iniciais,
            dtype=float
        ),

        method="SLSQP",

        bounds=limites_basicos(
            num_ativos
        ),

        constraints=restricoes,

        options={
            "maxiter": 1500,
            "ftol": 1e-12
        }
    )

    if not resultado.success:
        return None, None, None

    pesos = limpar_pesos(
        resultado.x
    )

    retorno = calcular_retorno_carteira(
        pesos,
        retorno_medio
    )

    volatilidade = calcular_volatilidade(
        pesos,
        cov_matrix
    )

    return (
        pesos,
        retorno,
        volatilidade
    )


def criar_carteira_maximo_retorno(
    retorno_medio,
    cov_matrix
):
    """
    Alternativa para o perfil arrojado caso
    a otimização por retorno-alvo falhe.

    Coloca 100% no ativo com maior
    retorno histórico anualizado.
    """
    retornos = np.asarray(
        retorno_medio,
        dtype=float
    )

    indice = int(
        np.argmax(retornos)
    )

    pesos = np.zeros(
        len(retornos),
        dtype=float
    )

    pesos[indice] = 1.0

    retorno = calcular_retorno_carteira(
        pesos,
        retorno_medio
    )

    volatilidade = calcular_volatilidade(
        pesos,
        cov_matrix
    )

    return (
        pesos,
        retorno,
        volatilidade
    )


def selecionar_carteira_por_perfil(
    perfil,
    retorno_medio,
    cov_matrix,
    pesos_minimos,
    retorno_minimo,
    volatilidade_minima,
    pesos_sharpe,
    retorno_sharpe,
    volatilidade_sharpe
):
    """
    Seleciona uma carteira diferente para cada perfil.

    Conservador:
        carteira global de mínima variância.

    Moderado:
        carteira de máximo Sharpe.

    Arrojado:
        carteira eficiente com retorno-alvo elevado.
    """
    num_ativos = len(
        retorno_medio
    )

    if perfil == "conservador":
        return {
            "pesos": pesos_minimos,
            "retorno": retorno_minimo,
            "volatilidade": volatilidade_minima,
            "estrategia": "Mínima variância",
        }

    if perfil == "moderado":
        return {
            "pesos": pesos_sharpe,
            "retorno": retorno_sharpe,
            "volatilidade": volatilidade_sharpe,
            "estrategia": "Máximo Sharpe",
        }

    retorno_maximo = float(
        np.max(
            np.asarray(
                retorno_medio,
                dtype=float
            )
        )
    )

    retorno_alvo = (
        retorno_minimo
        + FRACAO_RETORNO_ARROJADO
        * (
            retorno_maximo
            - retorno_minimo
        )
    )

    (
        pesos_arrojados,
        retorno_arrojado,
        volatilidade_arrojada
    ) = otimizar_retorno_alvo(
        retorno_medio,
        cov_matrix,
        num_ativos,
        retorno_alvo,
        pesos_iniciais=pesos_sharpe
    )

    if pesos_arrojados is None:
        (
            pesos_arrojados,
            retorno_arrojado,
            volatilidade_arrojada
        ) = criar_carteira_maximo_retorno(
            retorno_medio,
            cov_matrix
        )

    return {
        "pesos": pesos_arrojados,
        "retorno": retorno_arrojado,
        "volatilidade": volatilidade_arrojada,
        "estrategia": (
            "Fronteira eficiente de alto retorno"
        ),
    }


# ============================================================
# SIMULAÇÕES E FRONTEIRA
# ============================================================

def simular_carteiras(
    retorno_medio,
    cov_matrix,
    num_ativos,
    n=SIMULACOES_CARTEIRAS
):
    """
    Gera carteiras aleatórias em lote para representar
    o conjunto viável de Markowitz.
    """
    rng = np.random.default_rng(42)
    pesos = rng.dirichlet(
        np.ones(num_ativos),
        size=n
    )

    retornos = pesos @ np.asarray(
        retorno_medio,
        dtype=float
    )
    cov_array = np.asarray(
        cov_matrix,
        dtype=float
    )
    variancias = np.einsum(
        "ij,jk,ik->i",
        pesos,
        cov_array,
        pesos
    )
    volatilidades = np.sqrt(
        np.maximum(variancias, 0)
    )

    return [
        {
            "retorno": float(retorno),
            "volatilidade": float(volatilidade),
        }
        for retorno, volatilidade in zip(
            retornos,
            volatilidades
        )
    ]


def calcular_fronteira_eficiente(
    retorno_medio,
    cov_matrix,
    num_ativos,
    num_pontos=200
):
    """
    Calcula a parte eficiente da fronteira
    de Markowitz.
    """
    (
        pesos_minimos,
        retorno_minimo,
        _
    ) = otimizar_minima_variancia(
        retorno_medio,
        cov_matrix,
        num_ativos
    )

    if pesos_minimos is None:
        return []

    retorno_maximo = float(
        np.max(
            np.asarray(
                retorno_medio,
                dtype=float
            )
        )
    )

    retornos_alvo = np.linspace(
        retorno_minimo,
        retorno_maximo,
        num_pontos
    )

    fronteira = []

    pesos_anteriores = (
        pesos_minimos.copy()
    )

    for retorno_alvo in retornos_alvo:
        (
            pesos,
            retorno,
            volatilidade
        ) = otimizar_retorno_alvo(
            retorno_medio,
            cov_matrix,
            num_ativos,
            retorno_alvo,
            pesos_iniciais=pesos_anteriores
        )

        if pesos is None:
            continue

        fronteira.append({
            "volatilidade": float(
                volatilidade
            ),

            "retorno": float(
                retorno
            )
        })

        pesos_anteriores = (
            pesos.copy()
        )

    fronteira.sort(
        key=lambda ponto:
        ponto["volatilidade"]
    )

    fronteira_eficiente = []
    maior_retorno = -float("inf")

    for ponto in fronteira:
        if (
            ponto["retorno"]
            > maior_retorno
            + TOLERANCIA
        ):
            fronteira_eficiente.append(
                ponto
            )

            maior_retorno = (
                ponto["retorno"]
            )

    return fronteira_eficiente


# ============================================================
# DOWNLOAD E PROCESSAMENTO DOS ATIVOS
# ============================================================

def processar_dados(
    tickers,
    periodo="1y"
):
    """
    Baixa os preços dos ativos e calcula:

    - retornos simples diários;
    - retorno médio anualizado;
    - matriz de covariância anualizada.
    """
    tickers = normalizar_tickers(
        tickers
    )

    if not tickers:
        return (
            None,
            None,
            None,
            None,
            "Nenhum ticker informado"
        )

    chave_cache = (
        f"mercado:{periodo}:"
        f"{'-'.join(sorted(tickers))}"
    )
    resultado_cache = cache.get(
        chave_cache
    )

    if resultado_cache is not None:
        return resultado_cache

    dados = yf.download(
        tickers=tickers,
        period=periodo,
        progress=False,
        auto_adjust=False,
        threads=True
    )

    if dados is None or dados.empty:
        return (
            None,
            None,
            None,
            None,
            "Nenhum dado encontrado"
        )

    precos = extrair_precos_fechamento(
        dados,
        tickers
    )

    if precos is None or precos.empty:
        return (
            None,
            None,
            None,
            None,
            "Dados de fechamento indisponíveis"
        )

    colunas_disponiveis = set(
        precos.columns
    )

    tickers_validos = [
        ticker
        for ticker in tickers
        if ticker in colunas_disponiveis
    ]

    if not tickers_validos:
        return (
            None,
            None,
            None,
            None,
            "Nenhum ticker válido encontrado"
        )

    precos = precos[
        tickers_validos
    ]

    precos = precos.dropna(
        axis=0,
        how="all"
    )

    retornos = precos.pct_change().dropna()

    # Usa apenas datas com retorno disponível
    # para todos os ativos selecionados.
    retornos = retornos.dropna(
        axis=0,
        how="any"
    )

    if len(retornos) < MIN_OBSERVACOES:
        return (
            None,
            None,
            None,
            None,
            "Dados históricos insuficientes"
        )

    retorno_medio = calcular_retorno_anual(
        retornos
    )

    cov_matrix = calcular_matriz_covariancia(
        retornos
    )

    resultado = (
        precos,
        retornos,
        retorno_medio,
        cov_matrix,
        tickers_validos
    )
    cache.set(
        chave_cache,
        resultado,
        timeout=900
    )

    return resultado


# ============================================================
# BETA CONTRA O IBOVESPA
# ============================================================

def baixar_retornos_benchmark(
    precos_ativos,
    benchmark=BENCHMARK_PADRAO
):
    """
    Baixa o benchmark no mesmo intervalo
    dos ativos selecionados.
    """
    if (
        precos_ativos is None
        or precos_ativos.empty
    ):
        return None

    data_inicial = (
        precos_ativos.index.min()
        - pd.Timedelta(days=5)
    )

    data_final = (
        precos_ativos.index.max()
        + pd.Timedelta(days=1)
    )

    dados_mercado = yf.download(
        tickers=benchmark,
        start=data_inicial,
        end=data_final,
        progress=False,
        auto_adjust=False,
        threads=False
    )

    if (
        dados_mercado is None
        or dados_mercado.empty
    ):
        return None

    precos_mercado = (
        extrair_precos_fechamento(
            dados_mercado,
            [benchmark]
        )
    )

    if (
        precos_mercado is None
        or precos_mercado.empty
    ):
        return None

    serie_mercado = pd.to_numeric(
        precos_mercado.iloc[:, 0],
        errors="coerce"
    ).dropna()

    if serie_mercado.empty:
        return None

    retornos_mercado = (
        serie_mercado
        .pct_change()
        .dropna()
    )

    retornos_mercado.name = benchmark

    return retornos_mercado


def calcular_beta_carteira(
    pesos,
    retornos_ativos,
    retornos_mercado
):
    """
    Calcula:

    beta = Cov(Rp, Rm) / Var(Rm)
    """
    if (
        retornos_mercado is None
        or retornos_mercado.empty
    ):
        return None

    retorno_carteira = (
        retornos_ativos.dot(
            np.asarray(
                pesos,
                dtype=float
            )
        )
    )

    retorno_carteira.name = (
        "carteira"
    )

    dados_alinhados = pd.concat(
        [
            retorno_carteira,

            retornos_mercado.rename(
                "mercado"
            )
        ],

        axis=1,
        join="inner"
    ).dropna()

    if (
        len(dados_alinhados)
        < MIN_OBSERVACOES
    ):
        return None

    variancia_mercado = float(
        dados_alinhados[
            "mercado"
        ].var(ddof=1)
    )

    if (
        not np.isfinite(
            variancia_mercado
        )
        or variancia_mercado
        < TOLERANCIA
    ):
        return None

    covariancia = float(
        dados_alinhados[
            "carteira"
        ].cov(
            dados_alinhados[
                "mercado"
            ]
        )
    )

    beta = (
        covariancia
        / variancia_mercado
    )

    if not np.isfinite(beta):
        return None

    return float(beta)


# ============================================================
# MATRIZ DE CORRELAÇÃO
# ============================================================

def calcular_matriz_correlacao(
    retornos
):
    """
    Correlação real entre os retornos diários.
    """
    return retornos.corr()


def serializar_matriz_correlacao(
    matriz_correlacao,
    tickers
):
    """
    Converte a matriz de correlação
    para um dicionário JSON.
    """
    matriz = {}

    for ticker_linha in tickers:
        matriz[ticker_linha] = {}

        for ticker_coluna in tickers:
            valor = matriz_correlacao.loc[
                ticker_linha,
                ticker_coluna
            ]

            if not np.isfinite(valor):
                valor = 0.0

            matriz[ticker_linha][
                ticker_coluna
            ] = float(valor)

    return matriz


def gerar_historico_comparativo(
    pesos,
    retornos_ativos,
    retornos_mercado
):
    """
    Gera o desempenho histórico real da carteira
    e do Ibovespa, ambos normalizados em base 100.

    A série começa em 100 antes do primeiro retorno.
    Assim, o primeiro retorno observado não é apagado
    pela normalização.
    """
    if (
        retornos_ativos is None
        or retornos_ativos.empty
        or retornos_mercado is None
        or retornos_mercado.empty
    ):
        return None

    pesos = np.asarray(
        pesos,
        dtype=float
    )

    retorno_carteira = retornos_ativos.dot(
        pesos
    )
    retorno_carteira.name = "carteira"

    dados = pd.concat(
        [
            retorno_carteira,
            retornos_mercado.rename("ibovespa")
        ],
        axis=1,
        join="inner"
    ).dropna()

    if len(dados) < MIN_OBSERVACOES:
        return None

    desempenho_carteira = (
        1.0 + dados["carteira"]
    ).cumprod() * 100.0

    desempenho_ibovespa = (
        1.0 + dados["ibovespa"]
    ).cumprod() * 100.0

    data_inicial = (
        dados.index[0]
        - pd.Timedelta(days=1)
    )

    desempenho_carteira = pd.concat([
        pd.Series(
            [100.0],
            index=[data_inicial]
        ),
        desempenho_carteira
    ])

    desempenho_ibovespa = pd.concat([
        pd.Series(
            [100.0],
            index=[data_inicial]
        ),
        desempenho_ibovespa
    ])

    return {
        "meses": [
            data.strftime("%Y-%m-%d")
            for data in desempenho_carteira.index
        ],
        "carteira": [
            float(valor)
            for valor in desempenho_carteira
        ],
        "ibovespa": [
            float(valor)
            for valor in desempenho_ibovespa
        ],
        "cdi": [],
        "demonstrativo": False,
    }


# ============================================================
# ENDPOINT DE INFORMAÇÕES DOS ATIVOS
# ============================================================

def carregar_catalogo_acoes_b3():
    """Carrega o catálogo local de ações da B3 ou usa um fallback simples."""
    caminho = (
        settings.BASE_DIR
        / "carteiras"
        / "data"
        / "acoes_b3.json"
    )

    try:
        with open(caminho, "r", encoding="utf-8") as arquivo:
            dados = json.load(arquivo)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return [
            {
                "ticker": "PETR4.SA",
                "codigo": "PETR4",
                "nome": "PETROLEO BRASILEIRO S.A. PETROBRAS",
                "classe": "PN",
            },
            {
                "ticker": "VALE3.SA",
                "codigo": "VALE3",
                "nome": "VALE S.A.",
                "classe": "ON",
            },
            {
                "ticker": "ITUB4.SA",
                "codigo": "ITUB4",
                "nome": "ITAÚ UNIBANCO HOLDING S.A.",
                "classe": "PN",
            },
            {
                "ticker": "BBDC4.SA",
                "codigo": "BBDC4",
                "nome": "BANCO BRADESCO S.A.",
                "classe": "PN",
            },
            {
                "ticker": "WEGE3.SA",
                "codigo": "WEGE3",
                "nome": "WEG S.A.",
                "classe": "ON",
            },
        ]

    if isinstance(dados, list):
        return dados

    return []


class AcoesDisponiveisView(APIView):
    def get(self, request):
        busca = (
            request.GET
            .get("busca", "")
            .strip()
            .lower()
        )
        limite = request.GET.get("limite", "10")

        try:
            limite = int(limite)
        except ValueError:
            limite = 10

        limite = max(1, min(limite, 30))

        acoes = carregar_catalogo_acoes_b3()

        if busca:
            busca_normalizada = normalizar_texto(busca)
            resultados = []

            for acao in acoes:
                codigo = normalizar_texto(acao.get("codigo", ""))
                nome = normalizar_texto(acao.get("nome", ""))

                if not codigo and not nome:
                    continue

                score = 0
                if codigo.startswith(busca_normalizada):
                    score += 100
                if busca_normalizada in codigo:
                    score += 50
                if busca_normalizada in nome:
                    score += 20
                if nome.startswith(busca_normalizada):
                    score += 10

                if score:
                    resultados.append((score, acao))

            resultados.sort(key=lambda item: (-item[0], item[1].get("codigo", "")))
            acoes = [acao for _, acao in resultados[:limite]]
        else:
            acoes = acoes[:limite]

        return Response(acoes)


class InfoAtivosView(APIView):
    def get(self, request):
        tickers_param = request.GET.get(
            "tickers",
            ""
        )

        tickers = normalizar_tickers(
            tickers_param.split(",")
        )

        if not tickers:
            return Response(
                {
                    "erro": (
                        "Nenhum ticker informado"
                    )
                },

                status=(
                    status.HTTP_400_BAD_REQUEST
                )
            )

        info_ativos = []

        for ticker in tickers:
            try:
                ativo = yf.Ticker(
                    ticker
                )

                info = ativo.info or {}

                preco_atual = (
                    info.get("currentPrice")
                    or info.get(
                        "regularMarketPrice"
                    )
                    or info.get(
                        "previousClose"
                    )
                    or 0
                )

                info_ativos.append({
                    "ticker": ticker,

                    "nome": info.get(
                        "longName",
                        ticker
                    ),

                    "preco_atual": float(
                        preco_atual or 0
                    ),

                    "setor": info.get(
                        "sector",
                        "N/A"
                    )
                })

            except Exception:
                info_ativos.append({
                    "ticker": ticker,
                    "nome": ticker,
                    "preco_atual": 0.0,
                    "setor": "N/A"
                })

        return Response(
            info_ativos
        )


# ============================================================
# ENDPOINT DE OTIMIZAÇÃO POR PERFIL
# ============================================================

class OtimizarCarteiraView(APIView):
    def post(self, request):
        tickers = request.data.get(
            "tickers",
            [
                "PETR4.SA",
                "VALE3.SA",
                "ITUB4.SA",
                "BBDC4.SA",
                "WEGE3.SA"
            ]
        )

        periodo = request.data.get(
            "periodo",
            "1y"
        )

        perfil = normalizar_perfil(
            request.data.get(
                "perfil",
                "moderado"
            )
        )

        try:
            (
                precos,
                retornos,
                retorno_medio,
                cov_matrix,
                tickers_validos
            ) = processar_dados(
                tickers,
                periodo
            )

            if precos is None:
                return Response(
                    {
                        "erro": tickers_validos
                    },

                    status=(
                        status.HTTP_400_BAD_REQUEST
                    )
                )

            num_ativos = len(
                tickers_validos
            )

            retornos_mercado = (
                baixar_retornos_benchmark(
                    precos,
                    BENCHMARK_PADRAO
                )
            )

            correlacao = (
                calcular_matriz_correlacao(
                    retornos
                )
            )

            matriz_correlacao = (
                serializar_matriz_correlacao(
                    correlacao,
                    tickers_validos
                )
            )

            # Caso exista apenas um ativo válido.
            if num_ativos == 1:
                pesos = np.array(
                    [1.0]
                )

                retorno = float(
                    retorno_medio.iloc[0]
                )

                volatilidade = float(
                    np.sqrt(
                        cov_matrix.iloc[
                            0,
                            0
                        ]
                    )
                )

                sharpe = (
                    (
                        retorno
                        - TAXA_LIVRE_RISCO
                    )
                    / volatilidade

                    if volatilidade
                    > TOLERANCIA

                    else 0.0
                )

                beta = calcular_beta_carteira(
                    pesos,
                    retornos,
                    retornos_mercado
                )

                pesos_unico = {
                    tickers_validos[0]: 1.0
                }

                return Response({
                    "sucesso": True,
                    "periodo": periodo,
                    "perfil": perfil,
                    "estrategia": "Ativo único",

                    "pesos": pesos_unico,

                    "retorno_esperado": retorno,

                    "volatilidade": volatilidade,

                    "indice_sharpe": float(
                        sharpe
                    ),

                    "beta": (
                        float(beta)
                        if beta is not None
                        else None
                    ),

                    "benchmark": (
                        BENCHMARK_PADRAO
                    ),

                    "tickers_validos": (
                        tickers_validos
                    ),

                    "matriz_correlacao": (
                        matriz_correlacao
                    ),

                    "min_variancia": {
                        "retorno": retorno,
                        "volatilidade": volatilidade,
                        "pesos": pesos_unico
                    },

                    "max_sharpe": {
                        "retorno": retorno,
                        "volatilidade": volatilidade,
                        "indice_sharpe": float(
                            sharpe
                        ),
                        "pesos": pesos_unico
                    }
                })

            (
                pesos_minimos,
                retorno_minimo,
                volatilidade_minima
            ) = otimizar_minima_variancia(
                retorno_medio,
                cov_matrix,
                num_ativos
            )

            (
                pesos_sharpe,
                retorno_sharpe,
                volatilidade_sharpe
            ) = otimizar_maximo_sharpe(
                retorno_medio,
                cov_matrix,
                num_ativos
            )

            if pesos_minimos is None:
                return Response(
                    {
                        "erro": (
                            "Falha ao calcular a "
                            "carteira de mínima variância."
                        )
                    },

                    status=(
                        status.HTTP_400_BAD_REQUEST
                    )
                )

            if pesos_sharpe is None:
                return Response(
                    {
                        "erro": (
                            "Falha ao calcular a "
                            "carteira de máximo Sharpe."
                        )
                    },

                    status=(
                        status.HTTP_400_BAD_REQUEST
                    )
                )

            carteira_perfil = (
                selecionar_carteira_por_perfil(
                    perfil=perfil,

                    retorno_medio=(
                        retorno_medio
                    ),

                    cov_matrix=(
                        cov_matrix
                    ),

                    pesos_minimos=(
                        pesos_minimos
                    ),

                    retorno_minimo=(
                        retorno_minimo
                    ),

                    volatilidade_minima=(
                        volatilidade_minima
                    ),

                    pesos_sharpe=(
                        pesos_sharpe
                    ),

                    retorno_sharpe=(
                        retorno_sharpe
                    ),

                    volatilidade_sharpe=(
                        volatilidade_sharpe
                    )
                )
            )

            pesos_selecionados = limpar_pesos(
                carteira_perfil[
                    "pesos"
                ]
            )

            retorno_selecionado = float(
                carteira_perfil[
                    "retorno"
                ]
            )

            volatilidade_selecionada = float(
                carteira_perfil[
                    "volatilidade"
                ]
            )

            sharpe_selecionado = calcular_sharpe(
                pesos_selecionados,
                retorno_medio,
                cov_matrix
            )

            beta_selecionado = (
                calcular_beta_carteira(
                    pesos_selecionados,
                    retornos,
                    retornos_mercado
                )
            )

            sharpe_maximo = calcular_sharpe(
                pesos_sharpe,
                retorno_medio,
                cov_matrix
            )

            return Response({
                "sucesso": True,

                "periodo": periodo,

                "perfil": perfil,

                "estrategia": (
                    carteira_perfil[
                        "estrategia"
                    ]
                ),

                "pesos": serializar_pesos(
                    tickers_validos,
                    pesos_selecionados
                ),

                "retorno_esperado": (
                    retorno_selecionado
                ),

                "volatilidade": (
                    volatilidade_selecionada
                ),

                "indice_sharpe": float(
                    sharpe_selecionado
                ),

                "beta": (
                    float(
                        beta_selecionado
                    )

                    if beta_selecionado
                    is not None

                    else None
                ),

                "benchmark": (
                    BENCHMARK_PADRAO
                ),

                "tickers_validos": (
                    tickers_validos
                ),

                "matriz_correlacao": (
                    matriz_correlacao
                ),

                "min_variancia": {
                    "retorno": float(
                        retorno_minimo
                    ),

                    "volatilidade": float(
                        volatilidade_minima
                    ),

                    "pesos": serializar_pesos(
                        tickers_validos,
                        pesos_minimos
                    )
                },

                "max_sharpe": {
                    "retorno": float(
                        retorno_sharpe
                    ),

                    "volatilidade": float(
                        volatilidade_sharpe
                    ),

                    "indice_sharpe": float(
                        sharpe_maximo
                    ),

                    "pesos": serializar_pesos(
                        tickers_validos,
                        pesos_sharpe
                    )
                }
            })

        except Exception as erro:
            return Response(
                {
                    "erro": str(erro)
                },

                status=(
                    status.HTTP_400_BAD_REQUEST
                )
            )


# ============================================================
# ENDPOINT DA FRONTEIRA EFICIENTE
# ============================================================

class AnalisarCarteiraView(APIView):
    def post(self, request):
        serializer = AnaliseCarteiraSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"erro": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dados = serializer.validated_data
        tickers = dados['tickers']
        periodo = dados['periodo']
        perfil = dados['perfil']

        try:
            (
                precos,
                retornos,
                retorno_medio,
                cov_matrix,
                tickers_validos,
            ) = processar_dados(tickers, periodo)

            if precos is None:
                return Response(
                    {"erro": tickers_validos or "Não foi possível processar os dados."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            num_ativos = len(tickers_validos)
            retornos_mercado = baixar_retornos_benchmark(precos, BENCHMARK_PADRAO)
            correlacao = calcular_matriz_correlacao(retornos)
            matriz_correlacao = serializar_matriz_correlacao(correlacao, tickers_validos)

            if num_ativos == 1:
                pesos = np.array([1.0])
                retorno = float(retorno_medio.iloc[0])
                volatilidade = float(np.sqrt(cov_matrix.iloc[0, 0]))
                sharpe = (
                    (retorno - TAXA_LIVRE_RISCO) / volatilidade
                    if volatilidade > TOLERANCIA
                    else 0.0
                )
                beta = calcular_beta_carteira(pesos, retornos, retornos_mercado)
                pesos_unico = {tickers_validos[0]: 1.0}

                historico = gerar_historico_comparativo(
                    pesos=pesos,
                    retornos_ativos=retornos,
                    retornos_mercado=retornos_mercado,
                )

                return Response({
                    "sucesso": True,
                    "periodo": periodo,
                    "perfil": perfil,
                    "estrategia": "Ativo único",
                    "carteira": {
                        "pesos": pesos_unico,
                        "retorno_esperado": retorno,
                        "volatilidade": volatilidade,
                        "indice_sharpe": float(sharpe),
                        "beta": float(beta) if beta is not None else None,
                        "benchmark": BENCHMARK_PADRAO,
                        "tickers_validos": tickers_validos,
                        "matriz_correlacao": matriz_correlacao,
                    },
                    "fronteira_eficiente": [],
                    "carteiras_simuladas": [],
                    "ativos": [{"ticker": ticker, "retorno": float(retorno_medio.iloc[idx]), "volatilidade": float(np.sqrt(cov_matrix.iloc[idx, idx]))} for idx, ticker in enumerate(tickers_validos)],
                    "precos": {ticker: float(precos[ticker].iloc[-1]) for ticker in tickers_validos if not precos[ticker].empty},
                    "historico": historico,
                    "matriz_correlacao": matriz_correlacao,
                    "taxa_livre_risco": TAXA_LIVRE_RISCO,
                })

            (
                pesos_minimos,
                retorno_minimo,
                volatilidade_minima,
            ) = otimizar_minima_variancia(retorno_medio, cov_matrix, num_ativos)
            (
                pesos_sharpe,
                retorno_sharpe,
                volatilidade_sharpe,
            ) = otimizar_maximo_sharpe(retorno_medio, cov_matrix, num_ativos)

            if pesos_minimos is None or pesos_sharpe is None:
                return Response({"erro": "Falha ao calcular a otimização da carteira."}, status=status.HTTP_400_BAD_REQUEST)

            carteira_perfil = selecionar_carteira_por_perfil(
                perfil=perfil,
                retorno_medio=retorno_medio,
                cov_matrix=cov_matrix,
                pesos_minimos=pesos_minimos,
                retorno_minimo=retorno_minimo,
                volatilidade_minima=volatilidade_minima,
                pesos_sharpe=pesos_sharpe,
                retorno_sharpe=retorno_sharpe,
                volatilidade_sharpe=volatilidade_sharpe,
            )
            pesos_selecionados = limpar_pesos(carteira_perfil['pesos'])
            retorno_selecionado = float(carteira_perfil['retorno'])
            volatilidade_selecionada = float(carteira_perfil['volatilidade'])
            sharpe_selecionado = calcular_sharpe(pesos_selecionados, retorno_medio, cov_matrix)
            beta_selecionado = calcular_beta_carteira(pesos_selecionados, retornos, retornos_mercado)
            sharpe_maximo = calcular_sharpe(pesos_sharpe, retorno_medio, cov_matrix)

            fronteira_eficiente = calcular_fronteira_eficiente(retorno_medio, cov_matrix, num_ativos)
            carteiras_simuladas = simular_carteiras(retorno_medio, cov_matrix, num_ativos)

            precos_atuais = {ticker: float(precos[ticker].iloc[-1]) for ticker in tickers_validos if not precos[ticker].empty}
            ativos = [
                {
                    'ticker': ticker,
                    'retorno': float(retorno_medio.iloc[idx]),
                    'volatilidade': float(np.sqrt(cov_matrix.iloc[idx, idx])),
                }
                for idx, ticker in enumerate(tickers_validos)
            ]

            historico = gerar_historico_comparativo(
                pesos=pesos_selecionados,
                retornos_ativos=retornos,
                retornos_mercado=retornos_mercado,
            )

            if historico is None:
                historico = {
                    'meses': [],
                    'carteira': [],
                    'ibovespa': [],
                    'cdi': [],
                    'demonstrativo': True,
                }

            return Response({
                'sucesso': True,
                'periodo': periodo,
                'perfil': perfil,
                'estrategia': carteira_perfil['estrategia'],
                'carteira': {
                    'pesos': serializar_pesos(tickers_validos, pesos_selecionados),
                    'retorno_esperado': retorno_selecionado,
                    'volatilidade': volatilidade_selecionada,
                    'indice_sharpe': float(sharpe_selecionado),
                    'beta': float(beta_selecionado) if beta_selecionado is not None else None,
                    'benchmark': BENCHMARK_PADRAO,
                    'tickers_validos': tickers_validos,
                    'matriz_correlacao': matriz_correlacao,
                    'min_variancia': {
                        'retorno': float(retorno_minimo),
                        'volatilidade': float(volatilidade_minima),
                        'pesos': serializar_pesos(tickers_validos, pesos_minimos),
                    },
                    'max_sharpe': {
                        'retorno': float(retorno_sharpe),
                        'volatilidade': float(volatilidade_sharpe),
                        'indice_sharpe': float(sharpe_maximo),
                        'pesos': serializar_pesos(tickers_validos, pesos_sharpe),
                    },
                },
                'fronteira_eficiente': fronteira_eficiente,
                'carteiras_simuladas': carteiras_simuladas,
                'ativos': ativos,
                'precos': precos_atuais,
                'historico': historico,
                'matriz_correlacao': matriz_correlacao,
                'taxa_livre_risco': TAXA_LIVRE_RISCO,
            })
        except ValueError as erro:
            logger.warning('Erro de validação na análise da carteira: %s', erro)
            return Response({'erro': str(erro)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as erro:
            logger.exception('Erro inesperado na análise da carteira')
            return Response({'erro': 'Não foi possível concluir a análise no momento.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class FronteiraEficienteView(APIView):
    def post(self, request):
        tickers = request.data.get(
            "tickers",
            [
                "PETR4.SA",
                "VALE3.SA",
                "ITUB4.SA",
                "BBDC4.SA",
                "WEGE3.SA"
            ]
        )

        periodo = request.data.get(
            "periodo",
            "1y"
        )

        perfil = normalizar_perfil(
            request.data.get(
                "perfil",
                "moderado"
            )
        )

        try:
            (
                precos,
                retornos,
                retorno_medio,
                cov_matrix,
                tickers_validos
            ) = processar_dados(
                tickers,
                periodo
            )

            if precos is None:
                return Response(
                    {
                        "erro": tickers_validos
                    },

                    status=(
                        status.HTTP_400_BAD_REQUEST
                    )
                )

            num_ativos = len(
                tickers_validos
            )

            if num_ativos < 2:
                return Response(
                    {
                        "erro": (
                            "É necessário informar "
                            "pelo menos dois ativos válidos."
                        )
                    },

                    status=(
                        status.HTTP_400_BAD_REQUEST
                    )
                )

            fronteira_eficiente = (
                calcular_fronteira_eficiente(
                    retorno_medio,
                    cov_matrix,
                    num_ativos
                )
            )

            if not fronteira_eficiente:
                return Response(
                    {
                        "erro": (
                            "Não foi possível calcular "
                            "a fronteira eficiente."
                        )
                    },

                    status=(
                        status.HTTP_400_BAD_REQUEST
                    )
                )

            carteiras_simuladas = (
                simular_carteiras(
                    retorno_medio,
                    cov_matrix,
                    num_ativos,
                    n=30000
                )
            )

            ativos = []

            for indice, ticker in enumerate(
                tickers_validos
            ):
                ativos.append({
                    "ticker": ticker,

                    "retorno": float(
                        retorno_medio.iloc[
                            indice
                        ]
                    ),

                    "volatilidade": float(
                        np.sqrt(
                            cov_matrix.iloc[
                                indice,
                                indice
                            ]
                        )
                    )
                })

            return Response({
                "periodo": periodo,

                "perfil": perfil,

                "tickers_validos": (
                    tickers_validos
                ),

                "fronteira_eficiente": (
                    fronteira_eficiente
                ),

                "ativos_individual": (
                    ativos
                ),

                "carteiras_simuladas": (
                    carteiras_simuladas
                )
            })

        except Exception as erro:
            return Response(
                {
                    "erro": str(erro)
                },

                status=(
                    status.HTTP_400_BAD_REQUEST
                )
            )