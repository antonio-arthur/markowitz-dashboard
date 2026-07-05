var Charts = {
    graficoPesosInstancia: null,

    configuracaoPlotly: {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,

        modeBarButtonsToRemove: [
            'lasso2d',
            'select2d',
            'autoScale2d'
        ]
    },

    // =========================================================
    // FUNÇÕES AUXILIARES
    // =========================================================

    numeroValido: function (valor) {
        return Number.isFinite(
            Number(valor)
        );
    },

    percentualValido: function (valor) {
        var numero = Number(valor);

        return (
            Number.isFinite(numero) &&
            numero >= 0
        );
    },

    obterElemento: function (id) {
        var elemento =
            document.getElementById(id);

        if (!elemento) {
            console.warn(
                'Elemento HTML não encontrado: #' +
                id
            );

            return null;
        }

        return elemento;
    },

    normalizarPonto: function (ponto) {
        if (
            !ponto ||
            typeof ponto !== 'object'
        ) {
            return null;
        }

        var volatilidade =
            Number(ponto.volatilidade);

        var retorno =
            Number(ponto.retorno);

        if (
            !Number.isFinite(volatilidade) ||
            !Number.isFinite(retorno) ||
            volatilidade < 0
        ) {
            return null;
        }

        return {
            volatilidade: volatilidade,
            retorno: retorno
        };
    },

    normalizarAtivo: function (ativo) {
        if (
            !ativo ||
            typeof ativo !== 'object'
        ) {
            return null;
        }

        var volatilidade =
            Number(ativo.volatilidade);

        var retorno =
            Number(ativo.retorno);

        if (
            !Number.isFinite(volatilidade) ||
            !Number.isFinite(retorno) ||
            volatilidade < 0
        ) {
            return null;
        }

        return {
            ticker: String(
                ativo.ticker || 'Ativo'
            ),

            volatilidade: volatilidade,
            retorno: retorno
        };
    },

    obterConfiguracaoPerfil: function (
        perfil
    ) {
        var perfilNormalizado = String(
            perfil || 'moderado'
        ).toLowerCase();

        var configuracoes = {
            conservador: {
                perfil: 'conservador',
                nome: 'Perfil conservador',
                texto: 'Conservador',
                descricao:
                    'Carteira de mínima variância',
                cor: '#facc15',
                corBorda: '#fef08a',
                simbolo: 'circle',
                posicaoTexto: 'bottom right'
            },

            moderado: {
                perfil: 'moderado',
                nome: 'Perfil moderado',
                texto: 'Moderado',
                descricao:
                    'Carteira de máximo Sharpe',
                cor: '#ef4444',
                corBorda: '#ffffff',
                simbolo: 'circle',
                posicaoTexto: 'top left'
            },

            arrojado: {
                perfil: 'arrojado',
                nome: 'Perfil arrojado',
                texto: 'Arrojado',
                descricao:
                    'Carteira eficiente de alto retorno',
                cor: '#a855f7',
                corBorda: '#ffffff',
                simbolo: 'diamond',
                posicaoTexto: 'top left'
            }
        };

        return (
            configuracoes[
                perfilNormalizado
            ] ||
            configuracoes.moderado
        );
    },

    // =========================================================
    // FRONTEIRA EFICIENTE
    // =========================================================

    renderizarFronteira: function (
        dadosFronteira,
        carteiraOtimizada
    ) {
        var elemento =
            this.obterElemento(
                'graficoFronteira'
            );

        if (!elemento) {
            return;
        }

        dadosFronteira =
            dadosFronteira &&
            typeof dadosFronteira ===
                'object'
                ? dadosFronteira
                : {};

        carteiraOtimizada =
            carteiraOtimizada &&
            typeof carteiraOtimizada ===
                'object'
                ? carteiraOtimizada
                : {};

        var perfilAtual = String(
            carteiraOtimizada.perfil ||
            dadosFronteira.perfil ||
            'moderado'
        ).toLowerCase();

        var configuracaoPerfil =
            this.obterConfiguracaoPerfil(
                perfilAtual
            );

        var estrategia =
            carteiraOtimizada.estrategia ||
            configuracaoPerfil.descricao;

        var simulacoesBrutas =
            Array.isArray(
                dadosFronteira
                    .carteiras_simuladas
            )
                ? dadosFronteira
                    .carteiras_simuladas
                : [];

        var fronteiraBruta =
            Array.isArray(
                dadosFronteira
                    .fronteira_eficiente
            )
                ? dadosFronteira
                    .fronteira_eficiente
                : [];

        var ativosBrutos =
            Array.isArray(
                dadosFronteira
                    .ativos_individual
            )
                ? dadosFronteira
                    .ativos_individual
                : (
                    Array.isArray(
                        dadosFronteira
                            .ativos
                    )
                        ? dadosFronteira
                            .ativos
                        : []
                );

        var simulacoes =
            simulacoesBrutas
                .map(function (ponto) {
                    return Charts
                        .normalizarPonto(
                            ponto
                        );
                })
                .filter(function (ponto) {
                    return ponto !== null;
                });

        var fronteira =
            fronteiraBruta
                .map(function (ponto) {
                    return Charts
                        .normalizarPonto(
                            ponto
                        );
                })
                .filter(function (ponto) {
                    return ponto !== null;
                })
                .sort(function (a, b) {
                    return (
                        a.volatilidade -
                        b.volatilidade
                    );
                });

        var ativos =
            ativosBrutos
                .map(function (ativo) {
                    return Charts
                        .normalizarAtivo(
                            ativo
                        );
                })
                .filter(function (ativo) {
                    return ativo !== null;
                });

        if (fronteira.length === 0) {
            elemento.innerHTML =
                '<div style="' +
                'display:flex;' +
                'align-items:center;' +
                'justify-content:center;' +
                'height:100%;' +
                'min-height:350px;' +
                'color:#fca5a5;' +
                'font-family:Inter,sans-serif;' +
                'text-align:center;' +
                'padding:20px;' +
                '">' +
                'Não foi possível construir a fronteira eficiente.' +
                '</div>';

            return;
        }

        var traces = [];

        /*
         * Carteiras aleatórias do conjunto viável.
         */
        if (simulacoes.length > 0) {
            traces.push({
                x: simulacoes.map(
                    function (carteira) {
                        return carteira
                            .volatilidade;
                    }
                ),

                y: simulacoes.map(
                    function (carteira) {
                        return carteira
                            .retorno;
                    }
                ),

                type: 'scattergl',
                mode: 'markers',
                name: 'Carteiras simuladas',

                marker: {
                    size: 4,
                    color: '#94a3b8',
                    opacity: 0.25
                },

                hovertemplate:
                    '<b>Carteira simulada</b>' +
                    '<br>Volatilidade: %{x:.2%}' +
                    '<br>Retorno: %{y:.2%}' +
                    '<extra></extra>'
            });
        }

        /*
         * Linha da fronteira eficiente.
         */
        traces.push({
            x: fronteira.map(
                function (ponto) {
                    return ponto
                        .volatilidade;
                }
            ),

            y: fronteira.map(
                function (ponto) {
                    return ponto
                        .retorno;
                }
            ),

            type: 'scatter',
            mode: 'lines+markers',
            name: 'Fronteira eficiente',

            line: {
                color: '#22c55e',
                width: 4
            },

            marker: {
                size: 4,
                color: '#22c55e'
            },

            hovertemplate:
                '<b>Fronteira eficiente</b>' +
                '<br>Volatilidade: %{x:.2%}' +
                '<br>Retorno: %{y:.2%}' +
                '<extra></extra>'
        });

        /*
         * Carteira de mínima variância.
         *
         * Não é adicionada separadamente quando
         * o perfil atual já é conservador,
         * evitando dois pontos sobrepostos.
         */
        var minimaVariancia =
            carteiraOtimizada
                .min_variancia;

        if (
            perfilAtual !==
                'conservador' &&
            minimaVariancia &&
            this.percentualValido(
                minimaVariancia
                    .volatilidade
            ) &&
            this.numeroValido(
                minimaVariancia
                    .retorno
            )
        ) {
            traces.push({
                x: [
                    Number(
                        minimaVariancia
                            .volatilidade
                    )
                ],

                y: [
                    Number(
                        minimaVariancia
                            .retorno
                    )
                ],

                type: 'scatter',
                mode: 'markers+text',
                name: 'Mínima variância',

                marker: {
                    size: 17,
                    color: '#facc15',
                    symbol: 'circle',

                    line: {
                        color: '#fef08a',
                        width: 2
                    }
                },

                text: [
                    'Min. variância'
                ],

                textposition:
                    'bottom right',

                textfont: {
                    size: 10,
                    color: '#ffffff',
                    family: 'Inter'
                },

                hovertemplate:
                    '<b>Carteira de mínima variância</b>' +
                    '<br>Volatilidade: %{x:.2%}' +
                    '<br>Retorno: %{y:.2%}' +
                    '<extra></extra>'
            });
        }

        /*
         * Carteira selecionada conforme o perfil.
         */
        if (
            this.percentualValido(
                carteiraOtimizada
                    .volatilidade
            ) &&
            this.numeroValido(
                carteiraOtimizada
                    .retorno_esperado
            )
        ) {
            var sharpeCarteira =
                Number(
                    carteiraOtimizada
                        .indice_sharpe
                );

            if (
                !Number.isFinite(
                    sharpeCarteira
                )
            ) {
                sharpeCarteira = 0;
            }

            traces.push({
                x: [
                    Number(
                        carteiraOtimizada
                            .volatilidade
                    )
                ],

                y: [
                    Number(
                        carteiraOtimizada
                            .retorno_esperado
                    )
                ],

                type: 'scatter',
                mode: 'markers+text',

                name:
                    configuracaoPerfil
                        .nome,

                marker: {
                    size: 21,

                    color:
                        configuracaoPerfil
                            .cor,

                    symbol:
                        configuracaoPerfil
                            .simbolo,

                    line: {
                        color:
                            configuracaoPerfil
                                .corBorda,

                        width: 3
                    }
                },

                text: [
                    configuracaoPerfil
                        .texto
                ],

                textposition:
                    configuracaoPerfil
                        .posicaoTexto,

                textfont: {
                    size: 11,
                    color: '#ffffff',
                    family: 'Inter'
                },

                customdata: [
                    sharpeCarteira
                ],

                hovertemplate:
                    '<b>' +
                    estrategia +
                    '</b>' +
                    '<br>Perfil: ' +
                    configuracaoPerfil.texto +
                    '<br>Volatilidade: %{x:.2%}' +
                    '<br>Retorno: %{y:.2%}' +
                    '<br>Sharpe: %{customdata:.3f}' +
                    '<extra></extra>'
            });
        }

        /*
         * Ativos individuais.
         */
        if (ativos.length > 0) {
            traces.push({
                x: ativos.map(
                    function (ativo) {
                        return ativo
                            .volatilidade;
                    }
                ),

                y: ativos.map(
                    function (ativo) {
                        return ativo
                            .retorno;
                    }
                ),

                type: 'scatter',
                mode: 'markers+text',
                name: 'Ativos individuais',

                marker: {
                    size: 11,
                    color: '#10b981',
                    symbol: 'diamond',

                    line: {
                        color: '#d1fae5',
                        width: 1
                    }
                },

                text: ativos.map(
                    function (ativo) {
                        return ativo.ticker
                            .replace(
                                '.SA',
                                ''
                            );
                    }
                ),

                textposition:
                    'top center',

                textfont: {
                    size: 10,
                    color: '#ffffff',
                    family:
                        'JetBrains Mono'
                },

                hovertemplate:
                    '<b>%{text}</b>' +
                    '<br>Volatilidade: %{x:.2%}' +
                    '<br>Retorno: %{y:.2%}' +
                    '<extra></extra>'
            });
        }

        var quantidadeSimulacoes =
            simulacoes.length
                .toLocaleString(
                    'pt-BR'
                );

        var subtitulo =
            simulacoes.length > 0
                ? quantidadeSimulacoes +
                  ' carteiras simuladas | ' +
                  configuracaoPerfil.texto +
                  ' — ' +
                  estrategia
                : configuracaoPerfil.texto +
                  ' — ' +
                  estrategia;

        var layout = {
            paper_bgcolor:
                'rgba(0,0,0,0)',

            plot_bgcolor:
                'rgba(0,0,0,0)',

            font: {
                color: '#ffffff',
                family: 'Inter'
            },

            title: {
                text:
                    '<b>Conjunto Viável e Fronteira Eficiente</b>' +
                    '<br><sub>' +
                    subtitulo +
                    '</sub>',

                font: {
                    size: 14,
                    color: '#ffffff'
                },

                x: 0.5,
                xanchor: 'center'
            },

            xaxis: {
                title: {
                    text:
                        '<b>Risco — volatilidade anual</b>',

                    font: {
                        size: 12,
                        color: '#ffffff'
                    }
                },

                tickformat: '.1%',

                tickfont: {
                    color: '#ffffff'
                },

                gridcolor:
                    'rgba(255,255,255,0.10)',

                zerolinecolor:
                    'rgba(255,255,255,0.20)',

                color: '#ffffff',
                rangemode: 'tozero',
                automargin: true
            },

            yaxis: {
                title: {
                    text:
                        '<b>Retorno histórico anualizado</b>',

                    font: {
                        size: 12,
                        color: '#ffffff'
                    }
                },

                tickformat: '.1%',

                tickfont: {
                    color: '#ffffff'
                },

                gridcolor:
                    'rgba(255,255,255,0.10)',

                zerolinecolor:
                    'rgba(255,255,255,0.20)',

                color: '#ffffff',
                automargin: true
            },

            hovermode: 'closest',

            margin: {
                t: 72,
                r: 25,
                b: 60,
                l: 70
            },

            legend: {
                x: 0.01,
                y: 0.99,

                bgcolor:
                    'rgba(15,23,41,0.92)',

                bordercolor:
                    'rgba(255,255,255,0.20)',

                borderwidth: 1,

                font: {
                    size: 11,
                    color: '#ffffff'
                }
            },

            showlegend: true,
            autosize: true
        };

        Plotly.react(
            elemento,
            traces,
            layout,
            this.configuracaoPlotly
        );
    },

    // =========================================================
    // GRÁFICO DE ALOCAÇÃO
    // =========================================================

    renderizarPesos: function (pesos) {
        var canvas =
            this.obterElemento(
                'graficoPesos'
            );

        if (!canvas) {
            return;
        }

        if (
            typeof Chart ===
            'undefined'
        ) {
            console.error(
                'A biblioteca Chart.js não foi carregada.'
            );

            return;
        }

        pesos =
            pesos &&
            typeof pesos === 'object'
                ? pesos
                : {};

        /*
         * Apenas pesos positivos entram
         * no gráfico de rosca.
         *
         * Ativos com peso zero continuam
         * aparecendo normalmente na tabela.
         */
        var entradas =
            Object.keys(pesos)
                .map(function (ticker) {
                    return {
                        ticker: ticker,

                        peso: Number(
                            pesos[ticker]
                        )
                    };
                })
                .filter(function (item) {
                    return (
                        Number.isFinite(
                            item.peso
                        ) &&
                        item.peso >
                            0.000001
                    );
                })
                .sort(function (a, b) {
                    return (
                        b.peso -
                        a.peso
                    );
                });

        if (entradas.length === 0) {
            if (
                this
                    .graficoPesosInstancia
            ) {
                this
                    .graficoPesosInstancia
                    .destroy();

                this
                    .graficoPesosInstancia =
                    null;
            }

            return;
        }

        var somaPesos =
            entradas.reduce(
                function (
                    soma,
                    item
                ) {
                    return (
                        soma +
                        item.peso
                    );
                },
                0
            );

        if (somaPesos <= 0) {
            return;
        }

        var tickers =
            entradas.map(
                function (item) {
                    return item.ticker;
                }
            );

        var valores =
            entradas.map(
                function (item) {
                    return Number(
                        (
                            item.peso /
                            somaPesos *
                            100
                        ).toFixed(4)
                    );
                }
            );

        var cores = [
            '#3b82f6',
            '#10b981',
            '#ef4444',
            '#f59e0b',
            '#8b5cf6',
            '#ec4899',
            '#06b6d4',
            '#84cc16',
            '#f97316',
            '#6366f1'
        ];

        if (
            this.graficoPesosInstancia
        ) {
            this
                .graficoPesosInstancia
                .destroy();

            this
                .graficoPesosInstancia =
                null;
        }

        var contexto =
            canvas.getContext('2d');

        this.graficoPesosInstancia =
            new Chart(
                contexto,
                {
                    type: 'doughnut',

                    data: {
                        labels:
                            tickers.map(
                                function (
                                    ticker
                                ) {
                                    return ticker
                                        .replace(
                                            '.SA',
                                            ''
                                        );
                                }
                            ),

                        datasets: [
                            {
                                data: valores,

                                backgroundColor:
                                    tickers.map(
                                        function (
                                            ticker,
                                            indice
                                        ) {
                                            return cores[
                                                indice %
                                                cores.length
                                            ];
                                        }
                                    ),

                                borderWidth: 3,

                                borderColor:
                                    '#1a1f3a',

                                hoverOffset: 8
                            }
                        ]
                    },

                    options: {
                        responsive: true,

                        maintainAspectRatio:
                            false,

                        cutout: '60%',

                        animation: {
                            duration: 600
                        },

                        plugins: {
                            tooltip: {
                                titleColor:
                                    '#ffffff',

                                bodyColor:
                                    '#ffffff',

                                backgroundColor:
                                    'rgba(15,23,41,0.95)',

                                borderColor:
                                    'rgba(255,255,255,0.20)',

                                borderWidth: 1,

                                callbacks: {
                                    label:
                                        function (
                                            contextoTooltip
                                        ) {
                                            var valor =
                                                Number(
                                                    contextoTooltip
                                                        .raw
                                                ) || 0;

                                            return (
                                                contextoTooltip
                                                    .label +
                                                ': ' +
                                                valor.toLocaleString(
                                                    'pt-BR',
                                                    {
                                                        minimumFractionDigits:
                                                            2,

                                                        maximumFractionDigits:
                                                            2
                                                    }
                                                ) +
                                                '%'
                                            );
                                        }
                                }
                            },

                            legend: {
                                display: true,
                                position: 'bottom',

                                labels: {
                                    padding: 15,

                                    usePointStyle:
                                        true,

                                    pointStyle:
                                        'circle',

                                    color:
                                        '#ffffff',

                                    font: {
                                        family:
                                            'Inter',

                                        size: 12,

                                        weight:
                                            '500'
                                    },

                                    generateLabels:
                                        function (
                                            chart
                                        ) {
                                            return chart
                                                .data
                                                .labels
                                                .map(
                                                    function (
                                                        label,
                                                        indice
                                                    ) {
                                                        var valor =
                                                            chart
                                                                .data
                                                                .datasets[0]
                                                                .data[
                                                                    indice
                                                                ];

                                                        var cor =
                                                            chart
                                                                .data
                                                                .datasets[0]
                                                                .backgroundColor[
                                                                    indice
                                                                ];

                                                        return {
                                                            text:
                                                                label +
                                                                '  ' +
                                                                Number(
                                                                    valor
                                                                ).toLocaleString(
                                                                    'pt-BR',
                                                                    {
                                                                        minimumFractionDigits:
                                                                            1,

                                                                        maximumFractionDigits:
                                                                            1
                                                                    }
                                                                ) +
                                                                '%',

                                                            fillStyle:
                                                                cor,

                                                            strokeStyle:
                                                                cor,

                                                            pointStyle:
                                                                'circle',

                                                            lineWidth:
                                                                0,

                                                            fontColor:
                                                                '#ffffff',

                                                            hidden:
                                                                false,

                                                            index:
                                                                indice
                                                        };
                                                    }
                                                );
                                        }
                                }
                            }
                        }
                    }
                }
            );
    },

    // =========================================================
    // MATRIZ DE CORRELAÇÃO
    // =========================================================

    renderizarHeatmap: function (
        dadosCorrelacao
    ) {
        var elemento =
            this.obterElemento(
                'heatmapCorrelacao'
            );

        if (!elemento) {
            return;
        }

        if (
            !dadosCorrelacao ||
            typeof dadosCorrelacao !==
                'object'
        ) {
            console.warn(
                'Dados de correlação inválidos.'
            );

            return;
        }

        var tickers =
            Array.isArray(
                dadosCorrelacao.tickers
            )
                ? dadosCorrelacao.tickers
                : [];

        var matriz =
            dadosCorrelacao.matriz &&
            typeof dadosCorrelacao
                .matriz === 'object'
                ? dadosCorrelacao.matriz
                : {};

        if (tickers.length === 0) {
            console.warn(
                'Nenhum ticker disponível para o heatmap.'
            );

            return;
        }

        var zValues = [];
        var textValues = [];

        for (
            var i = 0;
            i < tickers.length;
            i++
        ) {
            var linhaZ = [];
            var linhaTexto = [];

            for (
                var j = 0;
                j < tickers.length;
                j++
            ) {
                var linhaMatriz =
                    matriz[
                        tickers[i]
                    ] || {};

                var valor =
                    Number(
                        linhaMatriz[
                            tickers[j]
                        ]
                    );

                if (
                    !Number.isFinite(
                        valor
                    )
                ) {
                    valor =
                        i === j
                            ? 1
                            : 0;
                }

                valor =
                    Math.max(
                        -1,
                        Math.min(
                            1,
                            valor
                        )
                    );

                linhaZ.push(valor);

                linhaTexto.push(
                    valor.toFixed(2)
                );
            }

            zValues.push(
                linhaZ
            );

            textValues.push(
                linhaTexto
            );
        }

        var labels =
            tickers.map(
                function (ticker) {
                    return ticker.replace(
                        '.SA',
                        ''
                    );
                }
            );

        var trace = {
            z: zValues,
            x: labels,
            y: labels,

            type: 'heatmap',

            zmin: -1,
            zmax: 1,
            zmid: 0,

            colorscale: [
                [
                    0,
                    '#ef4444'
                ],

                [
                    0.25,
                    '#f87171'
                ],

                [
                    0.5,
                    '#e2e8f0'
                ],

                [
                    0.75,
                    '#60a5fa'
                ],

                [
                    1,
                    '#3b82f6'
                ]
            ],

            showscale: true,

            colorbar: {
                title: {
                    text:
                        'Correlação',

                    font: {
                        color:
                            '#ffffff'
                    }
                },

                tickfont: {
                    color:
                        '#ffffff'
                },

                tickformat:
                    '.1f'
            },

            text: textValues,

            texttemplate:
                '%{text}',

            textfont: {
                size: 11,

                family:
                    'JetBrains Mono',

                color:
                    '#1e293b'
            },

            hovertemplate:
                '<b>%{x} × %{y}</b>' +
                '<br>Correlação: %{z:.2f}' +
                '<extra></extra>'
        };

        var layout = {
            paper_bgcolor:
                'rgba(0,0,0,0)',

            plot_bgcolor:
                'rgba(0,0,0,0)',

            font: {
                color:
                    '#ffffff',

                family:
                    'Inter'
            },

            xaxis: {
                side: 'top',

                tickfont: {
                    color:
                        '#ffffff'
                },

                color:
                    '#ffffff',

                automargin:
                    true
            },

            yaxis: {
                tickfont: {
                    color:
                        '#ffffff'
                },

                color:
                    '#ffffff',

                autorange:
                    'reversed',

                automargin:
                    true
            },

            margin: {
                t: 55,
                r: 70,
                b: 35,
                l: 70
            },

            autosize: true
        };

        Plotly.react(
            elemento,
            [
                trace
            ],
            layout,
            {
                responsive: true,
                displayModeBar: false,
                displaylogo: false
            }
        );
    },

    // =========================================================
    // PERFORMANCE HISTÓRICA
    // =========================================================

    renderizarHistorico: function (
        dadosHistoricos
    ) {
        var elemento =
            this.obterElemento(
                'graficoHistorico'
            );

        if (!elemento) {
            return;
        }

        if (
            !dadosHistoricos ||
            typeof dadosHistoricos !==
                'object'
        ) {
            console.warn(
                'Dados históricos inválidos.'
            );

            return;
        }

        var meses =
            Array.isArray(
                dadosHistoricos.meses
            )
                ? dadosHistoricos.meses
                : [];

        var carteira =
            Array.isArray(
                dadosHistoricos.carteira
            )
                ? dadosHistoricos.carteira
                : [];

        var ibovespa =
            Array.isArray(
                dadosHistoricos.ibovespa
            )
                ? dadosHistoricos.ibovespa
                : [];

        var cdi =
            Array.isArray(
                dadosHistoricos.cdi
            )
                ? dadosHistoricos.cdi
                : [];

        if (meses.length === 0) {
            console.warn(
                'Nenhum período disponível para o gráfico histórico.'
            );

            return;
        }

        var tamanhoObrigatorio =
            Math.min(
                meses.length,
                carteira.length,
                ibovespa.length
            );

        if (tamanhoObrigatorio === 0) {
            console.warn(
                'As séries históricas estão vazias.'
            );

            return;
        }

        meses =
            meses.slice(
                0,
                tamanhoObrigatorio
            );

        carteira =
            carteira
                .slice(
                    0,
                    tamanhoObrigatorio
                )
                .map(
                    function (valor) {
                        var numero =
                            Number(valor);

                        return Number.isFinite(
                            numero
                        )
                            ? numero
                            : null;
                    }
                );

        ibovespa =
            ibovespa
                .slice(
                    0,
                    tamanhoObrigatorio
                )
                .map(
                    function (valor) {
                        var numero =
                            Number(valor);

                        return Number.isFinite(
                            numero
                        )
                            ? numero
                            : null;
                    }
                );

        var traces = [
            {
                x: meses,
                y: carteira,

                type: 'scatter',
                mode: 'lines',
                name: 'Carteira',

                line: {
                    color:
                        '#3b82f6',

                    width: 3
                },

                hovertemplate:
                    '<b>Carteira</b>' +
                    '<br>%{x}' +
                    '<br>Índice: %{y:.2f}' +
                    '<extra></extra>'
            },

            {
                x: meses,
                y: ibovespa,

                type: 'scatter',
                mode: 'lines',
                name: 'Ibovespa',

                line: {
                    color:
                        '#f59e0b',

                    width: 2,

                    dash:
                        'dash'
                },

                hovertemplate:
                    '<b>Ibovespa</b>' +
                    '<br>%{x}' +
                    '<br>Índice: %{y:.2f}' +
                    '<extra></extra>'
            }
        ];

        /*
         * O CDI só é incluído quando estiver disponível.
         */
        if (cdi.length > 0) {
            var cdiProcessado =
                cdi
                    .slice(
                        0,
                        tamanhoObrigatorio
                    )
                    .map(
                        function (valor) {
                            var numero =
                                Number(valor);

                            return Number.isFinite(
                                numero
                            )
                                ? numero
                                : null;
                        }
                    );

            traces.push({
                x: meses,
                y: cdiProcessado,

                type: 'scatter',
                mode: 'lines',
                name: 'CDI',

                line: {
                    color:
                        '#10b981',

                    width: 2,

                    dash:
                        'dot'
                },

                hovertemplate:
                    '<b>CDI</b>' +
                    '<br>%{x}' +
                    '<br>Índice: %{y:.2f}' +
                    '<extra></extra>'
            });
        }

        var layout = {
            paper_bgcolor:
                'rgba(0,0,0,0)',

            plot_bgcolor:
                'rgba(0,0,0,0)',

            font: {
                color: '#ffffff',
                family: 'Inter'
            },

            xaxis: {
                gridcolor:
                    'rgba(255,255,255,0.10)',

                color:
                    '#ffffff',

                tickfont: {
                    color:
                        '#ffffff'
                },

                automargin:
                    true
            },

            yaxis: {
                title: {
                    text:
                        'Base 100',

                    font: {
                        color:
                            '#ffffff'
                    }
                },

                gridcolor:
                    'rgba(255,255,255,0.10)',

                zerolinecolor:
                    'rgba(255,255,255,0.20)',

                color:
                    '#ffffff',

                tickfont: {
                    color:
                        '#ffffff'
                },

                automargin:
                    true
            },

            hovermode:
                'x unified',

            margin: {
                t: 15,
                r: 25,
                b: 50,
                l: 60
            },

            legend: {
                x: 0.01,
                y: 0.99,

                bgcolor:
                    'rgba(15,23,41,0.92)',

                bordercolor:
                    'rgba(255,255,255,0.20)',

                borderwidth: 1,

                font: {
                    size: 11,
                    color:
                        '#ffffff'
                }
            },

            autosize: true
        };

        Plotly.react(
            elemento,
            traces,
            layout,
            {
                responsive: true,

                displayModeBar:
                    true,

                displaylogo:
                    false,

                modeBarButtonsToRemove: [
                    'lasso2d',
                    'select2d'
                ]
            }
        );
    }
};