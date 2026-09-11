import React from 'react'
import { DocumentTextIcon, LinkIcon, PlayCircleIcon } from '@heroicons/react/24/outline'
import { getVideoEmbedUrl } from '../../utils/videoUtils'

/**
 * Files, links and videos a teacher attached to a quest or to one of its tasks.
 *
 * Before this there was nowhere for them: a quest had a single `material_link`
 * and a task had nothing, so a worksheet for step 3 and a demo video for step 5
 * both ended up pasted into a description (iCreate, 2026-09-10).
 *
 * A video renders inline only when getVideoEmbedUrl recognises the provider
 * (YouTube, Vimeo, Loom, Drive) and can hand back an embed URL it built itself.
 * Anything else is a link. The `?? url` fallback that IframeEmbed and
 * LessonBlockEditor use — put the raw URL in the iframe src when the provider is
 * unknown — is deliberately NOT copied here: it would let whatever a school
 * pasted frame itself inside a page a student has open.
 */

const KIND_ICON = {
  file: DocumentTextIcon,
  video: PlayCircleIcon,
  link: LinkIcon,
}

const ResourceLink = ({ resource }) => {
  const Icon = KIND_ICON[resource.kind] || LinkIcon
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-optio-purple/40 hover:shadow-sm transition-all"
    >
      <Icon className="w-5 h-5 text-optio-purple flex-shrink-0" />
      <span className="text-sm font-medium text-gray-900 truncate">{resource.title}</span>
    </a>
  )
}

const QuestResourceList = ({ resources, title = 'Resources', className = '' }) => {
  const items = Array.isArray(resources) ? resources : []
  if (!items.length) return null

  return (
    <div className={className}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {title}
      </p>
      <div className="space-y-2">
        {items.map((resource) => {
          const embed = resource.kind === 'video' ? getVideoEmbedUrl(resource.url) : null
          if (embed) {
            return (
              <div key={resource.id}>
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
                  <iframe
                    src={embed}
                    title={resource.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    // Sandboxed: these players need scripts and same-origin to
                    // run, and nothing else. No allow-top-navigation, so an
                    // embed cannot move the student off the page they are
                    // working on.
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{resource.title}</p>
              </div>
            )
          }
          return <ResourceLink key={resource.id} resource={resource} />
        })}
      </div>
    </div>
  )
}

export default QuestResourceList
