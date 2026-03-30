/**
 * 4.2. Простой in-memory кэш для blob-превью.
 *
 * WHY: DashboardPage загружает превью изображений через downloadMedia().
 * При каждой смене фильтров ВСЕ превью перезагружаются, даже если
 * файл уже был скачан. Кэш хранит blob URL и переиспользует их.
 *
 * Edge cases:
 * - Ограничение размера: максимум 100 записей, при переполнении
 *   удаляется самая старая (LRU-подобное поведение)
 * - При unmount компонента вызывается cleanup() для освобождения памяти
 * - blob URL валиден пока жива страница (не сохраняется между сессиями)
 */

const MAX_CACHE_SIZE = 100;

interface CacheEntry {
  url: string;
  timestamp: number;
}

class BlobCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * Получить blob URL из кэша.
   * Возвращает null если не найден.
   */
  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (entry) {
      // Обновляем timestamp для LRU
      entry.timestamp = Date.now();
      return entry.url;
    }
    return null;
  }

  /**
   * Сохранить blob URL в кэш.
   * Автоматически удаляет старые записи при переполнении.
   */
  set(key: string, blobUrl: string): void {
    // Если кэш переполнен — удаляем самую старую запись
    if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(key)) {
      let oldestKey = '';
      let oldestTime = Infinity;

      for (const [k, v] of this.cache) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        const old = this.cache.get(oldestKey);
        if (old) URL.revokeObjectURL(old.url);
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { url: blobUrl, timestamp: Date.now() });
  }

  /**
   * Проверить наличие в кэше.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Освободить ВСЕ blob URL и очистить кэш.
   * Вызывать при unmount приложения.
   */
  clear(): void {
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.cache.clear();
  }

  /**
   * Текущий размер кэша.
   */
  get size(): number {
    return this.cache.size;
  }
}

// Singleton — один кэш на всё приложение
export const previewCache = new BlobCache();