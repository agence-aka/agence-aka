import 'server-only';

/** Signaux de maturité marketing détectés sur la page d'accueil d'un prospect. */
export type SiteSignals = {
  reachable: boolean;
  status?: number;
  https?: boolean;
  load_ms?: number;
  title?: string;
  meta_description?: boolean;
  mobile_viewport?: boolean;
  meta_pixel?: boolean;
  google_analytics?: boolean;
  google_tag_manager?: boolean;
  google_ads?: boolean;
  cms?: string | null;
  booking_or_shop?: boolean;
  copyright_year?: number | null;
  emails?: string[];
  socials?: Record<string, string>;
  error?: string;
};

export function normalizeDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

export function normalizeFacebook(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    if (!path || path === '/') return null;
    const id = u.searchParams.get('id');
    return `https://www.facebook.com${path}${id ? `?id=${id}` : ''}`;
  } catch {
    return null;
  }
}

// Garde-fou SSRF : on ne visite que des hôtes publics.
function isPublicHost(host: string) {
  return !(
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^(10|127|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.includes(':')
  );
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IGNORED_EMAIL = /(example\.|sentry|wixpress|\.png|\.jpg|\.webp|\.svg|godaddy|domain\.com)/i;

export async function auditSite(website: string): Promise<SiteSignals> {
  let url: URL;
  try {
    url = new URL(website.startsWith('http') ? website : `https://${website}`);
  } catch {
    return { reachable: false, error: 'URL invalide' };
  }
  if (!/^https?:$/.test(url.protocol) || !isPublicHost(url.hostname)) {
    return { reachable: false, error: 'Hôte refusé' };
  }

  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; AKA-Connect-Audit/1.0)', accept: 'text/html' },
    });
    const html = (await res.text()).slice(0, 1_500_000);
    const finalUrl = new URL(res.url || url.toString());

    const emails = Array.from(
      new Set(
        [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map(m => decodeURIComponent(m[1]))
          .concat(html.match(EMAIL_RE) ?? [])
          .map(e => e.toLowerCase())
          .filter(e => !IGNORED_EMAIL.test(e)),
      ),
    ).slice(0, 5);

    const socials: Record<string, string> = {};
    const socialRe: Record<string, RegExp> = {
      facebook: /https?:\/\/(?:www\.|m\.)?facebook\.com\/[A-Za-z0-9.\-_/?=]+/i,
      instagram: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._\-/]+/i,
      linkedin: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9\-_%/]+/i,
      tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._\-]+/i,
      youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[A-Za-z0-9._\-]+/i,
    };
    for (const [k, re] of Object.entries(socialRe)) {
      const m = html.match(re);
      if (m && !/sharer|share\.php|plugins|tr\?id=/.test(m[0])) socials[k] = m[0];
    }

    const cms =
      /wp-content|wordpress/i.test(html) ? 'WordPress'
      : /wix\.com|wixstatic/i.test(html) ? 'Wix'
      : /cdn\.shopify|shopify/i.test(html) ? 'Shopify'
      : /squarespace/i.test(html) ? 'Squarespace'
      : /webflow/i.test(html) ? 'Webflow'
      : /godaddy|websitebuilder/i.test(html) ? 'GoDaddy'
      : null;

    const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2})/gi)].map(m => Number(m[1]));

    return {
      reachable: res.ok,
      status: res.status,
      https: finalUrl.protocol === 'https:',
      load_ms: Date.now() - started,
      title: html.match(/<title[^>]*>([^<]{0,200})<\/title>/i)?.[1]?.trim(),
      meta_description: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html),
      mobile_viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
      meta_pixel: /fbq\(|connect\.facebook\.net\/[^"']*fbevents/i.test(html),
      google_analytics: /gtag\(|google-analytics\.com|G-[A-Z0-9]{6,}/.test(html),
      google_tag_manager: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/.test(html),
      google_ads: /AW-\d{6,}|googleadservices/.test(html),
      cms,
      booking_or_shop: /panier|cart|checkout|réserv|reserv|booking|book now|prendre rendez-vous|calendly|opentable|libro/i.test(html),
      copyright_year: years.length ? Math.max(...years) : null,
      emails,
      socials,
    };
  } catch (e: any) {
    return { reachable: false, load_ms: Date.now() - started, error: String(e?.message ?? e).slice(0, 200) };
  }
}
