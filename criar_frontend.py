import os
from pathlib import Path

# Criar na pasta atual
base = Path("MARKOWITZ-DASHBOARD")

# Arquivos do frontend
arquivos = {
    "frontend/templates/index.html": """<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📊 Markowitz Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <script src="https://cdn.plot.ly/plotly-2.24.1.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body class="bg-gray-50 min-h-screen">
    <div x-data="dashboard" class="container mx-auto px-4 py-8 max-w-7xl">
        
        <!-- Cabeçalho -->
        <header class="text-center mb-10">
            <h1 class="text-4xl font-bold text-gray-800 mb-2">
                📊 Markowitz Dashboard
            </h1>
            <p class="text-lg text-gray-600">
                Otimização de Carteiras pelo Modelo de Markowitz
            </p>
        </header>

        <!-- Painel de Controle -->
        <div class="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 class="text-2xl font-semibold text-gray-700 mb-4">🎯 Configurar Otimização</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-600 mb-2">
                        📈 Tickers
                    </label>
                    <input type="text" 
                           x-model="tickersInput"
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                           placeholder="Ex: AAPL, MSFT, GOOGL">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-600 mb-2">
                        📅 Período
                    </label>
                    <select x-model="periodo" 
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                        <option value="1mo">1 Mês</option>
                        <option value="3mo">3 Meses</option>
                        <option value="6mo">6 Meses</option>
                        <option value="1y" selected>1 Ano</option>
                        <option value="2y">2 Anos</option>
                        <option value="5y">5 Anos</option>
                    </select>
                </div>
                
                <div class="flex items-end">
                    <button @click="otimizar()"
                            :disabled="carregando"
                            class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-6 rounded-lg transition duration-200">
                        🚀 Otimizar Carteira
                    </button>
                </div>
            </div>
        </div>

        <!-- Indicador de Carregamento -->
        <div x-show="carregando" class="text-center py-12">
            <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
            <p class="mt-4 text-gray-600">Calculando carteira ótima...</p>
        </div>

        <!-- Resultados -->
        <div x-show="resultados && !carregando" class="space-y-8">
            
            <!-- Cards de Métricas -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="bg-white rounded-xl shadow p-6">
                    <p class="text-sm text-gray-500 mb-1">Retorno Esperado</p>
                    <p class="text-3xl font-bold text-green-600" x-text="formatarPct(metricas.retorno)"></p>
                </div>
                
                <div class="bg-white rounded-xl shadow p-6">
                    <p class="text-sm text-gray-500 mb-1">Volatilidade</p>
                    <p class="text-3xl font-bold text-red-600" x-text="formatarPct(metricas.volatilidade)"></p>
                </div>
                
                <div class="bg-white rounded-xl shadow p-6">
                    <p class="text-sm text-gray-500 mb-1">Índice Sharpe</p>
                    <p class="text-3xl font-bold text-blue-600" x-text="metricas.sharpe.toFixed(2)"></p>
                </div>
                
                <div class="bg-white rounded-xl shadow p-6">
                    <p class="text-sm text-gray-500 mb-1">Ativos na Carteira</p>
                    <p class="text-3xl font-bold text-purple-600" x-text="Object.keys(pesos).length"></p>
                </div>
            </div>

            <!-- Gráficos -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="bg-white rounded-xl shadow p-6">
                    <h3 class="text-xl font-semibold text-gray-700 mb-4">📈 Fronteira Eficiente</h3>
                    <div id="graficoFronteira" style="height: 400px;"></div>
                </div>
                
                <div class="bg-white rounded-xl shadow p-6">
                    <h3 class="text-xl font-semibold text-gray-700 mb-4">🍩 Alocação da Carteira</h3>
                    <canvas id="graficoPesos"></canvas>
                </div>
            </div>

            <!-- Tabela de Alocação -->
            <div class="bg-white rounded-xl shadow p-6">
                <h3 class="text-xl font-semibold text-gray-700 mb-4">📋 Alocação Detalhada</h3>
                
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ativo</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Peso</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alocação</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            <template x-for="(peso, ticker) in pesos" :key="ticker">
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 font-medium text-gray-800" x-text="ticker"></td>
                                    <td class="px-6 py-4 text-gray-600" x-text="peso.toFixed(4)"></td>
                                    <td class="px-6 py-4">
                                        <div class="flex items-center gap-2">
                                            <div class="w-full max-w-xs bg-gray-200 rounded-full h-2.5">
                                                <div class="bg-blue-600 h-2.5 rounded-full transition-all" 
                                                     :style="'width: ' + (peso * 100) + '%'"></div>
                                            </div>
                                            <span class="text-sm text-gray-600" x-text="(peso * 100).toFixed(1) + '%'"></span>
                                        </div>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Estado Inicial -->
        <div x-show="!resultados && !carregando" class="text-center py-12">
            <div class="text-6xl mb-4">📊</div>
            <p class="text-xl text-gray-600">Selecione os ativos e clique em "Otimizar Carteira"</p>
            <p class="text-sm text-gray-400 mt-2">Exemplo: AAPL, MSFT, GOOGL, AMZN, META</p>
        </div>

    </div>

    <script src="/static/js/api.js"></script>
    <script src="/static/js/charts.js"></script>
    <script src="/static/js/app.js"></script>
</body>
</html>
""",

    "frontend/static/css/styles.css": """/* Estilos personalizados */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* Animações suaves */
.fade-in {
    animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
    from { 
        opacity: 0; 
        transform: translateY(10px); 
    }
    to { 
        opacity: 1; 
        transform: translateY(0); 
    }
}

/* Custom scrollbar */
::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #555;
}

/* Responsividade */
@media (max-width: 768px) {
    .container {
        padding-left: 1rem;
        padding-right: 1rem;
    }
    
    table {
        font-size: 0.875rem;
    }
}
""",

    "frontend/static/js/api.js": """// API Service - Comunicação com o backend
const API_BASE = '/api';

const APIService = {
    async otimizarCarteira(tickers, periodo) {
        const response = await fetch(`${API_BASE}/otimizar-carteira/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers, periodo })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.erro || 'Erro na otimização');
        }
        
        return await response.json();
    },
    
    async calcularFronteira(tickers) {
        const response = await fetch(`${API_BASE}/fronteira-eficiente/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.erro || 'Erro na fronteira');
        }
        
        return await response.json();
    }
};
""",

    "frontend/static/js/charts.js": """// Charts Service - Renderização dos gráficos
const Charts = {
    graficoPesosInstancia: null,
    
    renderizarFronteira(dadosFronteira, carteiraOtimizada) {
        const tracoFronteira = {
            x: dadosFronteira.fronteira_eficiente.map(p => p.volatilidade),
            y: dadosFronteira.fronteira_eficiente.map(p => p.retorno),
            type: 'scatter',
            mode: 'lines',
            name: 'Fronteira Eficiente',
            line: { color: '#3B82F6', width: 3 }
        };
        
        const ativos = {
            x: dadosFronteira.ativos_individual.map(a => a.volatilidade),
            y: dadosFronteira.ativos_individual.map(a => a.retorno),
            type: 'scatter',
            mode: 'markers+text',
            name: 'Ativos',
            marker: { size: 14, color: '#10B981' },
            text: dadosFronteira.ativos_individual.map(a => a.ticker),
            textposition: 'top center',
            textfont: { size: 10 }
        };
        
        const carteiraOtima = {
            x: [carteiraOtimizada.volatilidade],
            y: [carteiraOtimizada.retorno_esperado],
            type: 'scatter',
            mode: 'markers',
            name: 'Carteira Ótima',
            marker: { 
                size: 18, 
                color: '#EF4444',
                symbol: 'star',
                line: { color: '#DC2626', width: 2 }
            }
        };
        
        const layout = {
            xaxis: { 
                title: 'Risco (Volatilidade)',
                tickformat: '.1%',
                gridcolor: '#E5E7EB'
            },
            yaxis: { 
                title: 'Retorno Esperado',
                tickformat: '.1%',
                gridcolor: '#E5E7EB'
            },
            paper_bgcolor: 'white',
            plot_bgcolor: 'white',
            hovermode: 'closest',
            margin: { t: 20, r: 20, b: 50, l: 60 },
            legend: { x: 0, y: 1.1, orientation: 'h' }
        };
        
        Plotly.newPlot('graficoFronteira', 
            [tracoFronteira, ativos, carteiraOtima], 
            layout,
            { responsive: true, displayModeBar: false }
        );
    },
    
    renderizarPesos(pesos) {
        const ctx = document.getElementById('graficoPesos').getContext('2d');
        
        if (this.graficoPesosInstancia) {
            this.graficoPesosInstancia.destroy();
        }
        
        const cores = [
            '#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6',
            '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
        ];
        
        this.graficoPesosInstancia = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(pesos),
                datasets: [{
                    data: Object.values(pesos).map(p => p * 100),
                    backgroundColor: cores.slice(0, Object.keys(pesos).length),
                    borderWidth: 2,
                    borderColor: 'white'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + context.parsed.toFixed(2) + '%';
                            }
                        }
                    }
                }
            }
        });
    }
};
""",

    "frontend/static/js/app.js": """// App Principal - Lógica Alpine.js
function dashboard() {
    return {
        tickersInput: 'AAPL,MSFT,GOOGL,AMZN,META',
        periodo: '1y',
        carregando: false,
        resultados: false,
        metricas: { retorno: 0, volatilidade: 0, sharpe: 0 },
        pesos: {},
        
        async otimizar() {
            if (!this.tickersInput.trim()) {
                alert('Por favor, insira pelo menos um ticker');
                return;
            }
            
            this.carregando = true;
            this.resultados = false;
            
            const tickers = this.tickersInput
                .split(',')
                .map(t => t.trim().toUpperCase())
                .filter(t => t);
            
            try {
                // Buscar dados em paralelo
                const [resultado, fronteira] = await Promise.all([
                    APIService.otimizarCarteira(tickers, this.periodo),
                    APIService.calcularFronteira(tickers)
                ]);
                
                this.metricas = {
                    retorno: resultado.retorno_esperado,
                    volatilidade: resultado.volatilidade,
                    sharpe: resultado.indice_sharpe
                };
                
                this.pesos = resultado.pesos;
                this.resultados = true;
                
                // Aguardar o DOM atualizar antes de renderizar gráficos
                this.$nextTick(() => {
                    Charts.renderizarFronteira(fronteira, resultado);
                    Charts.renderizarPesos(resultado.pesos);
                });
                
            } catch (error) {
                alert('Erro: ' + error.message);
                console.error(error);
            } finally {
                this.carregando = false;
            }
        },
        
        formatarPct(valor) {
            return (valor * 100).toFixed(2) + '%';
        }
    };
}
""",
}

# Criar todos os arquivos
print("📁 Criando frontend...\n")
criados = 0

for caminho, conteudo in arquivos.items():
    destino = base / caminho
    destino.parent.mkdir(parents=True, exist_ok=True)
    
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(conteudo)
    
    criados += 1
    print(f"✅ {caminho}")

print(f"\n{'='*60}")
print(f"✅ {criados} arquivos criados com sucesso!")
print(f"{'='*60}")
print("""
🚀 Agora execute:

  cd MARKOWITZ-DASHBOARD/backend
  python manage.py runserver
  
  E acesse: http://127.0.0.1:8000/
  
""")