import React from 'react';
import { Card, CardContent } from './ui/card';

/**
 * 4.4. Skeleton-заглушка для карточки файла.
 *
 * WHY: Когда DashboardPage загружает данные, вместо спиннера
 * показываем скелетоны — серые блоки того же размера, что
 * и реальные карточки. Это:
 * 1. Предотвращает Layout Shift (CLS = 0)
 * 2. Даёт пользователю ощущение скорости (perceived performance)
 * 3. Сохраняет scroll position
 *
 * Размеры идентичны реальной карточке:
 * - Превью: h-48
 * - Заголовок: h-4 w-2/3
 * - Описание: h-3 w-full
 * - Кнопки: h-8
 */
export function SkeletonCard() {
  return (
    <Card className="overflow-hidden">
      {/* Превью — точно h-48 как в реальной карточке */}
      <div className="h-48 bg-muted animate-pulse" />

      <CardContent className="p-4 space-y-3">
        {/* Заголовок */}
        <div className="h-4 bg-muted rounded animate-pulse w-2/3" />

        {/* Описание */}
        <div className="h-3 bg-muted rounded animate-pulse w-full" />

        {/* Мета-данные */}
        <div className="flex gap-3">
          <div className="h-3 bg-muted rounded animate-pulse w-20" />
          <div className="h-3 bg-muted rounded animate-pulse w-12" />
          <div className="h-3 bg-muted rounded animate-pulse w-10" />
        </div>

        {/* Кнопки */}
        <div className="flex gap-1 pt-1">
          <div className="h-8 bg-muted rounded animate-pulse flex-1" />
          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Сетка скелетонов — показывается при isLoading.
 * count = PAGE_SIZE для идентичного layout.
 */
export function SkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}