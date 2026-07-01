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

        taxaLivreRisco: 0.10,
        benchmark: '^BVSP',
        estrategia: '',

        // =====================================================
        // ATIVOS DISPONÍVEIS
        // =====================================================

        ativosDisponiveis: [
            {
                ticker: 'PETR4.SA',
                nome: 'Petrobras PN',
                selecionado: true
            },
            {
                ticker: 'VALE3.SA',
                nome: 'Vale ON',
                selecionado: true
            },
            {
                ticker: 'ITUB4.SA',
                nome: 'Itaú Unibanco PN',
                selecionado: true
            },
            {
                ticker: 'BBDC4.SA',
                nome: 'Bradesco PN',
                selecionado: true
            },
            {
                ticker: 'WEGE3.SA',
                nome: 'WEG ON',
                selecionado: true
            },
            {
                ticker: 'ABEV3.SA',
                nome: 'Ambev ON',
                selecionado: false
            },
            {
                ticker: 'RENT3.SA',
                nome: 'Localiza ON',
                selecionado: false
            }
        ],

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
        historicoDemonstrativo: true,

        recomendacao: '',

        projecaoPatrimonial: 0,
        projecaoOtimista: 0,
        projecaoPessimista: 0,

        // =====================================================
        // PROPRIEDADES CALCULADAS
        // =====================================================

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
            if (
                index < 0 ||
                index >= this.ativosDisponiveis.length
            ) {
                return;
            }

            this.ativosDisponiveis[
                index
            ].selecionado =
                !this.ativosDisponiveis[
                    index
                ].selecionado;
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
                /*
                 * O perfil é enviado nos dois endpoints.
                 */
                var respostas =
                    await Promise.all([
                        APIService.otimizarCarteira(
                            selecionados,
                            periodo,
                            perfilAtual
                        ),

                        APIService.calcularFronteira(
                            selecionados,
                            periodo,
                            perfilAtual
                        )
                    ]);

                var resultado =
                    respostas[0];

                var fronteira =
                    respostas[1];

                this.validarResultadoOtimizacao(
                    resultado
                );

                this.validarResultadoFronteira(
                    fronteira
                );

                this.processarMetricasCarteira(
                    resultado,
                    selecionados
                );

                this.processarMetricasAtivos(
                    fronteira,
                    selecionados
                );

                this.processarCorrelacaoReal(
                    resultado,
                    selecionados
                );

                this.calcularProjecoes();

                await this.carregarPrecosAtivos(
                    selecionados
                );

                this.processarHistorico(
                    resultado
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
                        resultado,
                        fronteira,
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

        validarResultadoOtimizacao(
            resultado
        ) {
            if (
                !resultado ||
                typeof resultado !== 'object'
            ) {
                throw new Error(
                    'A API de otimização retornou uma resposta inválida.'
                );
            }

            if (
                resultado.sucesso === false
            ) {
                throw new Error(
                    resultado.erro ||
                    'A otimização não foi concluída.'
                );
            }

            if (
                !resultado.pesos ||
                typeof resultado.pesos !== 'object'
            ) {
                throw new Error(
                    'A API não retornou os pesos da carteira.'
                );
            }

            var retorno = Number(
                resultado.retorno_esperado
            );

            var volatilidade = Number(
                resultado.volatilidade
            );

            var sharpe = Number(
                resultado.indice_sharpe
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
        },

        validarResultadoFronteira(
            fronteira
        ) {
            if (
                !fronteira ||
                typeof fronteira !== 'object'
            ) {
                throw new Error(
                    'A API da fronteira retornou uma resposta inválida.'
                );
            }

            if (
                !Array.isArray(
                    fronteira.fronteira_eficiente
                ) ||
                fronteira
                    .fronteira_eficiente
                    .length === 0
            ) {
                throw new Error(
                    'A API não retornou pontos para a fronteira eficiente.'
                );
            }

            if (
                !Array.isArray(
                    fronteira.ativos_individual
                )
            ) {
                throw new Error(
                    'A API não retornou os ativos individuais.'
                );
            }

            if (
                !Array.isArray(
                    fronteira.carteiras_simuladas
                )
            ) {
                fronteira
                    .carteiras_simuladas = [];
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

            fronteira
                .ativos_individual
                .forEach((ativo) => {
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
                resultado.matriz_correlacao;

            var tickersValidos =
                Array.isArray(
                    resultado.tickers_validos
                )
                    ? resultado.tickers_validos
                    : selecionados;

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
                resultado.historico &&
                Array.isArray(
                    resultado.historico.meses
                ) &&
                Array.isArray(
                    resultado.historico.carteira
                ) &&
                Array.isArray(
                    resultado.historico.ibovespa
                )
            ) {
                this.historico =
                    resultado.historico;

                this.historicoDemonstrativo =
                    false;

                return;
            }

            /*
             * O views.py atual ainda não devolve
             * uma série histórica real.
             */
            this.historico =
                this.gerarHistoricoDemonstrativo();

            this.historicoDemonstrativo =
                true;
        },

        gerarHistoricoDemonstrativo() {
            var meses = [
                'Jan/25',
                'Fev/25',
                'Mar/25',
                'Abr/25',
                'Mai/25',
                'Jun/25',
                'Jul/25',
                'Ago/25',
                'Set/25',
                'Out/25',
                'Nov/25',
                'Dez/25',
                'Jan/26',
                'Fev/26',
                'Mar/26',
                'Abr/26',
                'Mai/26',
                'Jun/26'
            ];

            var carteira = [100];
            var ibovespa = [100];
            var cdi = [100];

            var multiplicadorPerfil = {
                conservador: 0.75,
                moderado: 1.00,
                arrojado: 1.25
            };

            var multiplicador =
                multiplicadorPerfil[
                    this.perfil
                ] || 1;

            for (
                var i = 1;
                i < meses.length;
                i++
            ) {
                var retornoCarteira =
                    (
                        0.009 +
                        Math.sin(
                            i * 0.85
                        ) *
                        0.022
                    ) *
                    multiplicador;

                var retornoIbovespa =
                    0.007 +
                    Math.sin(
                        i * 0.70 +
                        0.5
                    ) *
                    0.028;

                var retornoCdi =
                    0.008;

                carteira.push(
                    carteira[
                        i - 1
                    ] *
                    (
                        1 +
                        retornoCarteira
                    )
                );

                ibovespa.push(
                    ibovespa[
                        i - 1
                    ] *
                    (
                        1 +
                        retornoIbovespa
                    )
                );

                cdi.push(
                    cdi[
                        i - 1
                    ] *
                    (
                        1 +
                        retornoCdi
                    )
                );
            }

            return {
                meses: meses,
                carteira: carteira,
                ibovespa: ibovespa,
                cdi: cdi
            };
        },

        // =====================================================
        // PROJEÇÕES
        // =====================================================

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

            var retornoEsperado =
                Math.max(
                    -0.99,
                    retorno
                );

            var retornoOtimista =
                Math.max(
                    -0.99,
                    retorno +
                    volatilidade
                );

            var retornoPessimista =
                Math.max(
                    -0.99,
                    retorno -
                    volatilidade
                );

            this.projecaoPatrimonial =
                valorInicial *
                Math.pow(
                    1 + retornoEsperado,
                    horizonte
                );

            this.projecaoOtimista =
                valorInicial *
                Math.pow(
                    1 + retornoOtimista,
                    horizonte
                );

            this.projecaoPessimista =
                valorInicial *
                Math.pow(
                    1 + retornoPessimista,
                    horizonte
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
                this.historicoDemonstrativo
                    ? 'O gráfico de performance comparativa ainda é demonstrativo.'
                    : 'O gráfico de performance utiliza a série histórica retornada pelo backend.';

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