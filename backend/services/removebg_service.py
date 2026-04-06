"""
5.2. Серверный слой интеграции с Remove.bg API.
5.3. Ключи через переменные окружения.
5.4. Таймауты, повторные попытки, rate limiting.
5.5. Нормализация ответа.

Архитектура: Adapter pattern.
RemoveBgService — единственная точка контакта с внешним API.
Остальной код работает только с нашими типами (bytes in → bytes out).
"""

import time
import logging
from typing import Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
# 5.5. Нормализованный ответ — наш внутренний формат
# ══════════════════════════════════════════════════════════════════
# WHY: Внешний API может менять формат ответа, добавлять поля,
# менять коды ошибок. Нормализация изолирует наш код от этого.
# Если завтра заменим Remove.bg на другой сервис — меняем только
# этот файл, остальной код не трогаем.
# ══════════════════════════════════════════════════════════════════


class RemoveBgResult:
    """Нормализованный результат от Remove.bg API."""

    def __init__(
        self,
        success: bool,
        image_data: Optional[bytes] = None,
        error_message: Optional[str] = None,
        credits_remaining: Optional[int] = None,
        image_width: Optional[int] = None,
        image_height: Optional[int] = None,
    ):
        self.success = success
        self.image_data = image_data
        self.error_message = error_message
        self.credits_remaining = credits_remaining
        self.image_width = image_width
        self.image_height = image_height

    def __repr__(self) -> str:
        if self.success:
            size = len(self.image_data) if self.image_data else 0
            return f"<RemoveBgResult success=True size={size} credits={self.credits_remaining}>"
        return f"<RemoveBgResult success=False error='{self.error_message}'>"


class RemoveBgError(Exception):
    """Базовое исключение для ошибок Remove.bg."""

    pass


class RemoveBgRateLimitError(RemoveBgError):
    """Rate limit exceeded — нужно подождать."""

    def __init__(self, retry_after: int = 60):
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after}s")


class RemoveBgQuotaError(RemoveBgError):
    """Лимит бесплатных запросов исчерпан."""

    pass


