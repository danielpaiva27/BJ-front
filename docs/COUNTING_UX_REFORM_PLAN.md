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

## Proximas etapas

1. Counting UX 1 - Diagnostico e estado base
2. Counting UX 2 - Layout counting-first
3. Counting UX 3 - Contagens em tempo real Hi-Lo/Hi-Opt II/Wong Halves
4. Counting UX 4 - Modos de entrada de cartas
5. Counting UX 5 - Mao hipotetica + reset/desfazer
6. Counting UX 6 - Analise de decisao sob demanda
7. Counting UX 7 - Analise aprofundada dos metodos
8. Counting UX 8 - Limpeza, testes e polimento
