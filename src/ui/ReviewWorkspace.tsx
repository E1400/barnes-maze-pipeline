/**
 * Steps 4-5 combined: review the track, correct it, and see (and correct)
 * the hole investigations it produces -- all in one workspace, the video
 * viewer and the investigation list side by side rather than in separate
 * sections a reviewer has to scroll between (Elvis's feedback, 2026-09-03).
 *
 * `useTrackReview` is called once here, not inside each half, so the viewer
 * and the investigation list's "jump to this frame" buttons share the exact
 * same frame index and corrected track.
 */

import type { RoiDefinition } from '../core/roi.ts'
import { roiCompleteness } from '../core/roi.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import InvestigationPanel from './InvestigationPanel.tsx'
import TrackViewer from './TrackViewer.tsx'
import { useTrackReview } from './useTrackReview.ts'
import type { TrackingJob } from './useTrackingJob.ts'

interface Props {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition | null
  readonly trackingJob: TrackingJob
}

export default function ReviewWorkspace({ video, roi, trackingJob }: Props) {
  const review = useTrackReview(video, trackingJob)
  const completeness = roiCompleteness(roi)

  if (!roi || !completeness.hasRing) {
    return (
      <section aria-labelledby="review-heading" className="review-workspace">
        <h2 id="review-heading">4. Review, correct, and detect hole visits</h2>
        <p className="hint">Define the maze layout above first.</p>
      </section>
    )
  }

  if (!review.tracks) {
    return (
      <section aria-labelledby="review-heading" className="review-workspace">
        <h2 id="review-heading">4. Review, correct, and detect hole visits</h2>
        <p className="hint">Track the video above first.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="review-heading" className="review-workspace">
      <h2 id="review-heading">4. Review, correct, and detect hole visits — {video.name}</h2>
      <p className="hint">
        Scrub or click the path to see where the tracker put the animal; drag a point to fix it.
        The investigation list on the right updates live.
      </p>
      <div className="review-grid">
        <TrackViewer video={video} roi={roi} review={review} />
        <InvestigationPanel video={video} roi={roi} review={review} />
      </div>
    </section>
  )
}
