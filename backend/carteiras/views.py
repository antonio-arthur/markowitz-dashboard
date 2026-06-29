from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import yfinance as yf
import numpy as np
from scipy.optimize import minimize
import pandas as pd

TAXA_LIVRE_RISCO = 0.10
TOLERANCIA = 1e-6

def calcular_retorno_anual(retornos):
    return retornos.mean() * 252

def calcular_matriz_covariancia(retornos):
    return retornos.cov() * 252

def calcular_matriz_correlacao(retornos):
    return retornos.corr()

def calcular_volatilidade(pesos, cov_matrix):
    return np.sqrt(np.dot(pesos.T, np.dot(cov_matrix, pesos)))

def calcular_retorno_carteira(pesos, retorno_medio):
    return np.sum(retorno_medio * pesos)

def calcular_sharpe(pesos, retorno_medio, cov_matrix, taxa_livre_risco=TAXA_LIVRE_RISCO):
    ret = calcular_retorno_carteira(pesos, retorno_medio)
    vol = calcular_volatilidade(pesos, cov_matrix)
    if vol < TOLERANCIA:
        return 0
    return (ret - taxa_livre_risco) / vol

def calcular_beta(pesos, cov_matrix, cov_mercado):
    """Beta da carteira: Cov(Rp, Rm) / Var(Rm)"""
    var_mercado = cov_mercado
    if var_mercado < TOLERANCIA:
        return 1.0
    cov_portfolio_mercado = np.dot(pesos, cov_mercado)
    return float(cov_portfolio_mercado / var_mercado)

def otimizar_minima_variancia(retorno_medio, cov_matrix, num_ativos, pesos_iniciais=None):
    limites = tuple((0, 1) for _ in range(num_ativos))
    restricoes = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1})
    
    if pesos_iniciais is None:
        pesos_iniciais = np.array([1/num_ativos] * num_ativos)
    
    resultado = minimize(
        lambda w: calcular_volatilidade(w, cov_matrix),
        pesos_iniciais,
        method='SLSQP',
        bounds=limites,
        constraints=restricoes
    )
    
    if not resultado.success:
        return None, None, None, None
    
    pesos = resultado.x
    ret = calcular_retorno_carteira(pesos, retorno_medio)
    vol = calcular_volatilidade(pesos, cov_matrix)
    
    return pesos, ret, vol, resultado.x

def otimizar_maximo_sharpe(retorno_medio, cov_matrix, num_ativos, taxa_livre_risco=TAXA_LIVRE_RISCO, pesos_iniciais=None):
    limites = tuple((0, 1) for _ in range(num_ativos))
    restricoes = ({'type': 'eq', 'fun': lambda w: np.sum(w) - 1})
    
    if pesos_iniciais is None:
        pesos_iniciais = np.array([1/num_ativos] * num_ativos)
    
    def sharpe_negativo(pesos):
        return -calcular_sharpe(pesos, retorno_medio, cov_matrix, taxa_livre_risco)
    
    resultado = minimize(
        sharpe_negativo,
        pesos_iniciais,
        method='SLSQP',
        bounds=limites,
        constraints=restricoes
    )
    
    if not resultado.success:
        return None, None, None, None
    
    pesos = resultado.x
    ret = calcular_retorno_carteira(pesos, retorno_medio)
    vol = calcular_volatilidade(pesos, cov_matrix)
    
    return pesos, ret, vol, resultado.x