class RemoveBgService:
    """
    5.2. Adapter для Remove.bg API.

    Принципы:
    - Один класс = одна ответственность (интеграция с Remove.bg)
    - Все настройки из environment (5.3)
    - Retry с exponential backoff (5.4)
    - Rate limiting на нашей стороне (5.4)
    - Нормализация ответа в RemoveBgResult (5.5)
    """

    API_URL = "https://api.remove.bg/v1.0/removebg"

    # ══════════════════════════════════════════════════════════════
    # 5.4. Rate limiting на нашей стороне
    # ══════════════════════════════════════════════════════════════
    # WHY: Remove.bg бесплатный tier = 50 запросов/месяц.
    # Без ограничения один пользователь может сжечь весь лимит.
    # Простой token bucket: MAX_REQUESTS_PER_MINUTE запросов в минуту.
    # ══════════════════════════════════════════════════════════════

    def __init__(self):
        self.api_key = settings.REMOVEBG_API_KEY
        self.enabled = bool(self.api_key and self.api_key != "")
        self.timeout = settings.REMOVEBG_TIMEOUT_SECONDS
        self.max_retries = settings.REMOVEBG_MAX_RETRIES
        self.max_requests_per_minute = settings.REMOVEBG_RATE_LIMIT_PER_MINUTE

        # Token bucket для rate limiting
        self._request_timestamps: list[float] = []

        if self.enabled:
            logger.info("[RemoveBg] Service enabled (API key configured)")
        else:
            logger.warning("[RemoveBg] Service DISABLED (no API key)")

    def is_available(self) -> bool:
        """Проверить, настроен ли сервис."""
        return self.enabled

    # ══════════════════════════════════════════════════════════════
    # 5.4. Rate limiter (token bucket)
    # ══════════════════════════════════════════════════════════════

    def _check_rate_limit(self) -> None:
        """
        Проверяет, не превышен ли лимит запросов.
        Выбрасывает RemoveBgRateLimitError если превышен.

        Алгоритм: sliding window за последнюю минуту.
        """
        now = time.time()
        window = 60.0  # 1 минута

        # Удаляем старые timestamps
        self._request_timestamps = [
            ts for ts in self._request_timestamps if now - ts < window
        ]

        if len(self._request_timestamps) >= self.max_requests_per_minute:
            oldest = self._request_timestamps[0]
            retry_after = int(window - (now - oldest)) + 1
            raise RemoveBgRateLimitError(retry_after=retry_after)

        # Записываем текущий запрос
        self._request_timestamps.append(now)

    # ══════════════════════════════════════════════════════════════
    # 5.4. Retry с exponential backoff
    # ══════════════════════════════════════════════════════════════

    def remove_background(self, image_data: bytes) -> RemoveBgResult:
        """
        Удаляет фон из изображения.

        Args:
            image_data: Байты исходного изображения (JPEG/PNG)

        Returns:
            RemoveBgResult с результатом или ошибкой

        Raises:
            RemoveBgRateLimitError: При превышении rate limit
            RemoveBgQuotaError: При исчерпании квоты API
            RemoveBgError: При других ошибках после всех retry
        """
        if not self.enabled:
            return RemoveBgResult(
                success=False,
                error_message="Remove.bg service is not configured (missing API key)",
            )

        # Проверяем наш rate limit
        self._check_rate_limit()

        last_error: Optional[str] = None

        for attempt in range(self.max_retries + 1):
            try:
                result = self._do_request(image_data)
                return result

            except RemoveBgRateLimitError:
                # Rate limit от API — не retry, а пробрасываем
                raise

            except RemoveBgQuotaError:
                # Квота исчерпана — не retry, а пробрасываем
                raise

            except httpx.TimeoutException as e:
                last_error = f"Timeout after {self.timeout}s: {str(e)}"
                logger.warning(
                    f"[RemoveBg] Timeout on attempt {attempt + 1}/{self.max_retries + 1}"
                )

            except httpx.ConnectError as e:
                last_error = f"Connection error: {str(e)}"
                logger.warning(
                    f"[RemoveBg] Connection error on attempt {attempt + 1}/{self.max_retries + 1}"
                )

            except Exception as e:
                last_error = f"Unexpected error: {str(e)}"
                logger.error(
                    f"[RemoveBg] Unexpected error on attempt {attempt + 1}: {e}",
                    exc_info=True,
                )

            # Exponential backoff: 1s, 2s, 4s
            if attempt < self.max_retries:
                backoff = 2**attempt
                logger.info(f"[RemoveBg] Retrying in {backoff}s...")
                time.sleep(backoff)

        # Все попытки исчерпаны
        return RemoveBgResult(
            success=False,
            error_message=f"Failed after {self.max_retries + 1} attempts. Last error: {last_error}",
        )

    def _do_request(self, image_data: bytes) -> RemoveBgResult:
        """
        Выполняет один HTTP-запрос к Remove.bg API.

        5.5: Нормализация ответа — парсим headers и body,
        преобразуем в наш RemoveBgResult.
        """
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                self.API_URL,
                files={"image_file": ("image.png", image_data, "image/png")},
                data={
                    "size": "auto",  # auto-detect best size
                    "type": "auto",  # auto-detect foreground type
                    "format": "png",  # PNG для прозрачности
                    "bg_color": "",  # прозрачный фон
                },
                headers={
                    "X-Api-Key": self.api_key,
                },
            )

        # ══════════════════════════════════════════════════════
        # 5.5. Нормализация: HTTP-ответ → RemoveBgResult
        # ══════════════════════════════════════════════════════

        # Парсим заголовки (Remove.bg возвращает метаданные в headers)
        credits_remaining = self._parse_int_header(
            response.headers, "X-Credits-Remaining"
        )
        result_width = self._parse_int_header(response.headers, "X-Width")
        result_height = self._parse_int_header(response.headers, "X-Height")

        # Логируем оставшиеся кредиты
        if credits_remaining is not None:
            logger.info(f"[RemoveBg] Credits remaining: {credits_remaining}")
            if credits_remaining <= 5:
                logger.warning(
                    f"[RemoveBg] LOW CREDITS WARNING: only {credits_remaining} left!"
                )

        # Обработка ошибок по HTTP-статусу
        if response.status_code == 200:
            return RemoveBgResult(
                success=True,
                image_data=response.content,
                credits_remaining=credits_remaining,
                image_width=result_width,
                image_height=result_height,
            )

        if response.status_code == 402:
            # Insufficient credits
            raise RemoveBgQuotaError(
                "Remove.bg API quota exceeded. No credits remaining."
            )

        if response.status_code == 429:
            # Rate limited by API
            retry_after = self._parse_int_header(response.headers, "Retry-After") or 60
            raise RemoveBgRateLimitError(retry_after=retry_after)

        # Парсим JSON-ошибку от API
        error_detail = self._parse_error_body(response)

        if response.status_code == 400:
            return RemoveBgResult(
                success=False,
                error_message=f"Bad request: {error_detail}",
                credits_remaining=credits_remaining,
            )

        if response.status_code in (401, 403):
            return RemoveBgResult(
                success=False,
                error_message=f"Authentication error: {error_detail}. Check REMOVEBG_API_KEY.",
                credits_remaining=credits_remaining,
            )

        # Серверные ошибки (5xx) — стоит retry
        if 500 <= response.status_code < 600:
            raise RemoveBgError(
                f"Remove.bg server error ({response.status_code}): {error_detail}"
            )

        # Неизвестный статус
        return RemoveBgResult(
            success=False,
            error_message=f"Unexpected status {response.status_code}: {error_detail}",
            credits_remaining=credits_remaining,
        )

    @staticmethod
    def _parse_int_header(headers: httpx.Headers, name: str) -> Optional[int]:
        """Безопасно парсит числовой header."""
        value = headers.get(name)
        if value is None:
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _parse_error_body(response: httpx.Response) -> str:
        """
        5.5: Парсит JSON-ошибку от Remove.bg.

        Формат ответа API:
        {
          "errors": [
            {"title": "...", "detail": "..."}
          ]
        }
        """
        try:
            data = response.json()
            errors = data.get("errors", [])
            if errors:
                parts = []
                for err in errors:
                    title = err.get("title", "")
                    detail = err.get("detail", "")
                    parts.append(f"{title}: {detail}" if detail else title)
                return "; ".join(parts)
            return str(data)
        except Exception:
            return response.text[:200] if response.text else "Unknown error"
