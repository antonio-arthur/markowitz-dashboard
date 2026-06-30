var Charts = {
    graficoPesosInstancia: null,
    
    renderizarFronteira: function(dadosFronteira, carteiraOtimizada) {
        
        var traces = [];
        
        // 1. Conjunto viavel - Monte Carlo (area cinza mais visivel)
        if (dadosFronteira.carteiras_simuladas && dadosFronteira.carteiras_simuladas.length > 0) {
            traces.push({
                x: dadosFronteira.carteiras_simuladas.map(function(c) { return c.volatilidade; }),
                y: dadosFronteira.carteiras_simuladas.map(function(c) { return c.retorno; }),
                type: 'scatter',
                mode: 'markers',
                name: 'Carteiras Simuladas',
                marker: {
                    size: 4,
                    color: '#94a3b8',
                    opacity: 0.35
                },
                hovertemplate: 'Vol: %{x:.2%}<br>Ret: %{y:.2%}<extra></extra>'
            });
        }
        
        // 2. Fronteira Eficiente - linha verde com marcadores
        traces.push({
            x: dadosFronteira.fronteira_eficiente.map(function(p) { return p.volatilidade; }),
            y: dadosFronteira.fronteira_eficiente.map(function(p) { return p.retorno; }),
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Fronteira Eficiente',
            line: { color: '#22c55e', width: 4 },
            marker: { size: 3, color: '#22c55e' },
            hovertemplate: '<b>Fronteira</b><br>Vol: %{x:.2%}<br>Ret: %{y:.2%}<extra></extra>'
        });
        
        // 3. Minima Variancia
        if (carteiraOtimizada.min_variancia) {
            traces.push({
                x: [carteiraOtimizada.min_variancia.volatilidade],
                y: [carteiraOtimizada.min_variancia.retorno],
                type: 'scatter',
                mode: 'markers+text',
                name: 'Minima Variancia',
                marker: { size: 18, color: '#facc15', symbol: 'circle', line: { color: '#eab308', width: 2 } },
                text: ['Min Var'],
                textposition: 'bottom right',
                textfont: { size: 9, color: '#ffffff', family: 'Inter' },
                hovertemplate: '<b>Minima Variancia</b><br>Vol: %{x:.2%}<br>Ret: %{y:.2%}<extra></extra>'
            });
        }
        
        // 4. Maximo Sharpe - bola vermelha
        traces.push({
            x: [carteiraOtimizada.volatilidade],
            y: [carteiraOtimizada.retorno_esperado],
            type: 'scatter',
            mode: 'markers+text',
            name: 'Maximo Sharpe',
            marker: { size: 20, color: '#ef4444', symbol: 'circle', line: { color: '#ffffff', width: 3 } },
            text: ['Max Sharpe'],
            textposition: 'top left',
            textfont: { size: 9, color: '#ffffff', family: 'Inter' },
            hovertemplate: '<b>Maximo Sharpe</b><br>Vol: %{x:.2%}<br>Ret: %{y:.2%}<extra></extra>'
        });
        
        // 5. Ativos Individuais
        traces.push({
            x: dadosFronteira.ativos_individual.map(function(a) { return a.volatilidade; }),
            y: dadosFronteira.ativos_individual.map(function(a) { return a.retorno; }),
            type: 'scatter',
            mode: 'markers+text',
            name: 'Ativos',
            marker: { size: 10, color: '#10b981', symbol: 'circle', line: { color: '#059669', width: 1 } },
            text: dadosFronteira.ativos_individual.map(function(a) { return a.ticker.replace('.SA', ''); }),
            textposition: 'top center',
            textfont: { size: 10, color: '#ffffff', family: 'JetBrains Mono' },
            hovertemplate: '<b>%{text}</b><br>Vol: %{x:.2%}<br>Ret: %{y:.2%}<extra></extra>'
        });
        
        var layout = {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#ffffff', family: 'Inter' },
            title: { text: '<b>Conjunto Viavel e Fronteira Eficiente</b><br><sub>30.000 carteiras simuladas | Markowitz</sub>', font: { size: 14, color: '#ffffff' } },
            xaxis: { title: { text: '<b>Risco (Volatilidade Anual)</b>', font: { size: 12, color: '#ffffff' } }, tickformat: '.1%', tickfont: { color: '#ffffff' }, gridcolor: 'rgba(255,255,255,0.1)', color: '#ffffff' },
            yaxis: { title: { text: '<b>Retorno Esperado (Anual)</b>', font: { size: 12, color: '#ffffff' } }, tickformat: '.1%', tickfont: { color: '#ffffff' }, gridcolor: 'rgba(255,255,255,0.1)', color: '#ffffff' },
            hovermode: 'closest',
            margin: { t: 50, r: 20, b: 50, l: 60 },
            legend: { x: 0.01, y: 0.99, bgcolor: 'rgba(15, 23, 41, 0.95)', bordercolor: 'rgba(255,255,255,0.2)', font: { size: 11, color: '#ffffff' } },
            showlegend: true
        };
        
        Plotly.newPlot('graficoFronteira', traces, layout, { responsive: true, displayModeBar: true, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'], displaylogo: false });
    },
    
    renderizarPesos: function(pesos) {
        var ctx = document.getElementById('graficoPesos');
        if (!ctx) return;
        var context = ctx.getContext('2d');
        if (this.graficoPesosInstancia) this.graficoPesosInstancia.destroy();
        
        var tickers = Object.keys(pesos);
        var valores = tickers.map(function(t) { return parseFloat((pesos[t] * 100).toFixed(2)); });
        var cores = ['#3b82f6','#10b981','#ef4444','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'];
        
        this.graficoPesosInstancia = new Chart(context, {
            type: 'doughnut',
            data: {
                labels: tickers.map(function(t) { return t.replace('.SA', ''); }),
                datasets: [{
                    data: valores,
                    backgroundColor: cores.slice(0, tickers.length),
                    borderWidth: 3,
                    borderColor: '#1a1f3a'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            usePointStyle: true,
                            color: '#ffffff',
                            font: { family: 'Inter', size: 12, weight: '500' },
                            generateLabels: function(chart) {
                                return chart.data.labels.map(function(label, i) {
                                    return {
                                        text: label + '  ' + chart.data.datasets[0].data[i].toFixed(1) + '%',
                                        fillStyle: chart.data.datasets[0].backgroundColor[i],
                                        strokeStyle: chart.data.datasets[0].backgroundColor[i],
                                        lineWidth: 0,
                                        index: i
                                    };
                                });
                            }
                        }
                    }
                }
            }
        });
    },
    
    renderizarHeatmap: function(dadosCorrelacao) {
        var tickers = dadosCorrelacao.tickers;
        var matriz = dadosCorrelacao.matriz;
        var n = tickers.length;
        var zValues = [], textValues = [];
        
        for (var i = 0; i < n; i++) {
            var linhaZ = [], linhaT = [];
            for (var j = 0; j < n; j++) {
                var valor = matriz[tickers[i]][tickers[j]];
                linhaZ.push(valor);
                linhaT.push(valor.toFixed(2));
            }
            zValues.push(linhaZ);
            textValues.push(linhaT);
        }
        
        Plotly.newPlot('heatmapCorrelacao', [{
            z: zValues,
            x: tickers.map(function(t) { return t.replace('.SA', ''); }),
            y: tickers.map(function(t) { return t.replace('.SA', ''); }),
            type: 'heatmap',
            zmin: -1, zmax: 1,
            colorscale: [[0,'#ef4444'],[0.25,'#f87171'],[0.5,'#e2e8f0'],[0.75,'#60a5fa'],[1,'#3b82f6']],
            showscale: true,
            colorbar: { title: { text: 'Correlacao', font: { color: '#ffffff' } }, tickfont: { color: '#ffffff' }, tickformat: '.1f' },
            text: textValues, texttemplate: '%{text}',
            textfont: { size: 11, family: 'JetBrains Mono', color: '#1e293b' },
            hovertemplate: '%{x} x %{y}<br>Correlacao: %{z:.2f}<extra></extra>'
        }], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: { side: 'top', tickfont: { color: '#ffffff' }, color: '#ffffff' },
            yaxis: { tickfont: { color: '#ffffff' }, color: '#ffffff', autorange: 'reversed' },
            margin: { t: 50, r: 50, b: 30, l: 60 }
        }, { responsive: true, displayModeBar: false });
    },
    
    renderizarHistorico: function(dadosHistoricos) {
        Plotly.newPlot('graficoHistorico', [
            { x: dadosHistoricos.meses, y: dadosHistoricos.carteira, type: 'scatter', mode: 'lines', name: 'Carteira', line: { color: '#3b82f6', width: 3 } },
            { x: dadosHistoricos.meses, y: dadosHistoricos.ibovespa, type: 'scatter', mode: 'lines', name: 'Ibovespa', line: { color: '#f59e0b', width: 2, dash: 'dash' } },
            { x: dadosHistoricos.meses, y: dadosHistoricos.cdi, type: 'scatter', mode: 'lines', name: 'CDI', line: { color: '#10b981', width: 2, dash: 'dot' } }
        ], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: { gridcolor: 'rgba(255,255,255,0.1)', color: '#ffffff', tickfont: { color: '#ffffff' } },
            yaxis: { title: { text: 'Base 100', font: { color: '#ffffff' } }, gridcolor: 'rgba(255,255,255,0.1)', color: '#ffffff', tickfont: { color: '#ffffff' } },
            hovermode: 'x unified',
            margin: { t: 10, r: 20, b: 40, l: 50 },
            legend: { x: 0.01, y: 0.99, bgcolor: 'rgba(15,23,41,0.95)', bordercolor: 'rgba(255,255,255,0.2)', font: { size: 11, color: '#ffffff' } }
        }, { responsive: true, displayModeBar: true, displaylogo: false });
    }
};
