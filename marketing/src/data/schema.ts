/**
 * JSON-LD building blocks with stable @ids, so every page on the site names
 * the same Organization and the same author node. Search engines merge
 * entities by @id; a page that redeclares "Optio" inline creates a second,
 * unlinked Organization instead of strengthening the first.
 *
 * Use graph(...) to emit one <script type="application/ld+json"> per page.
 * Nodes carry no @context of their own; graph() adds it once.
 */
import { SITE, SOCIAL_LINKS } from './site'

export const ORG_ID = `${SITE.url}/#organization`
export const PERSON_ID = `${SITE.url}/#tanner-bowman`
export const WEBSITE_ID = `${SITE.url}/#website`

export const AUTHOR = {
  name: 'Dr. Tanner Bowman',
  title: 'Founder and Head of School, Optio Academy',
  image: `${SITE.url}/images/head-of-school.png`,
}

export function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    url: SITE.url,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE.url}/images/OptioLogo-FullColor.png`,
    },
    slogan: 'Real credit for real life',
    email: SITE.supportEmail,
    sameAs: SOCIAL_LINKS.map((s) => s.href),
  }
}

export function personNode() {
  return {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: AUTHOR.name,
    jobTitle: AUTHOR.title,
    image: AUTHOR.image,
    worksFor: { '@id': ORG_ID },
    url: SITE.url,
  }
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE.name,
    url: SITE.url,
    publisher: { '@id': ORG_ID },
  }
}

export interface Crumb {
  name: string
  /** Site-relative ("/stories/") or absolute. */
  href: string
}

export function breadcrumbNode(items: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absolute(item.href),
    })),
  }
}

export function faqNode(faqs: { q: string; a: string }[], id?: string) {
  return {
    '@type': 'FAQPage',
    ...(id ? { '@id': id } : {}),
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

export function graph(...nodes: object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes }
}

export function absolute(href: string): string {
  return /^https?:\/\//.test(href) ? href : new URL(href, SITE.url).href
}
