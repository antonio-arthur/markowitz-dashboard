from unittest.mock import patch

import numpy as np
import pandas as pd
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from carteiras.views import (
    AnalisarCarteiraView,
    AcoesDisponiveisView,
    gerar_historico_comparativo,
)


class AcoesDisponiveisViewTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch('carteiras.views.MIN_OBSERVACOES', 1)
    def test_gerar_historico_comparativo_usa_retorno_simples(self):
        retornos_ativos = pd.DataFrame(
            {'PETR4.SA': [0.10, -0.05, 0.02]},
            index=pd.date_range(
                '2024-01-01',
                periods=3,
                freq='D',
            ),
        )

        retornos_mercado = pd.Series(
            [0.08, 0.01, -0.02],
            index=retornos_ativos.index,
            name='^BVSP',
        )

        historico = gerar_historico_comparativo(
            pesos=np.array([1.0]),
            retornos_ativos=retornos_ativos,
            retornos_mercado=retornos_mercado,
        )

        self.assertIsNotNone(historico)

        self.assertEqual(
            historico['carteira'][0],
            100.0,
        )

        self.assertAlmostEqual(
            historico['carteira'][1],
            110.0,
        )

        self.assertAlmostEqual(
            historico['carteira'][2],
            104.5,
        )

        self.assertAlmostEqual(
            historico['carteira'][3],
            106.59,
        )

    @patch('builtins.open', side_effect=FileNotFoundError)
    def test_endpoint_retorna_fallback_quando_catalogo_nao_existe(
        self,
        _mock_open,
    ):
        request = self.factory.get(
            '/api/acoes/',
            {'busca': 'petr'},
        )

        response = AcoesDisponiveisView.as_view()(request)

        self.assertEqual(response.status_code, 200)

        payload = response.data

        self.assertTrue(
            isinstance(payload, list)
        )

        self.assertGreaterEqual(
            len(payload),
            1,
        )

        self.assertEqual(
            payload[0]['codigo'],
            'PETR4',
        )

    def test_endpoint_retorna_acoes_filtradas_por_busca(self):
        request = self.factory.get(
            '/api/acoes/',
            {'busca': 'petr'},
        )

        response = AcoesDisponiveisView.as_view()(request)

        self.assertEqual(response.status_code, 200)

        payload = response.data

        self.assertTrue(
            isinstance(payload, list)
        )

        self.assertGreaterEqual(
            len(payload),
            2,
        )

        self.assertEqual(
            payload[0]['codigo'],
            'PETR3',
        )


class AnalisarCarteiraViewTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch('carteiras.views.obter_taxa_livre_risco', return_value=0.10)
    @patch('carteiras.views.baixar_retornos_benchmark')
    @patch('carteiras.views.processar_dados')
    def test_endpoint_agregado_retorna_dados_completos(
        self,
        mock_processar_dados,
        mock_benchmark,
        _mock_taxa_livre_risco,
    ):
        precos = pd.DataFrame(
            {
                'PETR4.SA': [100.0, 101.0, 102.0],
                'VALE3.SA': [50.0, 51.0, 52.0],
            },
            index=pd.date_range(
                '2024-01-01',
                periods=3,
                freq='D',
            ),
        )

        retornos = pd.DataFrame(
            {
                'PETR4.SA': [0.01, 0.01],
                'VALE3.SA': [0.02, -0.01],
            },
            index=pd.date_range(
                '2024-01-02',
                periods=2,
                freq='D',
            ),
        )

        retorno_medio = pd.Series({
            'PETR4.SA': 0.12,
            'VALE3.SA': 0.15,
        })

        cov_matrix = pd.DataFrame(
            [
                [0.04, 0.01],
                [0.01, 0.03],
            ],
            index=[
                'PETR4.SA',
                'VALE3.SA',
            ],
            columns=[
                'PETR4.SA',
                'VALE3.SA',
            ],
        )

        mock_processar_dados.return_value = (
            precos,
            retornos,
            retorno_medio,
            cov_matrix,
            [
                'PETR4.SA',
                'VALE3.SA',
            ],
        )

        mock_benchmark.return_value = pd.Series(
            [0.01, 0.02],
            index=retornos.index,
        )

        request = self.factory.post(
            '/api/analisar-carteira/',
            {
                'tickers': [
                    'PETR4.SA',
                    'VALE3.SA',
                ],
                'periodo': '1y',
                'perfil': 'moderado',
            },
            format='json',
        )

        response = AnalisarCarteiraView.as_view()(request)

        self.assertEqual(response.status_code, 200)

        payload = response.data

        self.assertIn('carteira', payload)
        self.assertIn('fronteira_eficiente', payload)
        self.assertIn('carteiras_simuladas', payload)
        self.assertIn('ativos', payload)
        self.assertIn('precos', payload)
        self.assertIn('historico', payload)
        self.assertIn('matriz_correlacao', payload)

        self.assertEqual(
            payload['taxa_livre_risco'],
            0.10,
        )

    @patch('carteiras.views.obter_taxa_livre_risco', return_value=0.10)
    @patch('carteiras.views.simular_carteiras', return_value=[])
    @patch('carteiras.views.calcular_fronteira_eficiente', return_value=[])
    @patch('carteiras.views.selecionar_carteira_por_perfil')
    @patch('carteiras.views.otimizar_maximo_sharpe')
    @patch('carteiras.views.otimizar_minima_variancia')
    @patch('carteiras.views.baixar_retornos_benchmark')
    @patch('carteiras.views.processar_dados')
    def test_endpoint_retorna_historico_real_para_carteira_multiactivo(
        self,
        mock_processar_dados,
        mock_benchmark,
        mock_otimizar_minima_variancia,
        mock_otimizar_maximo_sharpe,
        mock_selecionar_carteira_por_perfil,
        _mock_calcular_fronteira,
        _mock_simular_carteiras,
        _mock_taxa_livre_risco,
    ):
        index = pd.date_range(
            '2024-01-01',
            periods=61,
            freq='D',
        )

        precos = pd.DataFrame(
            {
                'PETR4.SA': np.linspace(
                    100.0,
                    160.0,
                    61,
                ),
                'VALE3.SA': np.linspace(
                    50.0,
                    80.0,
                    61,
                ),
            },
            index=index,
        )

        retornos = pd.DataFrame(
            {
                'PETR4.SA': np.full(
                    60,
                    0.01,
                ),
                'VALE3.SA': np.full(
                    60,
                    0.015,
                ),
            },
            index=index[1:],
        )

        retorno_medio = pd.Series({
            'PETR4.SA': 0.01,
            'VALE3.SA': 0.015,
        })

        cov_matrix = pd.DataFrame(
            [
                [0.0004, 0.0001],
                [0.0001, 0.0003],
            ],
            index=[
                'PETR4.SA',
                'VALE3.SA',
            ],
            columns=[
                'PETR4.SA',
                'VALE3.SA',
            ],
        )

        mock_processar_dados.return_value = (
            precos,
            retornos,
            retorno_medio,
            cov_matrix,
            [
                'PETR4.SA',
                'VALE3.SA',
            ],
        )

        mock_benchmark.return_value = pd.Series(
            np.full(
                60,
                0.005,
            ),
            index=retornos.index,
        )

        mock_otimizar_minima_variancia.return_value = (
            np.array([0.6, 0.4]),
            0.011,
            0.008,
        )

        mock_otimizar_maximo_sharpe.return_value = (
            np.array([0.5, 0.5]),
            0.012,
            0.007,
        )

        mock_selecionar_carteira_por_perfil.return_value = {
            'pesos': np.array([0.6, 0.4]),
            'retorno': 0.011,
            'volatilidade': 0.008,
            'estrategia': 'moderado',
        }

        request = self.factory.post(
            '/api/analisar-carteira/',
            {
                'tickers': [
                    'PETR4.SA',
                    'VALE3.SA',
                ],
                'periodo': '1y',
                'perfil': 'moderado',
            },
            format='json',
        )

        response = AnalisarCarteiraView.as_view()(request)

        self.assertEqual(response.status_code, 200)

        payload = response.data

        self.assertFalse(
            payload['historico']['demonstrativo']
        )

        self.assertGreater(
            len(payload['historico']['meses']),
            3,
        )

        self.assertGreater(
            len(payload['historico']['carteira']),
            3,
        )

        self.assertGreater(
            len(payload['historico']['ibovespa']),
            3,
        )