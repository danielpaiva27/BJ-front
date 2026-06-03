export interface GlossaryEntry {
  term: string;
  popularTerm: string;
  explanation: string;
  note?: string;
}

export const GLOSSARY = {
  shoe: {
    term: 'Shoe',
    popularTerm: 'Conjunto de baralhos em uso',
    explanation: 'No blackjack, o shoe é o conjunto de decks embaralhados usado para distribuir cartas.',
    note: 'Quando um novo shoe começa, a contagem e as cartas vistas são reiniciadas.',
  },
  expectedValue: {
    term: 'Valor esperado / EV',
    popularTerm: 'Média esperada de resultado',
    explanation: 'Estimativa do resultado médio de uma decisão após muitas simulações.',
    note: 'EV positivo não garante vitória; EV negativo não garante derrota.',
  },
  theoreticalExposure: {
    term: 'Exposição teórica',
    popularTerm: 'Sugestão de aposta',
    explanation: 'Quantidade simulada de unidades que o modelo indicaria expor.',
    note: 'Usamos esse termo porque o projeto não recomenda apostas reais.',
  },
  theoreticalUnits: {
    term: 'Unidades teóricas',
    popularTerm: 'Unidades de aposta fictícias',
    explanation: 'Medida simulada usada para comparar tamanhos de exposição sem usar dinheiro real.',
  },
  simulatedEquivalent: {
    term: 'Equivalente simulado',
    popularTerm: 'Conversao ficticia das unidades',
    explanation: 'Valor convertido das unidades teoricas usando a unidade base simulada.',
    note: 'Nao representa aposta real; e apenas leitura academica da exposicao no simulador.',
  },
  simulatedBankroll: {
    term: 'Banca simulada',
    popularTerm: 'Dinheiro fictício disponível',
    explanation: 'Valor usado apenas dentro da simulação para calcular risco e exposição.',
  },
  baseUnit: {
    term: 'Unidade base',
    popularTerm: 'Aposta mínima simulada',
    explanation: 'Referência usada para calcular unidades teóricas.',
  },
  simulations: {
    term: 'Simulações',
    popularTerm: 'Rodadas simuladas',
    explanation: 'Quantidade de rodadas simuladas para estimar o valor esperado.',
    note: 'Quanto maior, mais estável tende a ser o resultado, mas maior o tempo de processamento.',
  },
  runningCount: {
    term: 'Running count',
    popularTerm: 'Contagem atual',
    explanation: 'Soma das cartas vistas usando o sistema Hi-Lo.',
  },
  trueCount: {
    term: 'True count',
    popularTerm: 'Contagem ajustada',
    explanation: 'Running count dividido pela quantidade aproximada de decks restantes.',
  },
  hiLo: {
    term: 'Hi-Lo',
    popularTerm: 'Método de contagem de cartas',
    explanation: 'Sistema em que cartas 2 a 6 valem +1, 7 a 9 valem 0, e 10/A valem -1.',
  },
  pushRate: {
    term: 'Push rate',
    popularTerm: 'Taxa de empate',
    explanation: 'Porcentagem de simulações em que jogador e dealer empataram.',
  },
  winRate: {
    term: 'Win rate',
    popularTerm: 'Taxa de vitória',
    explanation: 'Porcentagem de simulações em que a ação venceu.',
  },
  loseRate: {
    term: 'Lose rate',
    popularTerm: 'Taxa de derrota',
    explanation: 'Porcentagem de simulações em que a ação perdeu.',
  },
  simulationConfidence: {
    term: 'Confiança da simulação',
    popularTerm: 'Grau de segurança estatística',
    explanation: 'Indicador aproximado de quão separada a melhor ação ficou das alternativas na simulação.',
    note: 'Não representa certeza de resultado; apenas resume a estabilidade da recomendação simulada.',
  },
  nextRoundKeepingShoe: {
    term: 'Nova rodada mantendo shoe atual',
    popularTerm: 'Limpar apenas a mesa',
    explanation: 'Limpa a mão do jogador, a carta aberta do dealer e as cartas reveladas da rodada.',
    note: 'Mantém cartas vistas e contagem do shoe atual.',
  },
  newShoeShuffle: {
    term: 'Novo shoe / embaralhar',
    popularTerm: 'Recomeçar o conjunto de baralhos',
    explanation: 'Reinicia o shoe completo e restaura a quantidade inicial de cartas por valor.',
    note: 'Zera cartas vistas, contagem e histórico da rodada.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryTermKey = keyof typeof GLOSSARY;
