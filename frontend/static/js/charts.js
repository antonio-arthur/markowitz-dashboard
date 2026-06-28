var Charts = {
    graficoPesosInstancia: null,
    
    renderizarFronteira: function(dadosFronteira, carteiraOtimizada) {
        
        var traceFronteira = {
            x: dadosFronteira.fronteira_eficiente.map(function(p) { return p.volatilidade; }),
            y: dadosFronteira.fronteira_eficiente.map(function(p) { return p.retorno; }),
            type: 'scatter',
            mode: 'lines',
            name: 'Fronteira Eficiente',
            line: { color: '#22c55e', width: 5 },
            hovertemplate: '<b>Fronteira Eficiente</b><br>Vol: %{x:.2%}<br>Ret: %{y:.2%}<extra></extra>'
        };
        
        var traceAtivos = {
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
        };
        
        var traceMinVar = null;
        if (carteiraOtimizada.min_variancia) {
            traceMinVar = {
                x: [carteiraOtimizada.min_variancia.volatilidade],
                y: [carteiraOtimizada.min_variancia.retorno],
                type: 'scatter',
                mode: 'markers+text',
                name: 'Minima Variancia',
                marker: { size: 18, color: '#facc15', symbol: 'circle', line: { color: '#eab308', width: 2 } },
                text: ['Min Variancia'],
                textposition: 'bottom right',
                textfont: { size: 9, color: '#ffffff', family: 'Inter' },
                hovertemplate: '<b>Minima Variancia</b><br>Vol: %{x:.2%}<br>Ret: %{y:.2%}<extra></extra>'
            };
        }
        
        var traceMaxSharpe = {
            x: [carteiraOtimizada.volatilidade],
            y: [carteiraOtimizada.retorno_esperado],
            type: 'scatter',
            mode: 'markers+text',
            name: 'Maximo Sharpe',
            marker: { size: 20, color: '#ef4444', symbol: 'circle', line: { color: '#ffffff', width: 3 } },
            text: ['Max Sharpe'],
            textposition: 'top left',
            textfont: { size: 9, color: '#ffffff', family: 'Inter' },
            hovertemplate: '<b>Maximo Sharpe</b><br>Vol: %{x:.2%}<br>Ret: %{y:.2%}<br>Sharpe: ' + (carteiraOtimizada.indice_sharpe || 0).toFixed(2) + '<extra></extra>'
        };
        
        var traces = [traceFronteira, traceAtivos, traceMaxSharpe];
        if (traceMinVar) { traces.splice(2, 0, traceMinVar); }
        
        var layout = {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#ffffff', family: 'Inter' },
            title: { text: '<b>Fronteira Eficiente de Markowitz</b><br><sub>Hipérbole de Markowitz | Otimização com scipy.optimize</sub>', font: { size: 14, color: '#ffffff' } },
            xaxis: { title: { text: '<b>Risco (Volatilidade Anual)</b>', font: { size: 12, color: '#ffffff' } }, tickformat: '.1%', tickfont: { color: '#ffffff' }, gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.2)', color: '#ffffff' },
            yaxis: { title: { text: '<b>Retorno Esperado (Anual)</b>', font: { size: 12, color: '#ffffff' } }, tickformat: '.1%', tickfont: { color: '#ffffff' }, gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.2)', color: '#ffffff' },
            hovermode: 'closest',
            margin: { t: 50, r: 20, b: 50, l: 60 },
            legend: { x: 0.01, y: 0.99, bgcolor: 'rgba(15, 23, 41, 0.95)', bordercolor: 'rgba(255,255,255,0.2)', font: { size: 11, color: '#ffffff' } },
            showlegend: true
        };
        
        Plotly.newPlot('graficoFronteira', traces, layout, { responsive: true, displayModeBar: true, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'], displaylogo: false });
    },
    
    // PIZZA - TUDO BRANCO (inclusive labels internos)
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
                            pointStyleWidth: 12,
                            color: '#ffffff',
                            font: { 
                                family: 'Inter', 
                                size: 12,
                                weight: '500'
                            },
                            generateLabels: function(chart) {
                                var data = chart.data;
                                var dataset = data.datasets[0];
                                var meta = chart.getDatasetMeta(0);
                                var total = dataset.data.reduce(function(a, b) { return a + b; }, 0);
                                
                                return data.labels.map(function(label, i) {
                                    var value = dataset.data[i];
                                    var pct = ((value / total) * 100).toFixed(1);
                                    return {
                                        text: label + '  ' + pct + '%',
                                        fillStyle: dataset.backgroundColor[i],
                                        strokeStyle: dataset.backgroundColor[i],
                                        lineWidth: 0,
                                        hidden: false,
                                        index: i,
                                        fontColor: '#ffffff'
                                    };
                                });
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 41, 0.98)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(255,255,255,0.3)',
                        borderWidth: 1,
                        padding: 15,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            label: function(context) {
                                return '  ' + context.label + ': ' + context.parsed.toFixed(2) + '%';
                            }
                        }
                    }
                }
            }
        });
    },
    
    // HEATMAP
    renderizarHeatmap: function(dadosCorrelacao) {
        var tickers = dadosCorrelacao.tickers;
        var matriz = dadosCorrelacao.matriz;
        var n = tickers.length;
        var zValues = [], textValues = [];
        var xLabels = tickers.map(function(t) { return t.replace('.SA', ''); });
        var yLabels = tickers.map(function(t) { return t.replace('.SA', ''); });
        
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
        
        var trace = {
            z: zValues, x: xLabels, y: yLabels, type: 'heatmap',
            zmin: -1, zmax: 1,
            colorscale: [[0.0, '#ef4444'],[0.25, '#f87171'],[0.5, '#e2e8f0'],[0.75, '#60a5fa'],[1.0, '#3b82f6']],
            showscale: true,
            colorbar: {
                title: { text: '<b>Correlação</b>', font: { color: '#ffffff', size: 11 } },
                tickfont: { color: '#ffffff', size: 10 },
                tickformat: '.1f',
                tickvals: [-1, -0.5, 0, 0.5, 1],
                ticktext: ['-1.0', '-0.5', '0.0', '0.5', '1.0'],
                bgcolor: 'rgba(15, 23, 41, 0.9)',
                bordercolor: 'rgba(255,255,255,0.2)'
            },
            text: textValues, texttemplate: '%{text}',
            textfont: { size: 11, family: 'JetBrains Mono', color: '#1e293b' },
            hovertemplate: '<b>%{x} × %{y}</b><br>Correlação: %{z:.4f}<extra></extra>'
        };
        
        Plotly.newPlot('heatmapCorrelacao', [trace], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#ffffff' },
            xaxis: { side: 'top', tickfont: { size: 10, family: 'JetBrains Mono', color: '#ffffff' }, color: '#ffffff' },
            yaxis: { tickfont: { size: 10, family: 'JetBrains Mono', color: '#ffffff' }, color: '#ffffff', autorange: 'reversed' },
            margin: { t: 50, r: 50, b: 30, l: 60 }
        }, { responsive: true, displayModeBar: false });
    },
    
    // HISTORICO
    renderizarHistorico: function(dadosHistoricos) {
        Plotly.newPlot('graficoHistorico', [
            { x: dadosHistoricos.meses, y: dadosHistoricos.carteira, type: 'scatter', mode: 'lines', name: 'Carteira', line: { color: '#3b82f6', width: 3 } },
            { x: dadosHistoricos.meses, y: dadosHistoricos.ibovespa, type: 'scatter', mode: 'lines', name: 'Ibovespa', line: { color: '#f59e0b', width: 2, dash: 'dash' } },
            { x: dadosHistoricos.meses, y: dadosHistoricos.cdi, type: 'scatter', mode: 'lines', name: 'CDI', line: { color: '#10b981', width: 2, dash: 'dot' } }
        ], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#ffffff' },
            xaxis: { gridcolor: 'rgba(255,255,255,0.1)', color: '#ffffff', tickfont: { color: '#ffffff' } },
            yaxis: { title: { text: 'Base 100', font: { color: '#ffffff' } }, gridcolor: 'rgba(255,255,255,0.1)', color: '#ffffff', tickfont: { color: '#ffffff' } },
            hovermode: 'x unified',
            margin: { t: 10, r: 20, b: 40, l: 50 },
            legend: { x: 0.01, y: 0.99, bgcolor: 'rgba(15,23,41,0.95)', bordercolor: 'rgba(255,255,255,0.2)', font: { size: 11, color: '#ffffff' } }
        }, { responsive: true, displayModeBar: true, displaylogo: false });
    }
};