def calcular_fronteira_eficiente(retorno_medio, cov_matrix, num_ativos, num_pontos=200):
    limites = tuple((0, 1) for _ in range(num_ativos))
    
    # Encontrar carteira de maximo Sharpe para usar como limite superior
    _, ret_max, _, pesos_sharpe = otimizar_maximo_sharpe(retorno_medio, cov_matrix, num_ativos)
    
    # Encontrar minima variancia
    _, ret_min, vol_min, pesos_min = otimizar_minima_variancia(retorno_medio, cov_matrix, num_ativos)
    
    if ret_min is None or ret_max is None:
        return []
    
    # Usar pesos da minima variancia como chute inicial
    pesos_iniciais = pesos_min.copy()
    
    retornos_alvo = np.linspace(ret_min, ret_max, num_pontos)
    
    fronteira = []
    
    for retorno_alvo in retornos_alvo:
        restricoes = (
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1},
            {'type': 'eq', 'fun': lambda w, r=retorno_alvo: calcular_retorno_carteira(w, retorno_medio) - r}
        )
        
        resultado = minimize(
            lambda w: calcular_volatilidade(w, cov_matrix),
            pesos_iniciais,
            method='SLSQP',
            bounds=limites,
            constraints=restricoes
        )
        
        if resultado.success:
            vol = calcular_volatilidade(resultado.x, cov_matrix)
            ret = calcular_retorno_carteira(resultado.x, retorno_medio)
            
            if ret >= retorno_alvo - TOLERANCIA:
                fronteira.append({
                    'volatilidade': float(vol),
                    'retorno': float(ret)
                })
                # Usar solucao atual como chute inicial da proxima
                pesos_iniciais = resultado.x.copy()
    
    # Ordenar por volatilidade
    fronteira = sorted(fronteira, key=lambda x: x['volatilidade'])
    
    # Filtrar apenas parte eficiente
    fronteira_eficiente = []
    max_ret = -float('inf')
    
    for ponto in fronteira:
        if ponto['retorno'] > max_ret + TOLERANCIA:
            max_ret = ponto['retorno']
            fronteira_eficiente.append(ponto)
    
    # Garantir que o primeiro ponto seja a minima variancia
    if fronteira_eficiente:
        fronteira_eficiente[0] = {
            'volatilidade': float(vol_min),
            'retorno': float(ret_min)
        }
    
    return fronteira_eficiente

def processar_dados(tickers, periodo='1y'):
    dados = yf.download(tickers, period=periodo, progress=False)
    
    if dados.empty:
        return None, None, None, None, None, None, 'Nenhum dado encontrado'
    
    if 'Adj Close' in dados.columns:
        precos = dados['Adj Close']
    else:
        precos = dados['Close']
    
    if isinstance(precos, pd.Series):
        precos = precos.to_frame()
    
    precos = precos.dropna(axis=1, how='all')
    
    if precos.empty:
        return None, None, None, None, None, None, 'Dados insuficientes'
    
    tickers_validos = precos.columns.tolist()
    retornos = np.log(precos / precos.shift(1)).dropna()
    
    if len(retornos) < 10:
        return None, None, None, None, None, None, 'Dados historicos insuficientes'
    
    retorno_medio = calcular_retorno_anual(retornos)
    cov_matrix = calcular_matriz_covariancia(retornos)
    correlacao = calcular_matriz_correlacao(retornos)
    
    return precos, retornos, retorno_medio, cov_matrix, correlacao, tickers_validos


class InfoAtivosView(APIView):
    def get(self, request):
        tickers_param = request.GET.get('tickers', '')
        tickers = [t.strip() for t in tickers_param.split(',') if t.strip()]
        
        if not tickers:
            return Response({'erro': 'Nenhum ticker informado'}, status=400)
        
        try:
            info_ativos = []
            for ticker in tickers:
                try:
                    ativo = yf.Ticker(ticker)
                    info = ativo.info
                    info_ativos.append({
                        'ticker': ticker,
                        'nome': info.get('longName', ticker),
                        'preco_atual': info.get('currentPrice') or info.get('regularMarketPrice') or 0,
                        'setor': info.get('sector', 'N/A')
                    })
                except:
                    info_ativos.append({
                        'ticker': ticker,
                        'nome': ticker,
                        'preco_atual': 0,
                        'setor': 'N/A'
                    })
            
            return Response(info_ativos)
        except Exception as e:
            return Response({'erro': str(e)}, status=400)


