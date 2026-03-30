import { Helmet } from "react-helmet-async";

/**
 * Централизованный компонент SEO-мета.
 * Используется на каждой странице для задания уникальных title, description,
 * canonical, OG и robots.
 */

const SITE_NAME = "PrivacyGuard";
const BASE_URL = "https://privacyguard.com"; // TODO: вынести в env
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

interface SEOHeadProps {
  title: string;               // Заголовок страницы (без суффикса)
  description: string;         // Мета-описание (150-160 символов)
  path: string;                // Путь без домена, напр. "/" или "/auth"
  noIndex?: boolean;           // true для закрытых страниц
  ogImage?: string;            // Кастомное OG-изображение
  ogType?: string;             // og:type, по умолчанию "website"
}

export function SEOHead({
  title,
  description,
  path,
  noIndex = false,
  ogImage,
  ogType = "website",
}: SEOHeadProps) {
  const fullTitle = path === "/" ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = `${BASE_URL}${path}`;
  const imageUrl = ogImage || DEFAULT_OG_IMAGE;

  return (
    <Helmet>
      {/* Основные мета */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Robots */}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:locale" content="en_US" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Helmet>
  );
}