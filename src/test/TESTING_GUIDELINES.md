# Frontend testing guidelines

## Purpose
This directory and related `*.test.ts(x)` files contain frontend tests for:
- utility functions
- React component behavior
- route protection
- session expiration handling
- UI error/loading states

## Structure
- `src/test/setup.ts` — global test setup
- `src/test/test-utils.tsx` — shared render helpers
- `src/utils/*.test.ts` — utility tests
- `src/components/*.test.tsx` — component tests
- `src/App.test.tsx` — routing and top-level app behavior
- `e2e/*.spec.ts` — browser E2E tests (separate layer, not run by Vitest)

## Naming rules
- utility tests: `<name>.test.ts`
- component tests: `<Component>.test.tsx`
- e2e tests: `<scenario>.spec.ts`

## Layer separation
- unit/component tests are run with Vitest
- E2E tests are run with Playwright
- E2E files must not be included in Vitest run

## Focus areas
Frontend tests should prioritize:
- auth flows
- route guards
- role-based UI behavior
- loading/error states
- session expiration and forced logout

## Isolation rules
- clear localStorage and sessionStorage after each test
- clear blob preview cache after each test
- mock API/fetch instead of calling real backend in component tests