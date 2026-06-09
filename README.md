# Frontend

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.17.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Machine EV UI

Machine EV is rendered in a separate card and uses the dedicated
`POST /pre-round-analysis/machine-ev` endpoint.

It is not a fourth human counting system. The card shows only:

- estimated next-hand edge;
- risk if betting the table minimum;
- estimated bankroll required for that minimum.

UI behavior:

- isolated loading state for the Machine EV request;
- isolated error state for the Machine EV request;
- stale-state handling when pre-round input changes;
- protection against late/outdated responses.

Debug metrics are not shown in the UI. The feature does not suggest betting
units or betting amounts, and the wording avoids profit promises.

## In-hand seen cards and cleaner decision view

- Seen cards can also be registered during an active hand.
- Updating seen cards during a hand invalidates previous shoe-dependent reads,
	so decision analysis should be recalculated for the updated shoe.
- The in-hand "Hi-Lo counting and simulation risk" block was removed to reduce
	visual noise during decision flow.
- Human counting systems remain available in pre-round analysis.
- Machine EV remains in its separate card.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## Backlog tecnico

- Suporte visual completo a Split no fluxo guiado.
- Suporte a multiplas maos independentes apos Split.
- Regras de Double after Split por configuracao de mesa.
- Suporte a Resplit com limite configuravel.
- Regras especificas para Split de ases (hit split aces, resplit aces, etc.).
- Variacoes de regras de Split por mesa/cassino para analise visual e execucao guiada.
