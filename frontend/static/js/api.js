const API_BASE = '/api';

const APIService = {
    async processarResposta(
        resposta,
        mensagemPadrao
    ) {
        let dados;

        try {
            dados = await resposta.json();
        } catch (erroJson) {
            console.error(
                'A API não retornou um JSON válido:',
                erroJson
            );

            throw new Error(
                mensagemPadrao ||
                'A API retornou uma resposta inválida.'
            );
        }

        if (!resposta.ok) {
            const mensagemErro =
                dados?.erro ||
                dados?.error ||
                dados?.detail ||
                mensagemPadrao ||
                'Ocorreu um erro na requisição.';

            throw new Error(mensagemErro);
        }

        return dados;
    },

    validarTickers(
        tickers,
        quantidadeMinima = 1
    ) {
        if (!Array.isArray(tickers)) {
            throw new Error(
                'A lista de ativos é inválida.'
            );
        }

        const tickersValidos = tickers
            .map(function (ticker) {
                return String(ticker)
                    .trim()
                    .toUpperCase();
            })
            .filter(function (ticker) {
                return ticker.length > 0;
            });

        if (
            tickersValidos.length <
            quantidadeMinima
        ) {
            throw new Error(
                quantidadeMinima === 1
                    ? 'Nenhum ativo foi informado.'
                    : 'Selecione pelo menos dois ativos.'
            );
        }

        return [
            ...new Set(tickersValidos)
        ];
    },

    validarPeriodo(periodo) {
        const periodosPermitidos = [
            '3mo',
            '6mo',
            '1y'
            
        ];

        if (
            !periodosPermitidos.includes(
                periodo
            )
        ) {
            return '1y';
        }

        return periodo;
    },

    validarPerfil(perfil) {
        const perfisPermitidos = [
            'conservador',
            'moderado',
            'arrojado'
        ];

        const perfilNormalizado =
            String(
                perfil || ''
            )
                .trim()
                .toLowerCase();

        if (
            !perfisPermitidos.includes(
                perfilNormalizado
            )
        ) {
            return 'moderado';
        }

        return perfilNormalizado;
    },

    async analisarCarteira(
        tickers,
        periodo = '1y',
        perfil = 'moderado'
    ) {
        const tickersValidos =
            this.validarTickers(
                tickers,
                2
            );

        const periodoValido =
            this.validarPeriodo(
                periodo
            );

        const perfilValido =
            this.validarPerfil(
                perfil
            );

        const resposta = await fetch(
            `${API_BASE}/analisar-carteira/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    tickers: tickersValidos,
                    periodo: periodoValido,
                    perfil: perfilValido
                })
            }
        );

        return this.processarResposta(
            resposta,
            'Não foi possível analisar a carteira.'
        );
    },

    async otimizarCarteira(
        tickers,
        periodo = '1y',
        perfil = 'moderado'
    ) {
        const tickersValidos =
            this.validarTickers(
                tickers,
                1
            );

        const periodoValido =
            this.validarPeriodo(
                periodo
            );

        const perfilValido =
            this.validarPerfil(
                perfil
            );

        const resposta = await fetch(
            `${API_BASE}/otimizar-carteira/`,
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json',

                    'Accept':
                        'application/json'
                },

                body: JSON.stringify({
                    tickers:
                        tickersValidos,

                    periodo:
                        periodoValido,

                    perfil:
                        perfilValido
                })
            }
        );

        return this.processarResposta(
            resposta,
            'Não foi possível otimizar a carteira.'
        );
    },

    async calcularFronteira(
        tickers,
        periodo = '1y',
        perfil = 'moderado'
    ) {
        const tickersValidos =
            this.validarTickers(
                tickers,
                2
            );

        const periodoValido =
            this.validarPeriodo(
                periodo
            );

        const perfilValido =
            this.validarPerfil(
                perfil
            );

        const resposta = await fetch(
            `${API_BASE}/fronteira-eficiente/`,
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json',

                    'Accept':
                        'application/json'
                },

                body: JSON.stringify({
                    tickers:
                        tickersValidos,

                    periodo:
                        periodoValido,

                    perfil:
                        perfilValido
                })
            }
        );

        return this.processarResposta(
            resposta,
            'Não foi possível calcular a fronteira eficiente.'
        );
    },

    async buscarInformacoesAtivos(
        tickers
    ) {
        const tickersValidos =
            this.validarTickers(
                tickers,
                1
            );

        const parametroTickers =
            encodeURIComponent(
                tickersValidos.join(',')
            );

        const resposta = await fetch(
            `${API_BASE}/info-ativos/?tickers=${parametroTickers}`,
            {
                method: 'GET',

                headers: {
                    'Accept':
                        'application/json'
                }
            }
        );

        return this.processarResposta(
            resposta,
            'Não foi possível buscar as informações dos ativos.'
        );
    }
};