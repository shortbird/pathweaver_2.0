/**
 * Content-layer loader for /stories. One request per build to the public
 * stories endpoint; the site is static, so publishing a story means the
 * backend fires the Render deploy hook and this loader runs again.
 *
 * Failure policy: any problem throws. `astro build` then exits non-zero and
 * Render keeps the last good deploy serving, which is the outcome we want
 * when the API is down, returns junk, or points at an image that is gone.
 * A build that quietly rendered zero stories would delete every story page
 * from the live site and 404 every link Google has already picked up.
 *
 * Two escape hatches for a developer's machine, neither of which can reach
 * production:
 *   STORIES_SOURCE=fixture   read src/data/stories.fixture.json instead of
 *                            the API. Refused when RENDER=true.
 *   astro dev                when the API is unreachable, fall back to the
 *                            fixture with a warning so the site still runs.
 * STORIES_MIN_COUNT (default 0) fails the build when the API returns fewer
 * published stories than expected, which catches an empty response that is
 * technically valid JSON.
 */
import type { Loader, LoaderContext } from 'astro/loaders'
import { SITE } from '../data/site'
import fixture from '../data/stories.fixture.json'

const ENDPOINT_PATH = '/api/public/stories'
const ATTEMPTS = 4 // one try plus three retries
const TIMEOUT_MS = 20_000
const HEAD_TIMEOUT_MS = 10_000
const HEAD_CONCURRENCY = 6

type RawStory = Record<string, any>

class StoriesLoadError extends Error {}

function endpointUrl(): string {
  return `${SITE.apiUrl.replace(/\/$/, '')}${ENDPOINT_PATH}`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** "fetch failed" on its own hides the ECONNREFUSED underneath; surface the cause. */
function describe(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  if (err.name === 'AbortError') return `timed out after ${TIMEOUT_MS / 1000}s`
  const cause = (err as Error & { cause?: unknown }).cause
  const causeText = cause instanceof Error ? cause.message : cause ? String(cause) : ''
  return causeText && causeText !== err.message ? `${err.message}: ${causeText}` : err.message
}

async function fetchStories(url: string, logger: LoaderContext['logger']): Promise<RawStory[]> {
  let lastError: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, TIMEOUT_MS)
      if (res.status === 404) {
        // The route does not exist yet: the backend that serves it deploys after
        // CI, while this site deploys on the commit. That window is not an
        // outage, and no page can be lost to it because nothing has been
        // published. Once stories exist, STORIES_MIN_COUNT turns this back into
        // a failed build, which is the safe answer for every other cause.
        logger.warn(`stories: ${url} returned 404; treating as no stories yet`)
        return []
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (!body || body.success !== true || !Array.isArray(body.stories)) {
        throw new Error('response is not { success: true, stories: [...] }')
      }
      return body.stories as RawStory[]
    } catch (err) {
      lastError = err
      logger.warn(`stories: attempt ${attempt} of ${ATTEMPTS} failed for ${url}: ${describe(err)}`)
      if (attempt < ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1))
    }
  }
  throw new StoriesLoadError(
    `Stories: could not load ${url} after ${ATTEMPTS} attempts (${describe(lastError)}). ` +
      'The build stops here so the last good deploy stays live. ' +
      'Set STORIES_SOURCE=fixture to build locally without the API.'
  )
}

function loadFixture(): RawStory[] {
  return (fixture as RawStory[]).map((story) => ({ ...story, status: 'fixture' }))
}

function imageUrls(story: RawStory): string[] {
  const urls: string[] = []
  if (typeof story.hero_image_url === 'string') urls.push(story.hero_image_url)
  for (const section of story.sections ?? []) {
    if (section?.kind !== 'evidence') continue
    for (const item of section.items ?? []) {
      if (item?.type === 'image' && typeof item.url === 'string') urls.push(item.url)
      if (typeof item?.thumb_url === 'string') urls.push(item.thumb_url)
    }
  }
  return urls
}