class OtimizarCarteiraView(APIView):
    def post(self, request):
        tickers = request.data.get('tickers', ['AAPL', 'MSFT', 'GOOGL'])
        periodo = request.data.get('periodo', '1y')
        taxa_livre_risco = request.data.get('taxa_livre_risco', TAXA_LIVRE_RISCO)
        
        try:
            precos, retornos, retorno_medio, cov_matrix, correlacao, tickers_validos = processar_dados(tickers, periodo)
            
            if precos is None:
                return Response({'erro': tickers_validos}, status=400)
            
            num_ativos = len(tickers_validos)
            
            if num_ativos == 1:
                r = float(retorno_medio.iloc[0])
                v = float(np.sqrt(cov_matrix.iloc[0, 0]))
                s = (r - taxa_livre_risco) / v if v > 0 else 0
                return Response({
                    'sucesso': True,
                    'pesos': {tickers_validos[0]: 1.0},
                    'retorno_esperado': r,
                    'volatilidade': v,
                    'indice_sharpe': s,
                    'taxa_livre_risco': taxa_livre_risco,
                })
            
            # Minima variancia
            pesos_min, ret_min, vol_min, _ = otimizar_minima_variancia(retorno_medio, cov_matrix, num_ativos)
            
            # Maximo Sharpe
            pesos_sharpe, ret_sharpe, vol_sharpe, _ = otimizar_maximo_sharpe(retorno_medio, cov_matrix, num_ativos, taxa_livre_risco)
            
            if pesos_sharpe is None:
                return Response({'erro': 'Falha na otimizacao'}, status=400)
            
            sharpe = calcular_sharpe(pesos_sharpe, retorno_medio, cov_matrix, taxa_livre_risco)
            
            # Calcular beta (usando covariancia media como proxy do mercado)
            cov_mercado = np.mean(cov_matrix.values, axis=1)
            beta = calcular_beta(pesos_sharpe, cov_matrix, cov_mercado)
            
            # Matriz de correlacao para o frontend
            matriz_correlacao = {}
            for t1 in tickers_validos:
                matriz_correlacao[t1] = {}
                for t2 in tickers_validos:
                    matriz_correlacao[t1][t2] = float(correlacao.loc[t1, t2]) if t1 in correlacao.index and t2 in correlacao.columns else 0
            
            return Response({
                'sucesso': True,
                'pesos': {ticker: float(p) for ticker, p in zip(tickers_validos, pesos_sharpe)},
                'retorno_esperado': float(ret_sharpe),
                'volatilidade': float(vol_sharpe),
                'indice_sharpe': float(sharpe),
                'beta': float(beta),
                'taxa_livre_risco': taxa_livre_risco,
                'matriz_correlacao': matriz_correlacao,
                'min_variancia': {
                    'retorno': float(ret_min) if ret_min is not None else 0,
                    'volatilidade': float(vol_min) if vol_min is not None else 0
                }
            })
            
        except Exception as e:
            return Response({'erro': str(e)}, status=400)


class FronteiraEficienteView(APIView):
    def post(self, request):
        tickers = request.data.get('tickers', ['AAPL', 'MSFT', 'GOOGL'])
        
        try:
            precos, retornos, retorno_medio, cov_matrix, correlacao, tickers_validos = processar_dados(tickers, '1y')
            
            if precos is None:
                return Response({'erro': tickers_validos}, status=400)
            
            num_ativos = len(tickers_validos)
            
            if num_ativos < 2:
                return Response({'erro': 'Necessario pelo menos 2 ativos'}, status=400)
            
            # Fronteira eficiente
            fronteira_eficiente = calcular_fronteira_eficiente(retorno_medio, cov_matrix, num_ativos, num_pontos=200)
            
            # Ativos individuais
            ativos = []
            for i, ticker in enumerate(tickers_validos):
                ativos.append({
                    'ticker': ticker,
                    'retorno': float(retorno_medio.iloc[i]),
                    'volatilidade': float(np.sqrt(cov_matrix.iloc[i, i]))
                })
            
            # Minima variancia
            _, ret_min, vol_min, _ = otimizar_minima_variancia(retorno_medio, cov_matrix, num_ativos)
            
            return Response({
                'fronteira_eficiente': fronteira_eficiente,
                'ativos_individual': ativos,
                'min_variancia': {
                    'retorno': float(ret_min) if ret_min is not None else 0,
                    'volatilidade': float(vol_min) if vol_min is not None else 0
                },
                'taxa_livre_risco': TAXA_LIVRE_RISCO
            })
            
        except Exception as e:
            return Response({'erro': str(e)}, status=400)
