function dashboardApp() {
    return {
        // =====================================================
        // CONFIGURAÇÕES DO USUÁRIO
        // =====================================================

        perfil: 'moderado',
        valorInvestir: 10000,
        horizonte: 5,

        periodoAnalise: '1y',
        periodoDados: 'Últimos 12 meses',

        taxaLivreRisco: 0.1425,
        benchmark: '^BVSP',
        estrategia: '',

        // =====================================================
        // ATIVOS DISPONÍVEIS
        // =====================================================

        ativosDisponiveis: [],
        buscaAtivo: '',
        sugestoesAcoes: [],
        carregandoCatalogo: false,

        // =====================================================
        // ESTADO DA INTERFACE
        // =====================================================

        carregando: false,
        resultados: false,
        erro: '',

        dataAtual: new Date().toLocaleDateString(
            'pt-BR'
        ),

        // =====================================================
        // RESULTADOS
        // =====================================================

        metricas: {
            retorno: 0,
            volatilidade: 0,
            sharpe: 0,
            beta: null
        },

        pesos: {},
        metricasAtivos: {},
        precosAtivos: {},

        matrizCorrelacao: {},
        tickersCorrelacao: [],

        historico: null,

        recomendacao: '',

        projecaoPatrimonial: 0,
        projecaoOtimista: 0,
        projecaoPessimista: 0,

        // =====================================================
        // PROPRIEDADES CALCULADAS
        // =====================================================

        get ativosVisiveis() {
            var vistos = new Set();

            return (this.ativosDisponiveis || []).filter(function (ativo) {
                var ticker = (ativo && ativo.ticker) || '';
                var chave = ticker.toUpperCase();

                if (!ticker || vistos.has(chave)) {
                    return false;
                }

                vistos.add(chave);
                return true;
            });
        },

        get ativosSelecionados() {
            return this.ativosDisponiveis
                .filter(function (ativo) {
                    return ativo.selecionado;
                })
                .map(function (ativo) {
                    return ativo.ticker;
                });
        },

        get totalEfetivamenteInvestido() {
            var total = 0;
            var self = this;

            Object.keys(
                this.pesos || {}
            ).forEach(function (ticker) {
                total += self.calcularValorEfetivo(
                    self.pesos[ticker],
                    ticker
                );
            });

            return total;
        },

        get saldoCaixa() {
            var valorDisponivel =
                Number(this.valorInvestir) || 0;

            return Math.max(
                0,
                valorDisponivel -
                this.totalEfetivamenteInvestido
            );
        },

        // =====================================================
        // CONTROLE DOS ATIVOS
        // =====================================================

        toggleAtivo(index) {
            var ativosVisiveis = this.ativosVisiveis || [];

            if (
                index < 0 ||
                index >= ativosVisiveis.length
            ) {
                return;
            }

            var ativo = ativosVisiveis[index];
            var alvo = (this.ativosDisponiveis || []).find(function (item) {
                return item && item.ticker === ativo.ticker;
            });

            if (!alvo) {
                return;
            }

            alvo.selecionado = !alvo.selecionado;
        },

        normalizarAtivos(lista) {
            var resultado = [];
            var vistos = new Set();

            (lista || []).forEach(function (ativo) {
                var ticker = (
                    ativo && ativo.ticker
                ) || '';

                if (!ticker) {
                    return;
                }

                var chave = ticker.toUpperCase();

                if (vistos.has(chave)) {
                    return;
                }

                vistos.add(chave);

                resultado.push({
                    ticker: ticker,
                    nome: ativo.nome || ticker,
                    selecionado: Boolean(ativo.selecionado)
                });
            });

            return resultado;
        },

        async buscarAcoes() {
            var termo = (this.buscaAtivo || '').trim();

            if (!termo) {
                this.sugestoesAcoes = [];
                return;
            }

            this.carregandoCatalogo = true;

            try {
                var resposta = await fetch(
                    '/api/acoes/?busca=' +
                    encodeURIComponent(termo) +
                    '&limite=8'
                );

                if (!resposta.ok) {
                    throw new Error('Falha ao carregar o catálogo');
                }

                var dados = await resposta.json();
                var listaAcoes = Array.isArray(dados)
                    ? dados
                    : (dados && Array.isArray(dados.resultados)
                        ? dados.resultados
                        : []);
                var self = this;

                this.sugestoesAcoes = listaAcoes.map(function (acao) {
                    var jaAdicionado = (self.ativosDisponiveis || []).some(function (item) {
                        return item && item.ticker === acao.ticker;
                    });

                    return {
                        ticker: acao.ticker,
                        codigo: acao.codigo,
                        nome: acao.nome,
                        classe: acao.classe,
                        jaAdicionado: jaAdicionado,
                        texto: acao.codigo + ' — ' + acao.nome + ' — ' + acao.classe,
                    };
                });
                this.erro = '';
            } catch (error) {
                this.sugestoesAcoes = [];
                this.erro = 'Não foi possível buscar ações no catálogo da B3.';
            } finally {
                this.carregandoCatalogo = false;
            }
        },

        selecionarSugestao(acao) {
            var jaExiste = (this.ativosDisponiveis || []).some(function (item) {
                return item && item.ticker === acao.ticker;
            });

            if (!jaExiste) {
                if ((this.ativosDisponiveis || []).length >= 15) {
                    this.erro = 'Selecione no máximo 15 ações.';
                    this.sugestoesAcoes = [];
                    return;
                }

                this.ativosDisponiveis = this.normalizarAtivos(
                    (this.ativosDisponiveis || []).concat([{
                        ticker: acao.ticker,
                        nome: acao.nome + ' — ' + acao.classe,
                        selecionado: true
                    }])
                );
            } else {
                var alvo = (this.ativosDisponiveis || []).find(function (item) {
                    return item && item.ticker === acao.ticker;
                });

                if (alvo) {
                    alvo.selecionado = true;
                }
            }

            this.erro = '';
            this.buscaAtivo = '';
            this.sugestoesAcoes = [];
        },

        carregarAcoesIniciais() {
            this.ativosDisponiveis = [];
            this.buscaAtivo = '';
            this.sugestoesAcoes = [];
        },

        init() {
            this.carregarAcoesIniciais();
        },

        // =====================================================
        // DESCRIÇÕES
        // =====================================================

        descricaoPeriodo(periodo) {
            var periodos = {
                '1mo': 'Último mês',
                '3mo': 'Últimos 3 meses',
                '6mo': 'Últimos 6 meses',
                '1y': 'Últimos 12 meses',
                '2y': 'Últimos 2 anos',
                '5y': 'Últimos 5 anos',
                '10y': 'Últimos 10 anos',
                'ytd': 'Ano atual',
                'max': 'Período máximo disponível'
            };

            return (
                periodos[periodo] ||
                periodo
            );
        },

        descricaoPerfil(perfil) {
            var perfis = {
                conservador: 'Conservador',
                moderado: 'Moderado',
                arrojado: 'Arrojado'
            };

            return (
                perfis[perfil] ||
                'Moderado'
            );
        },

        // =====================================================
        // PREÇOS E QUANTIDADES
        // =====================================================

        obterPrecoAtivo(ticker) {
            var preco = Number(
                this.precosAtivos[ticker]
            );

            if (
                !Number.isFinite(preco) ||
                preco <= 0
            ) {
                return 0;
            }

            return preco;
        },

        formatarPrecoAtivo(ticker) {
            var preco =
                this.obterPrecoAtivo(ticker);

            if (preco <= 0) {
                return 'Indisponível';
            }

            return (
                'R$ ' +
                this.formatarMoeda(preco)
            );
        },

        calcularValorAlvo(peso) {
            var pesoNumerico =
                Number(peso) || 0;

            var valorDisponivel =
                Number(this.valorInvestir) || 0;

            return (
                pesoNumerico *
                valorDisponivel
            );
        },

        calcularQuantidadeCotas(
            peso,
            ticker
        ) {
            var valorAlvo =
                this.calcularValorAlvo(peso);

            var preco =
                this.obterPrecoAtivo(ticker);

            if (
                valorAlvo <= 0 ||
                preco <= 0
            ) {
                return 0;
            }

            return Math.floor(
                valorAlvo / preco
            );
        },

        calcularValorEfetivo(
            peso,
            ticker
        ) {
            var quantidade =
                this.calcularQuantidadeCotas(
                    peso,
                    ticker
                );

            var preco =
                this.obterPrecoAtivo(ticker);

            return (
                quantidade *
                preco
            );
        },

        calcularSaldoAtivo(
            peso,
            ticker
        ) {
            var valorAlvo =
                this.calcularValorAlvo(peso);

            var valorEfetivo =
                this.calcularValorEfetivo(
                    peso,
                    ticker
                );

            return Math.max(
                0,
                valorAlvo -
                valorEfetivo
            );
        },

        // =====================================================
        // GERAÇÃO DA CARTEIRA
        // =====================================================

        async gerarCarteira() {
            var selecionados =
                this.ativosSelecionados.slice();

            var periodo =
                this.periodoAnalise || '1y';

            var perfilAtual =
                this.perfil || 'moderado';

            if (selecionados.length < 2) {
                this.erro =
                    'Selecione pelo menos dois ativos.';

                this.resultados = false;
                return;
            }

            if (
                !Number.isFinite(
                    Number(this.valorInvestir)
                ) ||
                Number(this.valorInvestir) <= 0
            ) {
                this.erro =
                    'Informe um valor de investimento maior que zero.';

                this.resultados = false;
                return;
            }

            if (
                !Number.isFinite(
                    Number(this.horizonte)
                ) ||
                Number(this.horizonte) <= 0
            ) {
                this.erro =
                    'Informe um horizonte válido.';

                this.resultados = false;
                return;
            }

            this.carregando = true;
            this.resultados = false;
            this.erro = '';

            this.periodoDados =
                this.descricaoPeriodo(
                    periodo
                );

            this.estrategia = '';
            this.precosAtivos = {};
            this.metricasAtivos = {};
            this.matrizCorrelacao = {};
            this.tickersCorrelacao = [];
            this.historico = null;

            selecionados.forEach(
                (ticker) => {
                    this.precosAtivos[
                        ticker
                    ] = 0;
                }
            );

            try {
                var analise =
                    await APIService.analisarCarteira(
                        selecionados,
                        periodo,
                        perfilAtual
                    );

                this.validarResultadoAnalise(
                    analise
                );

                this.processarMetricasCarteira(
                    analise.carteira || analise,
                    selecionados
                );

                this.processarMetricasAtivos(
                    analise,
                    selecionados
                );

                this.processarCorrelacaoReal(
                    analise,
                    selecionados
                );

                this.calcularProjecoes();

                this.precosAtivos =
                    analise.precos &&
                    typeof analise.precos === 'object'
                        ? analise.precos
                        : {};

                this.processarHistorico(
                    analise
                );

                this.gerarRecomendacao();

                var dadosCorrelacao = {
                    tickers:
                        this.tickersCorrelacao,

                    matriz:
                        this.matrizCorrelacao
                };

                var dadosHistoricos =
                    this.historico;

                this.resultados = true;
                this.carregando = false;

                /*
                 * Aguarda o Alpine criar os elementos
                 * antes de renderizar os gráficos.
                 */
                setTimeout(() => {
                    this.renderizarGraficos(
                        analise.carteira || analise,
                        analise,
                        dadosCorrelacao,
                        dadosHistoricos
                    );
                }, 350);
            } catch (error) {
                console.error(
                    'Erro ao gerar carteira:',
                    error
                );

                this.erro =
                    error &&
                    error.message
                        ? error.message
                        : 'Não foi possível calcular a carteira.';

                this.carregando = false;
                this.resultados = false;
            }
        },

        // =====================================================
        // VALIDAÇÕES
        // =====================================================

        validarResultadoAnalise(
            resultado
        ) {
            if (
                !resultado ||
                typeof resultado !== 'object'
            ) {
                throw new Error(
                    'A API retornou uma resposta inválida.'
                );
            }

            if (
                resultado.sucesso === false
            ) {
                throw new Error(
                    resultado.erro ||
                    'A análise não foi concluída.'
                );
            }

            if (
                !resultado.carteira ||
                typeof resultado.carteira !== 'object'
            ) {
                throw new Error(
                    'A API não retornou a carteira analisada.'
                );
            }

            var retorno = Number(
                resultado.carteira.retorno_esperado
            );

            var volatilidade = Number(
                resultado.carteira.volatilidade
            );

            var sharpe = Number(
                resultado.carteira.indice_sharpe
            );

            if (!Number.isFinite(retorno)) {
                throw new Error(
                    'O retorno retornado pela API é inválido.'
                );
            }

            if (
                !Number.isFinite(volatilidade) ||
                volatilidade < 0
            ) {
                throw new Error(
                    'A volatilidade retornada pela API é inválida.'
                );
            }

            if (!Number.isFinite(sharpe)) {
                throw new Error(
                    'O Índice de Sharpe retornado pela API é inválido.'
                );
            }

            if (resultado.taxa_livre_risco !== undefined) {
                this.taxaLivreRisco = Number(resultado.taxa_livre_risco) || this.taxaLivreRisco;
            }
        },

        // =====================================================
        // PROCESSAMENTO DA CARTEIRA
        // =====================================================

        processarMetricasCarteira(
            resultado,
            selecionados
        ) {
            var pesosProcessados = {};

            selecionados.forEach(
                function (ticker) {
                    var peso = 0;

                    if (
                        resultado &&
                        resultado.pesos &&
                        resultado.pesos[
                            ticker
                        ] !== undefined &&
                        resultado.pesos[
                            ticker
                        ] !== null
                    ) {
                        peso = Number(
                            resultado.pesos[
                                ticker
                            ]
                        );
                    }

                    if (
                        !Number.isFinite(peso) ||
                        peso < 0.000001
                    ) {
                        peso = 0;
                    }

                    pesosProcessados[
                        ticker
                    ] = peso;
                }
            );

            this.pesos =
                pesosProcessados;

            /*
             * Evita que null seja convertido
             * incorretamente para zero.
             */
            var betaReal =
                resultado.beta === null ||
                resultado.beta === undefined
                    ? null
                    : Number(resultado.beta);

            this.metricas = {
                retorno:
                    Number(
                        resultado.retorno_esperado
                    ) || 0,

                volatilidade:
                    Number(
                        resultado.volatilidade
                    ) || 0,

                sharpe:
                    Number(
                        resultado.indice_sharpe
                    ) || 0,

                beta:
                    betaReal !== null &&
                    Number.isFinite(betaReal)
                        ? betaReal
                        : null
            };

            this.benchmark =
                resultado.benchmark ||
                '^BVSP';

            this.estrategia =
                resultado.estrategia ||
                '';

            /*
             * Usa o perfil confirmado pelo backend.
             */
            if (
                resultado.perfil &&
                [
                    'conservador',
                    'moderado',
                    'arrojado'
                ].includes(resultado.perfil)
            ) {
                this.perfil =
                    resultado.perfil;
            }
        },

        // =====================================================
        // MÉTRICAS DOS ATIVOS
        // =====================================================

        processarMetricasAtivos(
            fronteira,
            selecionados
        ) {
            this.metricasAtivos = {};

            var ativos =
                Array.isArray(
                    fronteira &&
                    fronteira.ativos_individual
                )
                    ? fronteira.ativos_individual
                    : (
                        Array.isArray(
                            fronteira &&
                            fronteira.ativos
                        )
                            ? fronteira.ativos
                            : []
                    );

            ativos.forEach((ativo) => {
                    var ticker =
                        String(
                            ativo.ticker
                        );

                    var retorno =
                        Number(
                            ativo.retorno
                        ) || 0;

                    var volatilidade =
                        Number(
                            ativo.volatilidade
                        ) || 0;

                    var sharpe =
                        volatilidade > 0
                            ? (
                                retorno -
                                this.taxaLivreRisco
                            ) /
                            volatilidade
                            : 0;

                    this.metricasAtivos[
                        ticker
                    ] = {
                        retorno:
                            retorno,

                        volatilidade:
                            volatilidade,

                        sharpe:
                            sharpe
                    };
                });

            /*
             * Mantém na tabela ativos selecionados
             * que eventualmente não apareceram na API.
             */
            selecionados.forEach(
                (ticker) => {
                    if (
                        !this.metricasAtivos[
                            ticker
                        ]
                    ) {
                        this.metricasAtivos[
                            ticker
                        ] = {
                            retorno: 0,
                            volatilidade: 0,
                            sharpe: 0
                        };
                    }
                }
            );
        },

        // =====================================================
        // CORRELAÇÃO REAL
        // =====================================================

        processarCorrelacaoReal(
            resultado,
            selecionados
        ) {
            var matriz =
                resultado &&
                resultado.matriz_correlacao
                    ? resultado.matriz_correlacao
                    : (resultado &&
                        resultado.carteira &&
                        resultado.carteira.matriz_correlacao
                        ? resultado.carteira.matriz_correlacao
                        : null);

            var tickersValidos =
                Array.isArray(
                    resultado &&
                    resultado.tickers_validos
                )
                    ? resultado.tickers_validos
                    : (resultado &&
                        resultado.carteira &&
                        Array.isArray(resultado.carteira.tickers_validos)
                        ? resultado.carteira.tickers_validos
                        : selecionados);

            if (
                !matriz ||
                typeof matriz !== 'object'
            ) {
                console.warn(
                    'A API não retornou uma matriz de correlação válida.'
                );

                this.matrizCorrelacao = {};
                this.tickersCorrelacao = [];
                return;
            }

            var matrizProcessada = {};

            tickersValidos.forEach(
                function (tickerLinha) {
                    matrizProcessada[
                        tickerLinha
                    ] = {};

                    tickersValidos.forEach(
                        function (
                            tickerColuna
                        ) {
                            var valor;

                            if (
                                matriz[
                                    tickerLinha
                                ] &&
                                matriz[
                                    tickerLinha
                                ][
                                    tickerColuna
                                ] !== undefined
                            ) {
                                valor = Number(
                                    matriz[
                                        tickerLinha
                                    ][
                                        tickerColuna
                                    ]
                                );
                            } else {
                                valor =
                                    tickerLinha ===
                                    tickerColuna
                                        ? 1
                                        : 0;
                            }

                            if (
                                !Number.isFinite(valor)
                            ) {
                                valor =
                                    tickerLinha ===
                                    tickerColuna
                                        ? 1
                                        : 0;
                            }

                            matrizProcessada[
                                tickerLinha
                            ][
                                tickerColuna
                            ] = Math.max(
                                -1,
                                Math.min(
                                    1,
                                    valor
                                )
                            );
                        }
                    );
                }
            );

            this.matrizCorrelacao =
                matrizProcessada;

            this.tickersCorrelacao =
                tickersValidos;
        },

        // =====================================================
        // HISTÓRICO
        // =====================================================

                processarHistorico(resultado) {
            if (
                resultado &&
                resultado.historico &&
                typeof resultado.historico === 'object' &&
                Array.isArray(
                    resultado.historico.meses
                ) &&
                Array.isArray(
                    resultado.historico.carteira
                ) &&
                Array.isArray(
                    resultado.historico.ibovespa
                ) &&
                resultado.historico.meses.length > 3 &&
                resultado.historico.carteira.length > 3 &&
                resultado.historico.ibovespa.length > 3
            ) {
                this.historico =
                    resultado.historico;

                return;
            }

            this.historico = null;
        },  
        // =====================================================
        // PROJEÇÕES
        // =====================================================

        percentil(array, percentil) {
            if (!Array.isArray(array) || array.length === 0) {
                return 0;
            }

            var valores = array.slice().sort(function (a, b) {
                return a - b;
            });

            var indice = Math.max(0, Math.min(
                valores.length - 1,
                Math.floor(percentil / 100 * valores.length)
            ));

            return valores[indice];
        },

        calcularProjecoes() {
            var valorInicial =
                Number(
                    this.valorInvestir
                ) || 0;

            var horizonte =
                Number(
                    this.horizonte
                ) || 0;

            var retorno =
                Number(
                    this.metricas.retorno
                ) || 0;

            var volatilidade =
                Number(
                    this.metricas.volatilidade
                ) || 0;

            var numeroTrajetorias = 8000;
            var patrimonios = [];

            for (var i = 0; i < numeroTrajetorias; i++) {
                var patrimonio = valorInicial;

                for (var ano = 0; ano < horizonte; ano++) {
                    var retornoAnual = Math.max(
                        -0.99,
                        retorno +
                        (Math.random() * 2 - 1) *
                        volatilidade
                    );

                    patrimonio *= 1 + retornoAnual;
                }

                patrimonios.push(patrimonio);
            }

            this.projecaoPessimista = this.percentil(
                patrimonios,
                10
            );

            this.projecaoPatrimonial = this.percentil(
                patrimonios,
                50
            );

            this.projecaoOtimista = this.percentil(
                patrimonios,
                90
            );
        },

        // =====================================================
        // PREÇOS ATUAIS
        // =====================================================

        async carregarPrecosAtivos(
            tickers
        ) {
            tickers.forEach(
                (ticker) => {
                    this.precosAtivos[
                        ticker
                    ] = 0;
                }
            );

            try {
                var dados =
                    await APIService
                        .buscarInformacoesAtivos(
                            tickers
                        );

                if (!Array.isArray(dados)) {
                    throw new Error(
                        'A API de preços retornou um formato inválido.'
                    );
                }

                dados.forEach(
                    (ativo) => {
                        var ticker =
                            String(
                                ativo.ticker
                            );

                        var preco =
                            Number(
                                ativo.preco_atual
                            );

                        this.precosAtivos[
                            ticker
                        ] =
                            Number.isFinite(preco) &&
                            preco > 0
                                ? preco
                                : 0;
                    }
                );
            } catch (error) {
                console.warn(
                    'Erro ao carregar cotações:',
                    error
                );
            }

            tickers.forEach(
                (ticker) => {
                    var preco = Number(
                        this.precosAtivos[
                            ticker
                        ]
                    );

                    this.precosAtivos[
                        ticker
                    ] =
                        Number.isFinite(preco)
                            ? preco
                            : 0;
                }
            );
        },

        // =====================================================
        // RENDERIZAÇÃO DOS GRÁFICOS
        // =====================================================

        renderizarGraficos(
            resultado,
            fronteira,
            dadosCorrelacao,
            dadosHistoricos
        ) {
            if (
                typeof Charts === 'undefined'
            ) {
                console.error(
                    'O objeto Charts não foi carregado.'
                );

                return;
            }

            /*
             * O resultado contém:
             * perfil, estratégia, retorno,
             * volatilidade e Sharpe.
             *
             * O charts.js pode usar esses campos
             * para mudar o nome do ponto.
             */
            if (
                typeof Charts
                    .renderizarFronteira ===
                'function'
            ) {
                Charts.renderizarFronteira(
                    fronteira,
                    resultado
                );
            }

            if (
                typeof Charts
                    .renderizarPesos ===
                'function'
            ) {
                Charts.renderizarPesos(
                    this.pesos
                );
            }

            if (
                dadosCorrelacao &&
                Array.isArray(
                    dadosCorrelacao.tickers
                ) &&
                dadosCorrelacao
                    .tickers
                    .length > 0 &&
                typeof Charts
                    .renderizarHeatmap ===
                'function'
            ) {
                Charts.renderizarHeatmap(
                    dadosCorrelacao
                );
            }

            if (
                dadosHistoricos &&
                typeof Charts
                    .renderizarHistorico ===
                'function'
            ) {
                Charts.renderizarHistorico(
                    dadosHistoricos
                );
            }
        },

        // =====================================================
        // RECOMENDAÇÃO
        // =====================================================

        gerarRecomendacao() {
            var beta =
                this.metricas.beta;

            var volatilidade =
                Number(
                    this.metricas.volatilidade
                ) || 0;

            var sharpe =
                Number(
                    this.metricas.sharpe
                ) || 0;

            var perfilFormatado =
                this.descricaoPerfil(
                    this.perfil
                );

            var textoPerfil =
                'Para o perfil ' +
                perfilFormatado.toLowerCase() +
                ', foi utilizada a estratégia ' +
                (
                    this.estrategia ||
                    'definida pelo modelo de Markowitz'
                ) +
                '.';

            var textoBeta = '';

            if (
                beta === null ||
                !Number.isFinite(
                    Number(beta)
                )
            ) {
                textoBeta =
                    'Não foi possível calcular o beta contra o Ibovespa no período selecionado.';
            } else {
                beta = Number(beta);

                if (beta < 0.8) {
                    textoBeta =
                        'A carteira apresenta beta de ' +
                        beta.toFixed(2) +
                        ' em relação ao Ibovespa, indicando menor sensibilidade aos movimentos do mercado.';
                } else if (beta <= 1.1) {
                    textoBeta =
                        'A carteira apresenta beta de ' +
                        beta.toFixed(2) +
                        ' em relação ao Ibovespa, com sensibilidade próxima à do mercado.';
                } else {
                    textoBeta =
                        'A carteira apresenta beta de ' +
                        beta.toFixed(2) +
                        ' em relação ao Ibovespa, amplificando os movimentos do mercado.';
                }
            }

            var textoVolatilidade = '';

            if (volatilidade < 0.15) {
                textoVolatilidade =
                    'A volatilidade é relativamente baixa (' +
                    this.formatarPct(
                        volatilidade
                    ) +
                    ').';
            } else if (
                volatilidade < 0.25
            ) {
                textoVolatilidade =
                    'A volatilidade está em nível moderado (' +
                    this.formatarPct(
                        volatilidade
                    ) +
                    ').';
            } else {
                textoVolatilidade =
                    'A volatilidade é elevada (' +
                    this.formatarPct(
                        volatilidade
                    ) +
                    ').';
            }

            var textoSharpe = '';

            if (sharpe > 2) {
                textoSharpe =
                    'O Índice de Sharpe (' +
                    sharpe.toFixed(2) +
                    ') está excepcionalmente alto.';
            } else if (sharpe > 1) {
                textoSharpe =
                    'O Índice de Sharpe (' +
                    sharpe.toFixed(2) +
                    ') indica boa eficiência na relação risco-retorno.';
            } else if (sharpe > 0) {
                textoSharpe =
                    'O Índice de Sharpe (' +
                    sharpe.toFixed(2) +
                    ') é positivo, mas indica eficiência intermediária.';
            } else {
                textoSharpe =
                    'O Índice de Sharpe (' +
                    sharpe.toFixed(2) +
                    ') indica retorno inferior à taxa livre de risco utilizada.';
            }

            var maiorPeso = 0;
            var ativoMaiorPeso = '';

            var ativosSemAlocacao = [];

            Object.keys(
                this.pesos
            ).forEach((ticker) => {
                var peso = Number(
                    this.pesos[ticker]
                ) || 0;

                if (peso > maiorPeso) {
                    maiorPeso = peso;

                    ativoMaiorPeso =
                        ticker.replace(
                            '.SA',
                            ''
                        );
                }

                if (peso <= 0.000001) {
                    ativosSemAlocacao.push(
                        ticker.replace(
                            '.SA',
                            ''
                        )
                    );
                }
            });

            var textoConcentracao = '';

            if (maiorPeso > 0.40) {
                textoConcentracao =
                    'Atenção: a carteira está concentrada em ' +
                    ativoMaiorPeso +
                    ' (' +
                    (
                        maiorPeso *
                        100
                    ).toFixed(1) +
                    '%).';
            } else {
                textoConcentracao =
                    'A distribuição dos pesos não apresenta concentração individual superior a 40%.';
            }

            var textoSemAlocacao = '';

            if (
                ativosSemAlocacao.length > 0
            ) {
                textoSemAlocacao =
                    'Os ativos ' +
                    ativosSemAlocacao.join(', ') +
                    ' foram analisados, mas receberam peso zero na carteira deste perfil.';
            }

            var textoProjecao =
                'Projeção matemática para ' +
                this.horizonte +
                ' anos: esperado R$ ' +
                this.formatarMoeda(
                    this.projecaoPatrimonial
                ) +
                ', cenário otimista R$ ' +
                this.formatarMoeda(
                    this.projecaoOtimista
                ) +
                ' e cenário pessimista R$ ' +
                this.formatarMoeda(
                    this.projecaoPessimista
                ) +
                '.';

            var textoHistorico =
                this.historico
                    ? (
                        'O gráfico apresenta o desempenho ' +
                        'histórico reconstruído da carteira ' +
                        'e do Ibovespa.'
                    )
                    : (
                        'Não foi possível gerar a comparação ' +
                        'histórica para o período selecionado.'
                    );

            this.recomendacao = [
                textoPerfil,
                textoBeta,
                textoVolatilidade,
                textoSharpe,
                textoConcentracao,
                textoSemAlocacao,
                textoProjecao,
                textoHistorico
            ]
                .filter(function (texto) {
                    return Boolean(texto);
                })
                .join(' ');
        },

        // =====================================================
        // FORMATAÇÃO
        // =====================================================

        formatarPct(valor) {
            var numero =
                Number(valor);

            if (
                !Number.isFinite(numero)
            ) {
                return 'N/D';
            }

            return (
                (
                    numero *
                    100
                ).toLocaleString(
                    'pt-BR',
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                ) +
                '%'
            );
        },

        formatarMoeda(valor) {
            var numero =
                Number(valor);

            if (
                !Number.isFinite(numero)
            ) {
                return '0,00';
            }

            return numero.toLocaleString(
                'pt-BR',
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );
        },

        formatarBeta(valor) {
            if (
                valor === null ||
                valor === undefined
            ) {
                return 'N/D';
            }

            var numero =
                Number(valor);

            if (
                !Number.isFinite(numero)
            ) {
                return 'N/D';
            }

            return numero.toFixed(2);
        }
    };
}