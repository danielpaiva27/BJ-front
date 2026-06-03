import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { AnalyzeHandResponse } from './models/blackjack-analysis.models';
import { BlackjackAnalysisService } from './services/blackjack-analysis.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let blackjackAnalysisServiceSpy: jasmine.SpyObj<BlackjackAnalysisService>;

  beforeEach(async () => {
    blackjackAnalysisServiceSpy = jasmine.createSpyObj<BlackjackAnalysisService>('BlackjackAnalysisService', ['analyzeHand']);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: BlackjackAnalysisService, useValue: blackjackAnalysisServiceSpy }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should load default setup values', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.config.number_of_decks).toBe(6);
    expect(app.config.blackjack_payout).toBe('3:2');
    expect(app.config.risk_profile).toBe('moderate');
  });

  it('should render setup section before starting shoe', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Blackjack Risk Engine');
    expect(compiled.textContent).toContain('Iniciar shoe');
  });

  it('should render academic warning and visual shoe counters after starting shoe', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('ferramenta academica e simulacional');
    expect(compiled.textContent).toContain('Cartas restantes no shoe');
    expect(compiled.textContent).toContain('Cartas registradas');
  });

  it('should start shoe and change phase to card registration', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(app.tableState.gamePhase).toBe('shoe_active');
    expect(compiled.textContent).toContain('Fase de registro de cartas');
  });

  it('should register card in selected target and decrement count', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.selectTarget('seen');
    app.registerCard('10');

    const tenCount = app.tableState.shoeCounts.find((item) => item.value === '10')?.count;
    expect(app.tableState.seenCards).toEqual(['10']);
    expect(tenCount).toBe(95);
    expect(app.cardRegistrationError).toBe('');
  });

  it('should prevent registering a second dealer_upcard', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.selectTarget('dealer_upcard');
    app.registerCard('10');
    app.registerCard('9');

    expect(app.tableState.dealerUpcard).toBe('10');
    expect(app.cardRegistrationError).toContain('already defined');
  });

  it('should register dealer_revealed into separate section and seen cards', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.selectTarget('dealer_revealed');
    app.registerCard('8');

    expect(app.tableState.dealerRevealedCards).toEqual(['8']);
    expect(app.tableState.seenCards).toEqual(['8']);
  });

  it('should set player target and guidance on Hit', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.onHit();

    expect(app.tableState.selectedTarget).toBe('player');
    expect(app.actionGuidance).toContain('Hit selecionado');
  });

  it('should move to dealer reveal flow on Stand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.onStand();

    expect(app.tableState.selectedTarget).toBe('dealer_revealed');
    expect(app.visualRoundPhase).toBe('dealer_reveal');
  });

  it('should lock player cards after one card when Double is selected', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.onDouble();
    app.registerCard('9');
    app.registerCard('8');

    expect(app.playerCardsLocked).toBeTrue();
    expect(app.tableState.playerCards).toEqual(['9']);
    expect(app.cardRegistrationError).toContain('bloqueada apos Double');
  });

  it('should finalize visual round on Surrender', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.onSurrender();

    expect(app.visualRoundPhase).toBe('round_finished');
    expect(app.actionGuidance).toContain('Surrender registrado');
  });

  it('should call API and store response when decision analysis succeeds', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const apiResponse: AnalyzeHandResponse = {
      recommendation: {
        best_action: 'hit',
        monte_carlo_action: 'hit',
        basic_strategy_action: 'stand',
        strategy_agreement: false,
        confidence: 0.42,
        explanation: 'Resposta de teste',
      },
    };
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(of(apiResponse));

    app.startShoe();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.selectTarget('dealer_upcard');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(blackjackAnalysisServiceSpy.analyzeHand).toHaveBeenCalled();
    expect(app.analysisResponse).toEqual(apiResponse);
    expect(app.analysisError).toBe('');
    expect(app.analysisLoading).toBeFalse();
  });

  it('should disable analyze button while loading', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.analysisLoading = true;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('#analyze-button') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
  });

  it('should block analysis when player has fewer than 2 cards', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.selectTarget('player');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
    expect(app.analysisError).toContain('registre pelo menos 2 cartas do jogador');
  });

  it('should block analysis when dealer_upcard is not defined', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.startShoe();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.analyzeCurrentDecision();

    expect(blackjackAnalysisServiceSpy.analyzeHand).not.toHaveBeenCalled();
    expect(app.analysisError).toContain('defina a dealer_upcard');
  });

  it('should show friendly error when API analysis fails', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(throwError(() => new Error('API unavailable')));

    app.startShoe();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.selectTarget('dealer_upcard');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(blackjackAnalysisServiceSpy.analyzeHand).toHaveBeenCalled();
    expect(app.analysisResponse).toBeNull();
    expect(app.analysisError).toContain('Ocorreu um erro ao processar a analise');
    expect(app.analysisLoading).toBeFalse();
  });

  it('should show backend offline message when API is unreachable', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' })),
    );

    app.startShoe();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.selectTarget('dealer_upcard');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(app.analysisError).toBe('Nao foi possivel conectar a API. Verifique se o backend esta rodando.');
  });

  it('should show validation message for 422 response', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    blackjackAnalysisServiceSpy.analyzeHand.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 422, statusText: 'Unprocessable Entity' })),
    );

    app.startShoe();
    app.selectTarget('player');
    app.registerCard('10');
    app.registerCard('6');
    app.selectTarget('dealer_upcard');
    app.registerCard('10');
    app.analyzeCurrentDecision();

    expect(app.analysisError).toBe('Entrada invalida. Confira as cartas e os parametros da simulacao.');
  });

  it('should render decision panel with recommended action and ranking metrics', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const apiResponse: AnalyzeHandResponse = {
      actions: [
        {
          action: 'stand',
          ev: 0.12,
          win_rate: 0.45,
          lose_rate: 0.43,
          push_rate: 0.12,
          simulations: 1000,
          wins: 450,
          losses: 430,
          pushes: 120,
          std_dev: 1,
          standard_error: 0.01,
          confidence_interval_95: [0.1, 0.14],
        },
      ],
      recommendation: {
        best_action: 'stand',
        monte_carlo_action: 'stand',
        basic_strategy_action: 'stand',
        strategy_agreement: true,
        confidence: 0.8,
        explanation: 'Melhor acao por valor esperado.',
      },
    };

    app.startShoe();
    app.analysisResponse = apiResponse;
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Painel de decisoes da engine');
    expect(compiled.textContent).toContain('Decisao recomendada:');
    expect(compiled.textContent).toContain('stand');
    expect(compiled.textContent).toContain('+0.1200');
    expect(compiled.textContent).toContain('indisponivel nesta simulacao');
  });
});
