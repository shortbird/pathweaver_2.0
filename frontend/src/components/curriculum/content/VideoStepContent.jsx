/**
 * VideoStepContent Component
 *
 * Renders video embed for a lesson step.
 * Supports YouTube, Vimeo, Google Drive, and Loom.
 */

import { PlayIcon } from '@heroicons/react/24/outline'
import { getVideoEmbedUrl } from '../../../utils/videoUtils'
import TextStepContent from './TextStepContent'

export const VideoStepContent = ({ step, lessonTitle }) => {
  const videoEmbedUrl = getVideoEmbedUrl(step?.video_url)

  return (
    <div className="space-y-6">
      {/* Optional description */}
      {step.content && step.content !== '<p></p>' && (
        <TextStepContent content={step.content} />
      )}

      {/* Video player */}
      {videoEmbedUrl ? (
        <div className="aspect-video rounded-xl overflow-hidden bg-gray-100 shadow-lg">
          <iframe
            src={videoEmbedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={step.title || lessonTitle}
          />
        </div>
      ) : (
        <div className="aspect-video rounded-xl bg-gray-100 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <PlayIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No video URL provided</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoStepContent
