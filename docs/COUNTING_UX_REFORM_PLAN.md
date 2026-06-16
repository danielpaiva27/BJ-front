# Counting UX Reform Plan

## Estado atual da tela

- Tela principal: `src/app/app.component.ts`, `app.component.html` e `app.component.scss`.
- Configuracoes iniciais: `AppComponent.config`, `defaultConfig` e bloco de setup em `app.component.html`.
- Estado de mesa/rodada: `BlackjackTableState` em `src/app/models/blackjack-table.models.ts`.
- Registro de cartas: `registerCardAction`, `undoLastRegisteredCard`, `resetRound`, `resetShoe` em `src/app/utils/blackjack-table.utils.ts`.
- Contagem Hi-Lo em tempo real: `computeLiveShoeCounting` usando `tableState.seenCards`.
- Historico atual: `tableState.history` com `RegisteredCardAction`.
- Mao atual: `tableState.playerCards`, `tableState.dealerUpcard` e `tableState.dealerRevealedCards`.
- Analise de decisao: `AppComponent.analyzeCurrentDecision()` chama `/analyze-hand`.
- Analise pre-rodada: `AppComponent.analyzePreRound()` chama `/pre-round-analysis`.
- Machine EV: `AppComponent.analyzePreRound()` tambem chama `/pre-round-analysis/machine-ev`.
- Endpoints: `src/app/services/blackjack-analysis.service.ts`.
- Testes principais: `src/app/app.component.spec.ts`, `src/app/utils/blackjack-table.utils.spec.ts`, `src/app/services/blackjack-analysis.service.spec.ts`.

## Partes reaproveitadas

- Modelos de carta e contratos de API existentes.
- Utilitarios de avaliacao de mao e contagem Hi-Lo leve.
- Estado de shoe, decremento de cartas e historico legado.
- Servico `BlackjackAnalysisService` e os endpoints atuais.
- Testes existentes de fluxo guiado, servico e utilitarios da mesa.

## Partes a rebaixar no futuro

- Fluxo guiado rigido de rodada como experiencia principal.
- Analise automatica/acoplada ao avanco da rodada.
- Dependencia visual da mao jogador/dealer como centro da tela.
- Machine EV dentro do bloco de pre-rodada automatico.

## Centro da nova UX

- Tela counting-first depois do setup.
- Registro rapido de cartas vistas como modo principal.
- Contagens em tempo real como informacao primaria.
- Mao hipotetica opcional para decisao sob demanda.
- Analises custosas somente por acao explicita do usuario.

## Etapa 2 - layout counting-first

- Status do shoe permanece no topo apos o setup.
- Hi-Lo em tempo real virou o painel principal de contagem.
- Hi-Opt II e Wong Halves ficaram reservados como placeholders nesta etapa e foram substituidos por contagens reais na Etapa 3.
- Registro de cartas vistas fica logo abaixo do painel de contagem.
- Situacao hipotetica e analise aprofundada aparecem como areas preparadas, sem chamadas novas de API.
- Fluxo classico de rodada foi mantido como secao secundaria.

## Etapa 3 - contagens em tempo real

- Hi-Lo, Hi-Opt II e Wong Halves passam a ser calculados localmente no painel de contagem.
- Hi-Opt II mostra ace side count com ases vistos e restantes.
- Wong Halves usa meias unidades internamente para evitar deriva decimal.
- Machine EV nao roda automaticamente.
- Analise aprofundada continua preparada como placeholder para etapa futura.

## Etapa 4 - modos de entrada de cartas

- Modos Carta vista, Jogador e Dealer foram ativados no registro de cartas da area counting.
- Carta registrada em Jogador/Dealer tambem entra na contagem geral do shoe.
- Situacao hipotetica agora reflete cartas reais de jogador e dealer com total, bust e upcard.
- Limpar maos limpa somente a mao hipotetica e nao desfaz contagem/seen cards.
- Analise de decisao real continua reservada para etapa futura.

## Etapa 5 - desfazer e robustez da mao hipotetica

- Desfazer ultima carta foi adicionado no painel de contagem com rollback em contagem, shoe e historico.
- Historico visual simples de ultimas cartas foi incluido com destino claro (Carta vista, Jogador, Dealer).
- Limpar maos segue separado de desfazer contagem: limpa apenas a situacao hipotetica.
- Situacao hipotetica ganhou status explicito (incompleta, pronta, estourada), tipo de mao (hard/soft) e mensagens de bloqueio.
- Analise de decisao real continua para etapa futura.

## Etapa 6 - analise de decisao sob demanda na mao hipotetica

- O botao Analisar decisao da area hipotetica agora chama /analyze-hand reutilizando o servico e contrato ja existentes.
- O payload usa player_hand e dealer_upcard da mao hipotetica e seen_cards da contagem atual do shoe, sem mudancas de backend.
- A area hipotetica ganhou estados proprios de loading, erro e resultado, sem interferir no fluxo classico de analise da rodada.
- O resultado exibe acao recomendada, EV/confianca e ranking de acoes para a mao hipotetica.
- Mudancas nas cartas de jogador/dealer limpam o resultado; novas cartas vistas mantem o resultado e marcam como desatualizado ate nova analise.

## Etapa 7 - analise aprofundada dos metodos sob demanda

- A seção Análise aprofundada foi ativada para chamada sob demanda dos métodos humanos (Hi-Lo, Hi-Opt II, Wong Halves) e da Machine EV.
- Machine EV continua estritamente sob demanda: não roda automaticamente a cada carta, desfazer ou limpar mãos.
- Resultados exibem apenas campos públicos (edge, status, risco da aposta mínima, banca necessária e warnings quando disponíveis).
- Resultados ficam desatualizados (stale) quando shoe/config/regras mudam após a última execução.
- Métricas de debug e qualquer sugestão de aposta/unidades não são exibidas nesta área.

## Estado final da Counting UX

- A experiência principal da tela é counting-first, com contagens em tempo real e registro rápido de cartas vistas.
- A mão hipotética é opcional e permite análise de decisão somente sob demanda, sem acionar análises pesadas automaticamente.
- A análise aprofundada compara métodos humanos e Machine EV apenas quando solicitada, com resultados públicos e sem campos internos.
- Estados de desatualização (stale), loading e erro ficam isolados por contexto para evitar mistura entre fluxos.
- O fluxo clássico de rodada permanece disponível como compatibilidade, explícito como secundário.
- Microcopy e controles principais foram polidos para reforçar clareza acadêmica/simulacional e acessibilidade básica.

## Proximas etapas

1. Counting UX 1 - Diagnostico e estado base
2. Counting UX 2 - Layout counting-first
3. Counting UX 3 - Contagens em tempo real Hi-Lo/Hi-Opt II/Wong Halves
4. Counting UX 4 - Modos de entrada de cartas
5. Counting UX 5 - Mao hipotetica + reset/desfazer
6. Counting UX 6 - Analise de decisao sob demanda
7. Counting UX 7 - Analise aprofundada dos metodos
8. Counting UX 8 - Limpeza, testes e polimento
