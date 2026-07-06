# Markowitz Dashboard

Dashboard web para otimização de carteiras de ações brasileiras com base na Teoria Moderna do Portfólio de Harry Markowitz.

O projeto permite selecionar ativos da B3, estimar retorno e risco com dados históricos de mercado, calcular uma carteira ótima por perfil de investidor e visualizar a fronteira eficiente, a composição da carteira, métricas de risco e desempenho histórico comparativo com o Ibovespa.

---

## Demonstração

> Projeto desenvolvido como aplicação full stack para análise quantitativa de carteiras.

Principais recursos:

- Seleção de ações brasileiras negociadas na B3.
- Otimização de carteiras por perfil de investidor.
- Cálculo de retorno esperado, volatilidade, Índice de Sharpe e beta.
- Fronteira eficiente de Markowitz.
- Simulação de carteiras aleatórias.
- Comparação histórica da carteira otimizada com o Ibovespa.
- Matriz de correlação entre os ativos.
- Taxa livre de risco obtida automaticamente pela Meta Selic do Banco Central.
- Interface responsiva com gráficos interativos.

---

## Stack utilizada

### Backend

- Python
- Django
- Django REST Framework
- pandas
- numpy
- scipy
- yfinance
- requests
- gunicorn
- whitenoise

### Frontend

- HTML
- Tailwind CSS
- Alpine.js
- Plotly.js
- Chart.js

### Deploy

- Railway

---



## Metodologia e cálculos

> Este projeto tem finalidade exclusivamente educacional e analítica.  
> Os resultados apresentados não constituem recomendação de investimento, aconselhamento financeiro ou indicação de compra e venda de ativos.

O dashboard utiliza conceitos da Teoria Moderna do Portfólio, proposta por Harry Markowitz, para analisar a relação entre risco e retorno de uma carteira de ativos.

A metodologia parte dos preços históricos das ações selecionadas pelo usuário, calcula os retornos diários, estima retorno esperado, risco, matriz de covariância, Índice de Sharpe, beta e, por fim, constrói carteiras otimizadas conforme o perfil de investidor.

---

### 1. Coleta dos dados

Os preços históricos dos ativos são obtidos por meio da biblioteca `yfinance`.

Cada ativo é identificado pelo ticker usado no Yahoo Finance. Para ações brasileiras, utiliza-se o sufixo `.SA`.

Exemplo:


PETR4.SA
VALE3.SA
ITUB4.SA
WEGE3.SA


O benchmark utilizado para comparação de mercado é o Ibovespa:

```text
^BVSP
```

---

### 2. Retornos diários dos ativos

A partir da série de preços de fechamento ajustado, o retorno diário simples de cada ativo é calculado por:

$$
R_{i,t} = \frac{P_{i,t}}{P_{i,t-1}} - 1
$$

Onde:

* $R_{i,t}$ é o retorno do ativo $i$ no dia $t$;
* $P_{i,t}$ é o preço do ativo $i$ no dia $t$;
* $P_{i,t-1}$ é o preço do ativo $i$ no dia anterior.

No código, esse cálculo é feito com:

```python
retornos = precos.pct_change().dropna()
```

---

### 3. Retorno esperado anualizado

O retorno médio diário de cada ativo é anualizado considerando 252 dias úteis por ano:

$$
\mu_i = \bar{R_i} \times 252
$$

Onde:

* $\mu_i$ é o retorno esperado anualizado do ativo $i$;
* $\bar{R_i}$ é o retorno médio diário do ativo $i$;
* 252 representa o número aproximado de pregões em um ano.

Para uma carteira com vários ativos, o retorno esperado é dado por:

$$
E(R_p) = w' \mu
$$

Ou, de forma expandida:

$$
E(R_p) = \sum_{i=1}^{n} w_i \mu_i
$$

Onde:

* $E(R_p)$ é o retorno esperado da carteira;
* $w_i$ é o peso do ativo $i$ na carteira;
* $\mu_i$ é o retorno esperado anualizado do ativo $i$;
* $n$ é o número de ativos na carteira.

---

### 4. Matriz de covariância anualizada

A matriz de covariância mede como os retornos dos ativos se movimentam conjuntamente.

Primeiro, calcula-se a matriz de covariância diária dos retornos. Depois, ela é anualizada:

$$
\Sigma_{anual} = \Sigma_{diária} \times 252
$$

Onde:

* $\Sigma$ representa a matriz de covariância dos retornos;
* 252 representa o número aproximado de pregões em um ano.

A matriz de covariância é essencial para medir o risco total da carteira, pois considera não apenas a volatilidade individual dos ativos, mas também a correlação entre eles.

---

### 5. Volatilidade da carteira

A volatilidade da carteira é usada como medida de risco.

Ela é calculada por:

$$
\sigma_p = \sqrt{w' \Sigma w}
$$

Onde:

* $\sigma_p$ é a volatilidade anualizada da carteira;
* $w$ é o vetor de pesos dos ativos;
* $\Sigma$ é a matriz de covariância anualizada dos retornos.

De forma intuitiva, a volatilidade mede o grau de oscilação esperado da carteira. Quanto maior a volatilidade, maior o risco estimado.

---

### 6. Restrições da otimização

O projeto considera uma carteira comprada, sem venda a descoberto.

As restrições utilizadas são:

$$
\sum_{i=1}^{n} w_i = 1
$$

e

$$
0 \leq w_i \leq 1
$$

Ou seja:

* a soma dos pesos deve ser igual a 100%;
* nenhum ativo pode ter peso negativo;
* nenhum ativo pode ter peso superior a 100%.

---

### 7. Carteira de mínima variância

A carteira de mínima variância é aquela que apresenta o menor risco possível dentro do conjunto de ativos selecionados.

O problema de otimização é:

$$
\min_w \sigma_p
$$

Sujeito a:

$$
\sum_{i=1}^{n} w_i = 1
$$

e

$$
0 \leq w_i \leq 1
$$

No dashboard, essa carteira é associada ao perfil conservador.

---

### 8. Taxa livre de risco

A taxa livre de risco é usada no cálculo do Índice de Sharpe.

Neste projeto, a taxa livre de risco é obtida automaticamente a partir da Meta Selic, usando a série SGS 432 do Banco Central do Brasil.

A API retorna a taxa em percentual. Por exemplo:

```text
14.25
```

O sistema converte esse valor para decimal:

```text
0.1425
```

Caso a API esteja indisponível, o projeto utiliza um valor de fallback configurado por variável de ambiente:

```env
TAXA_LIVRE_RISCO=0.1425
BCB_SERIE_META_SELIC=432
```

---

### 9. Índice de Sharpe

O Índice de Sharpe mede o retorno excedente da carteira em relação à taxa livre de risco, ajustado pelo risco.

A fórmula é:

$$
Sharpe = \frac{E(R_p) - R_f}{\sigma_p}
$$

Onde:

* $E(R_p)$ é o retorno esperado da carteira;
* $R_f$ é a taxa livre de risco;
* $\sigma_p$ é a volatilidade da carteira.

Quanto maior o Sharpe, melhor é a relação entre retorno e risco.

No dashboard, a carteira de maior Sharpe é associada ao perfil moderado.

---

### 10. Carteira de máximo Sharpe

A carteira de máximo Sharpe é obtida resolvendo o seguinte problema:

$$
\max_w \frac{E(R_p) - R_f}{\sigma_p}
$$

Como os algoritmos numéricos geralmente minimizam funções, o projeto minimiza o Sharpe negativo:

$$
\min_w -Sharpe
$$

Sujeito a:

$$
\sum_{i=1}^{n} w_i = 1
$$

e

$$
0 \leq w_i \leq 1
$$

---

### 11. Carteira arrojada

Para o perfil arrojado, o projeto busca uma carteira com retorno esperado mais elevado dentro da fronteira eficiente.

A lógica utilizada é definir um retorno-alvo entre o retorno da carteira de mínima variância e o maior retorno esperado individual entre os ativos.

O retorno-alvo é definido por:

$$
R_{alvo} = R_{min} + \alpha (R_{max} - R_{min})
$$

Onde:

* $R_{alvo}$ é o retorno desejado para a carteira arrojada;
* $R_{min}$ é o retorno da carteira de mínima variância;
* $R_{max}$ é o maior retorno esperado entre os ativos;
* $\alpha$ é uma fração definida no modelo.

No projeto, utiliza-se:

$$
\alpha = 0.80
$$

Assim, a carteira arrojada é posicionada em uma região de maior retorno esperado da fronteira eficiente.

---

### 12. Fronteira eficiente

A fronteira eficiente representa o conjunto de carteiras que oferecem o maior retorno esperado possível para cada nível de risco, ou o menor risco possível para cada nível de retorno.

Para construir a fronteira, o projeto resolve sucessivos problemas de otimização com diferentes retornos-alvo:

$$
\min_w \sigma_p
$$

Sujeito a:

$$
E(R_p) = R_{alvo}
$$

$$
\sum_{i=1}^{n} w_i = 1
$$

$$
0 \leq w_i \leq 1
$$

Cada ponto da fronteira representa uma carteira eficiente.

---

### 13. Carteiras simuladas

Além da fronteira eficiente, o projeto gera carteiras aleatórias para representar o conjunto viável de combinações entre os ativos.

Os pesos são gerados aleatoriamente respeitando a restrição de soma igual a 1:

$$
\sum_{i=1}^{n} w_i = 1
$$

Para cada carteira simulada, são calculados:

* retorno esperado;
* volatilidade;
* relação risco-retorno.

Essas simulações ajudam a visualizar a posição da carteira ótima em relação a outras combinações possíveis.

---

### 14. Beta da carteira

O beta mede a sensibilidade da carteira em relação ao mercado.

No projeto, o mercado é representado pelo Ibovespa.

A fórmula do beta é:

$$
\beta_p = \frac{Cov(R_p, R_m)}{Var(R_m)}
$$

Onde:

* $\beta_p$ é o beta da carteira;
* $R_p$ é o retorno da carteira;
* $R_m$ é o retorno do mercado;
* $Cov(R_p, R_m)$ é a covariância entre o retorno da carteira e o retorno do mercado;
* $Var(R_m)$ é a variância do retorno do mercado.

Interpretação:

* $\beta < 1$: carteira menos sensível que o mercado;
* $\beta \approx 1$: carteira próxima ao comportamento do mercado;
* $\beta > 1$: carteira mais sensível que o mercado.

---

### 15. Matriz de correlação

A matriz de correlação mostra o grau de associação linear entre os retornos dos ativos.

A correlação entre dois ativos $i$ e $j$ é calculada por:

$$
\rho_{ij} = \frac{Cov(R_i, R_j)}{\sigma_i \sigma_j}
$$

Onde:

* $\rho_{ij}$ é a correlação entre os ativos $i$ e $j$;
* $Cov(R_i, R_j)$ é a covariância entre os retornos dos ativos;
* $\sigma_i$ é a volatilidade do ativo $i$;
* $\sigma_j$ é a volatilidade do ativo $j$.

A correlação varia entre -1 e 1:

* valores próximos de 1 indicam que os ativos tendem a se mover na mesma direção;
* valores próximos de -1 indicam movimentos em direções opostas;
* valores próximos de 0 indicam baixa relação linear.

---

### 16. Histórico comparativo em base 100

O projeto também reconstrói o desempenho histórico da carteira otimizada e compara com o Ibovespa.

A série começa em base 100:

$$
V_0 = 100
$$

Para cada período seguinte:

$$
V_t = V_{t-1} \times (1 + R_t)
$$

Onde:

* $V_t$ é o valor do índice no período $t$;
* $V_{t-1}$ é o valor do índice no período anterior;
* $R_t$ é o retorno no período $t$.

Esse cálculo permite comparar a evolução relativa da carteira e do Ibovespa em uma mesma escala.

Importante: esse histórico não representa uma recomendação de investimento nem uma garantia de desempenho futuro. Ele apenas mostra como a carteira calculada teria se comportado no período analisado, com base nos dados disponíveis.

---

## Observações importantes

Este projeto possui finalidade educacional. Os resultados dependem dos ativos selecionados, do período de análise e da qualidade dos dados disponíveis.

A otimização de Markowitz é sensível às estimativas de retorno esperado e covariância. Pequenas mudanças nos dados podem gerar alterações relevantes nos pesos finais da carteira.

Além disso, o modelo não considera diretamente:

* custos de transação;
* impostos;
* liquidez;
* spread de compra e venda;
* dividendos de forma detalhada;
* restrições regulatórias;
* preferências individuais do investidor;
* objetivos financeiros específicos;
* tolerância real ao risco.

Portanto, os resultados devem ser interpretados como uma simulação educacional e não como recomendação financeira.

