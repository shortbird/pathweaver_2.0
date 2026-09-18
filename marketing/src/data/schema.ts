/**
 * JSON-LD building blocks with stable @ids, so every page on the site names
 * the same Organization and the same author node. Search engines merge
 * entities by @id; a page that redeclares "Optio" inline creates a second,
 * unlinked Organization instead of strengthening the first.
 *
 * Use graph(...) to emit one <script type="application/ld+json"> per page.
 * Nodes carry no @context of their own; graph() adds it once.
 */
import { WASC_ACCREDITED_PHRASE } from './accreditation'
import { SITE, SOCIAL_LINKS } from './site'

export const ORG_ID = `${SITE.url}/#organization`
export const PERSON_ID = `${SITE.url}/#tanner-bowman`
export const WEBSITE_ID = `${SITE.url}/#website`
export const ACADEMY_ID = `${SITE.url}/#academy`

export const AUTHOR = {
  name: 'Dr. Tanner Bowman',
  title: 'Founder and Head of School, Optio Academy',
  image: `${SITE.url}/images/head-of-school.png`,
  sameAs: ['https://www.linkedin.com/in/tannerbowman/'],
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
    description: SITE.description,
    founder: { '@id': PERSON_ID },
    email: SITE.supportEmail,
    sameAs: SOCIAL_LINKS.map((s) => s.href),
  }
}

/**
 * Optio Academy, the school. One node with one @id, so the home page, the
 * academy page and every story set there name the same entity; until
 * 2026-09-18 two pages each declared their own School inline (one with a
 * second, unlinked "Optio" Organization inside it), which an answer engine
 * reads as two schools.
 */
export function academyNode(description?: string) {
  return {
    '@type': 'School',
    '@id': ACADEMY_ID,
    name: 'Optio Academy',
    url: `${SITE.url}/academy/`,
    description: description ?? `A fully online, WASC-accredited private school. ${WASC_ACCREDITED_PHRASE}.`,
    email: SITE.academyEmail,
    sameAs: SOCIAL_LINKS.map((s) => s.href),
    parentOrganization: { '@id': ORG_ID },
  }
}

export function personNode() {
  return {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: AUTHOR.name,
    jobTitle: AUTHOR.title,
    image: AUTHOR.image,
    sameAs: AUTHOR.sameAs,
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

/**
 * A story's video hero as a VideoObject, so Google can show it as a video
 * result. `thumbnailUrl`, `uploadDate`, `name` and `description` are the
 * required properties; `duration` is ISO 8601 when the backend probed it.
 */
export function videoNode(opts: {
  id: string
  name: string
  description: string
  contentUrl: string
  thumbnailUrl: string
  uploadDate: string
  duration?: string | null
}) {
  return {
    '@type': 'VideoObject',
    '@id': opts.id,
    name: opts.name,
    description: opts.description,
    contentUrl: opts.contentUrl,
    thumbnailUrl: opts.thumbnailUrl,
    uploadDate: opts.uploadDate,
    ...(opts.duration ? { duration: opts.duration } : {}),
    inLanguage: 'en-US',
    isFamilyFriendly: true,
    publisher: { '@id': ORG_ID },
  }
}

export function graph(...nodes: object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes }
}

export function absolute(href: string): string {
  return /^https?:\/\//.test(href) ? href : new URL(href, SITE.url).href
}
