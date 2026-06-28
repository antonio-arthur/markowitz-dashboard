const API_BASE = '/api';

const APIService = {
    async otimizarCarteira(tickers, periodo) {
        const response = await fetch(API_BASE + '/otimizar-carteira/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers, periodo })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.erro || 'Erro na otimizacao');
        }
        
        return await response.json();
    },
    
    async calcularFronteira(tickers) {
        const response = await fetch(API_BASE + '/fronteira-eficiente/', {
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
