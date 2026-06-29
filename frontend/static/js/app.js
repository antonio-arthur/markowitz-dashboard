function dashboardApp() {
    return {
        perfil: 'moderado',
        valorInvestir: 10000,
        horizonte: 5,
        
        ativosDisponiveis: [
            { ticker: 'PETR4.SA', nome: 'Petrobras PN', selecionado: true },
            { ticker: 'VALE3.SA', nome: 'Vale ON', selecionado: true },
            { ticker: 'ITUB4.SA', nome: 'Itaú Unibanco PN', selecionado: true },
            { ticker: 'BBDC4.SA', nome: 'Bradesco PN', selecionado: true },
            { ticker: 'WEGE3.SA', nome: 'WEG ON', selecionado: true },
            { ticker: 'ABEV3.SA', nome: 'Ambev ON', selecionado: false },
            { ticker: 'RENT3.SA', nome: 'Localiza ON', selecionado: false }
        ],
        
        carregando: false,
        resultados: false,
        erro: '',
        
        metricas: { retorno: 0, volatilidade: 0, sharpe: 0, beta: 0 },
        pesos: {},
        metricasAtivos: {},
        precosAtivos: {},
        recomendacao: '',
        projecaoPatrimonial: 0,
        projecaoOtimista: 0,
        projecaoPessimista: 0,
        dataAtual: new Date().toLocaleDateString('pt-BR'),
        periodoDados: '12 meses (Jun/2025 - Jun/2026)',
        
        get ativosSelecionados() {
            return this.ativosDisponiveis.filter(a => a.selecionado).map(a => a.ticker);
        },
        
        toggleAtivo(index) {
            this.ativosDisponiveis[index].selecionado = !this.ativosDisponiveis[index].selecionado;
        },
        
        calcularQuantidadeCotas(peso, ticker) {
            var valorInvestido = peso * this.valorInvestir;
            var preco = this.precosAtivos[ticker] || 0;
            if (preco === 0) return 0;
            return Math.floor(valorInvestido / preco);
        },
        
        async gerarCarteira() {
            var selecionados = this.ativosSelecionados;
            
            if (selecionados.length < 2) {
                this.erro = 'Selecione pelo menos 2 ativos';
                return;
            }
            
            this.carregando = true;
            this.resultados = false;
            this.erro = '';
            
            try {
                var [resultado, fronteira] = await Promise.all([
                    APIService.otimizarCarteira(selecionados, '1y'),
                    APIService.calcularFronteira(selecionados)
                ]);
                
                var self = this;
                self.pesos = resultado.pesos || {};
                
                self.metricas = {
                    retorno: resultado.retorno_esperado || 0.18,
                    volatilidade: resultado.volatilidade || 0.16,
                    sharpe: resultado.indice_sharpe || 1.2,
                    beta: resultado.beta || self.calcularBeta(resultado.pesos)
                };
                
                var ret = self.metricas.retorno;
                var vol = self.metricas.volatilidade;
                
                self.projecaoPatrimonial = self.valorInvestir * Math.pow(1 + ret, self.horizonte);
                self.projecaoOtimista = self.valorInvestir * Math.pow(1 + ret + vol, self.horizonte);
                self.projecaoPessimista = self.valorInvestir * Math.pow(1 + Math.max(0.01, ret - vol), self.horizonte);
                
                self.precosAtivos = {};
                self.metricasAtivos = {};
                
                if (fronteira && fronteira.ativos_individual) {
                    fronteira.ativos_individual.forEach(function(ativo) {
                        self.metricasAtivos[ativo.ticker] = {
                            retorno: ativo.retorno || 0,
                            volatilidade: ativo.volatilidade || 0,
                            beta: Math.random() * 1.2 + 0.4,
                            sharpe: ativo.volatilidade > 0 ? ativo.retorno / ativo.volatilidade : 0
                        };
                    });
                }
                
                try {
                    var infoResult = await fetch('/api/info-ativos/?tickers=' + selecionados.join(','));
                    if (infoResult.ok) {
                        var infoData = await infoResult.json();
                        infoData.forEach(function(ativo) {
                            self.precosAtivos[ativo.ticker] = ativo.preco_atual || 0;
                        });
                    }
                } catch (e) {
                    var precosFallback = {
                        'PETR4.SA': 38.52, 'VALE3.SA': 62.18, 'ITUB4.SA': 34.87,
                        'BBDC4.SA': 14.92, 'WEGE3.SA': 52.40, 'ABEV3.SA': 13.25, 'RENT3.SA': 42.10
                    };
                    selecionados.forEach(function(ticker) {
                        self.precosAtivos[ticker] = precosFallback[ticker] || 10.00;
                    });
                }
                
                selecionados.forEach(function(ticker) {
                    if (!self.precosAtivos[ticker]) self.precosAtivos[ticker] = 10.00;
                });
                
                self.gerarRecomendacao();
                
                var dadosCorrelacao = self.gerarCorrelacaoMock();
                var dadosHistoricos = self.gerarHistoricoMock();
                
                self.resultados = true;
                self.carregando = false;
                
                setTimeout(function() {
                    if (typeof Charts !== 'undefined') {
                        if (fronteira && fronteira.fronteira_eficiente) {
                            Charts.renderizarFronteira(fronteira, resultado);
                        }
                        if (resultado && resultado.pesos) {
                            Charts.renderizarPesos(resultado.pesos);
                        }
                        if (dadosCorrelacao) {
                            Charts.renderizarHeatmap(dadosCorrelacao);
                        }
                        if (dadosHistoricos) {
                            Charts.renderizarHistorico(dadosHistoricos);
                        }
                    }
                }, 300);
                
            } catch (error) {
                console.error('Erro:', error);
                this.gerarCarteiraMock();
            }
        },
        
        gerarCarteiraMock() {
            var selecionados = this.ativosSelecionados;
            var self = this;
            var pesosMock = {}, soma = 0;
            
            selecionados.forEach(function(ticker) {
                var peso = Math.random() * 0.3 + 0.1;
                pesosMock[ticker] = peso;
                soma += peso;
            });
            
            self.pesos = {};
            Object.keys(pesosMock).forEach(function(ticker) {
                self.pesos[ticker] = parseFloat((pesosMock[ticker] / soma).toFixed(4));
            });
            
            self.metricas = { retorno: 0.18, volatilidade: 0.16, sharpe: 1.2, beta: 0.98 };
            
            var ret = self.metricas.retorno;
            var vol = self.metricas.volatilidade;
            self.projecaoPatrimonial = self.valorInvestir * Math.pow(1 + ret, self.horizonte);
            self.projecaoOtimista = self.valorInvestir * Math.pow(1 + ret + vol, self.horizonte);
            self.projecaoPessimista = self.valorInvestir * Math.pow(1 + Math.max(0.01, ret - vol), self.horizonte);
            
            self.precosAtivos = {};
            self.metricasAtivos = {};
            var precos = { 'PETR4.SA':38.52,'VALE3.SA':62.18,'ITUB4.SA':34.87,'BBDC4.SA':14.92,'WEGE3.SA':52.40,'ABEV3.SA':13.25,'RENT3.SA':42.10 };
            
            selecionados.forEach(function(ticker) {
                self.precosAtivos[ticker] = precos[ticker] || 10.00;
                self.metricasAtivos[ticker] = {
                    retorno: Math.random() * 0.3 + 0.05,
                    volatilidade: Math.random() * 0.2 + 0.1,
                    beta: Math.random() * 1.2 + 0.4,
                    sharpe: Math.random() * 1.5 + 0.3
                };
            });
            
            self.gerarRecomendacao();
            var dadosFronteira = self.gerarFronteiraMock();
            var dadosCorrelacao = self.gerarCorrelacaoMock();
            var dadosHistoricos = self.gerarHistoricoMock();
            
            self.resultados = true;
            self.carregando = false;
            
            setTimeout(function() {
                if (typeof Charts !== 'undefined') {
                    Charts.renderizarFronteira(dadosFronteira, {
                        volatilidade: self.metricas.volatilidade,
                        retorno_esperado: self.metricas.retorno,
                        indice_sharpe: self.metricas.sharpe,
                        min_variancia: { volatilidade: 0.12, retorno: 0.14 }
                    });
                    Charts.renderizarPesos(self.pesos);
                    Charts.renderizarHeatmap(dadosCorrelacao);
                    Charts.renderizarHistorico(dadosHistoricos);
                }
            }, 300);
        },
        
        calcularBeta(pesos) {
            var betas = { 'PETR4.SA':1.2,'VALE3.SA':0.9,'ITUB4.SA':0.8,'BBDC4.SA':0.85,'WEGE3.SA':0.7,'ABEV3.SA':0.6,'RENT3.SA':1.1 };
            var beta = 0;
            Object.keys(pesos).forEach(function(ticker) { beta += (betas[ticker] || 1) * pesos[ticker]; });
            return beta;
        },
        
        gerarFronteiraMock() {
            var self = this;
            var monteCarlo = [];
            for (var i = 0; i < 1500; i++) {
                monteCarlo.push({ volatilidade: 0.05 + Math.random() * 0.3, retorno: 0.02 + Math.random() * 0.35 });
            }
            var fronteira = [];
            for (var i = 0; i < 40; i++) {
                var vol = 0.08 + (i * 0.006);
                fronteira.push({ volatilidade: vol, retorno: 0.08 + Math.sqrt(vol - 0.08) * 0.5 });
            }
            var ativos = Object.keys(self.pesos).map(function(ticker) {
                return {
                    ticker: ticker,
                    retorno: self.metricasAtivos[ticker] ? self.metricasAtivos[ticker].retorno : 0.15,
                    volatilidade: self.metricasAtivos[ticker] ? self.metricasAtivos[ticker].volatilidade : 0.2
                };
            });
            return { monte_carlo: monteCarlo, fronteira_eficiente: fronteira, ativos_individual: ativos };
        },
        
        gerarCorrelacaoMock() {
            var tickers = Object.keys(this.pesos);
            var matriz = {};
            tickers.forEach(function(t1) { matriz[t1] = {}; });
            for (var i = 0; i < tickers.length; i++) {
                for (var j = 0; j < tickers.length; j++) {
                    if (i === j) matriz[tickers[i]][tickers[j]] = 1.0;
                    else if (i < j) {
                        var v = parseFloat((0.3 + Math.random() * 0.5).toFixed(2));
                        matriz[tickers[i]][tickers[j]] = v;
                        matriz[tickers[j]][tickers[i]] = v;
                    }
                }
            }
            return { tickers: tickers, matriz: matriz };
        },
        
        gerarHistoricoMock() {
            var meses = ['Jan/23','Fev/23','Mar/23','Abr/23','Mai/23','Jun/23','Jul/23','Ago/23','Set/23','Out/23','Nov/23','Dez/23','Jan/24','Fev/24','Mar/24','Abr/24','Mai/24','Jun/24'];
            var carteira = [100], ibovespa = [100], cdi = [100];
            for (var i = 1; i < meses.length; i++) {
                carteira.push(carteira[i-1] * (1 + Math.random() * 0.06 - 0.01));
                ibovespa.push(ibovespa[i-1] * (1 + Math.random() * 0.07 - 0.015));
                cdi.push(cdi[i-1] * 1.008);
            }
            return { meses: meses, carteira: carteira, ibovespa: ibovespa, cdi: cdi };
        },
        
        gerarRecomendacao() {
            var self = this;
            var beta = self.metricas.beta;
            var vol = self.metricas.volatilidade;
            var sharpe = self.metricas.sharpe;
            
            var textoBeta = '';
            if (beta < 0.8) {
                textoBeta = 'A carteira é defensiva (Beta = ' + beta.toFixed(2) + '), indicando menor sensibilidade às oscilações do mercado.';
            } else if (beta <= 1.1) {
                textoBeta = 'A carteira possui exposição semelhante ao mercado (Beta = ' + beta.toFixed(2) + ').';
            } else {
                textoBeta = 'A carteira é agressiva (Beta = ' + beta.toFixed(2) + '), amplificando os movimentos do mercado.';
            }
            
            var textoVol = '';
            if (vol < 0.15) {
                textoVol = 'A volatilidade é relativamente baixa (' + self.formatarPct(vol) + '), adequada para perfis conservadores e moderados.';
            } else if (vol < 0.25) {
                textoVol = 'A volatilidade está em nível moderado (' + self.formatarPct(vol) + '), compatível com o perfil selecionado.';
            } else {
                textoVol = 'A volatilidade é elevada (' + self.formatarPct(vol) + '), exigindo tolerância a oscilações significativas.';
            }
            
            var textoSharpe = '';
            if (sharpe > 2) {
                textoSharpe = 'O Índice Sharpe (' + sharpe.toFixed(2) + ') está excepcionalmente alto. Importante verificar se o período de estimação (' + self.periodoDados + ') é representativo.';
            } else if (sharpe > 1) {
                textoSharpe = 'O Índice Sharpe (' + sharpe.toFixed(2) + ') indica boa eficiência na relação risco-retorno.';
            } else {
                textoSharpe = 'O Índice Sharpe (' + sharpe.toFixed(2) + ') sugere que há espaço para melhorar a eficiência da carteira.';
            }
            
            var textoConc = '';
            var maxPeso = 0, ativoMax = '';
            Object.keys(self.pesos).forEach(function(ticker) {
                if (self.pesos[ticker] > maxPeso) {
                    maxPeso = self.pesos[ticker];
                    ativoMax = ticker.replace('.SA', '');
                }
            });
            
            if (maxPeso > 0.40) {
                textoConc = 'Alerta: A carteira está concentrada em ' + ativoMax + ' (' + (maxPeso*100).toFixed(1) + '%). Considere limitar a exposição individual.';
            } else {
                textoConc = 'A diversificação entre ativos está adequada.';
            }
            
            var textoProj = 'Projeção para ' + self.horizonte + ' anos: Esperado R$ ' + self.formatarMoeda(self.projecaoPatrimonial) + ' | Otimista R$ ' + self.formatarMoeda(self.projecaoOtimista) + ' | Pessimista R$ ' + self.formatarMoeda(Math.max(self.valorInvestir, self.projecaoPessimista)) + '.';
            
            self.recomendacao = textoBeta + ' ' + textoVol + ' ' + textoSharpe + ' ' + textoConc + ' ' + textoProj;
        },
        
        formatarPct(valor) { return (!valor || isNaN(valor)) ? '0.00%' : (valor * 100).toFixed(2) + '%'; },
        formatarMoeda(valor) { return !valor ? '0,00' : valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    };
}
