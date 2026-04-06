# Backend testing guidelines

## Purpose
This directory contains backend tests for:
- service-layer unit tests
- API integration tests
- security and access-control checks
- final regression/smoke checks

## Structure
- `conftest.py` — shared fixtures, DB override, auth helpers
- `test_*_service.py` — unit tests for service layer
- `test_*_endpoints.py` — integration tests for FastAPI endpoints
- `test_validation_and_errors.py` — validation and error handling
- `test_suite_contract.py` — final critical scenario regression checks

## Naming rules
- file: `test_<domain>.py`
- class: `Test<Domain>`
- test: `test_<expected_behavior>`

Examples:
- `test_auth_service.py`
- `TestAuthService`
- `test_refresh_rotates_token`

## Test categories
Pytest markers:
- `unit` — fast isolated logic tests
- `integration` — API and DB integration tests
- `security` — access control, roles, session safety
- `slow` — long-running tests

## Isolation rules
- test DB must be isolated from dev DB
- tests must not depend on production storage
- external integrations must be mocked or stubbed
- each test must leave no shared state behind