/**
 * HEAD every image once. astro:assets downloads each remote image during the
 * build anyway, but its error is a stack trace from deep inside the image
 * service; this one names the story and the URL.
 */
async function preflightImages(stories: RawStory[], logger: LoaderContext['logger'], strict: boolean) {
  const jobs: { slug: string; url: string }[] = []
  const seen = new Set<string>()
  for (const story of stories) {
    for (const url of imageUrls(story)) {
      if (seen.has(url)) continue
      seen.add(url)
      jobs.push({ slug: story.slug, url })
    }
  }
  if (jobs.length === 0) return
  const failures: string[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      try {
        const res = await fetchWithTimeout(job.url, { method: 'HEAD' }, HEAD_TIMEOUT_MS)
        if (!res.ok) failures.push(`${job.slug}: ${job.url} (HTTP ${res.status})`)
      } catch (err) {
        failures.push(`${job.slug}: ${job.url} (${describe(err)})`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(HEAD_CONCURRENCY, jobs.length) }, worker))
  if (failures.length === 0) {
    logger.info(`stories: ${jobs.length} image URL${jobs.length === 1 ? '' : 's'} answered HEAD`)
    return
  }
  const message = `Stories: ${failures.length} image URL(s) failed HEAD pre-flight:\n  ${failures.join('\n  ')}`
  if (strict) throw new StoriesLoadError(`${message}\nThe build stops here so the last good deploy stays live.`)
  logger.warn(message)
}

async function renderSections(story: RawStory, context: LoaderContext): Promise<RawStory> {
  const sections = []
  for (const section of story.sections ?? []) {
    if (section && typeof section.body_md === 'string') {
      const rendered = await context.renderMarkdown(section.body_md)
      sections.push({ ...section, body_html: rendered.html })
    } else {
      sections.push(section)
    }
  }
  return { ...story, sections }
}

export function storiesLoader(): Loader {
  return {
    name: 'optio-stories',
    async load(context) {
      const { store, logger, parseData, generateDigest } = context
      const source = process.env.STORIES_SOURCE
      const onRender = process.env.RENDER === 'true'
      const isDev = import.meta.env.DEV
      const minCount = Number.parseInt(process.env.STORIES_MIN_COUNT ?? '0', 10) || 0
      const url = endpointUrl()

      let raw: RawStory[]
      if (source === 'fixture') {
        if (onRender) {
          throw new StoriesLoadError('Stories: STORIES_SOURCE=fixture is refused on Render. Unset it on the service.')
        }
        raw = loadFixture()
        logger.warn(`stories: STORIES_SOURCE=fixture, reading ${raw.length} fixture stories instead of ${url}`)
      } else if (source && source !== 'api') {
        throw new StoriesLoadError(`Stories: STORIES_SOURCE must be unset, "api" or "fixture" (got "${source}").`)
      } else {
        try {
          raw = await fetchStories(url, logger)
        } catch (err) {
          if (!isDev) throw err
          logger.warn(`${err instanceof Error ? err.message : String(err)}\nstories: astro dev falls back to the fixture.`)
          raw = loadFixture()
        }
      }

      const published = raw.filter((s) => s?.status === 'published')
      if (source !== 'fixture' && published.length < minCount) {
        throw new StoriesLoadError(
          `Stories: ${url} returned ${published.length} published stor${published.length === 1 ? 'y' : 'ies'}, ` +
            `STORIES_MIN_COUNT is ${minCount}. The build stops here so the last good deploy stays live.`
        )
      }

      await preflightImages(raw, logger, !isDev)

      store.clear()
      for (const story of raw) {
        if (!story || typeof story.slug !== 'string') {
          throw new StoriesLoadError(`Stories: an entry from ${url} has no slug: ${JSON.stringify(story).slice(0, 200)}`)
        }
        const withHtml = await renderSections(story, context)
        const data = await parseData({ id: story.slug, data: withHtml })
        store.set({ id: story.slug, data, digest: generateDigest(withHtml) })
      }
      logger.info(`stories: ${raw.length} loaded (${published.length} published)`)
    },
  }
}
