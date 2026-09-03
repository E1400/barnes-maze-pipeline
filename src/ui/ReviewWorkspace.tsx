/**
 * Steps 4-5 combined: review the track, correct it, and see (and correct)
 * the hole investigations it produces.
 *
 * Layout follows how it's actually used: the video and its computed stats
 * stacked on the left (look at the animal, then see the numbers it
 * produced), the full investigation list on the right so it's beside the
 * viewer, not a separate section scrolled to (Elvis's feedback,
 * 2026-09-03). `useTrackReview` and `useInvestigations` are both called
 * once, here, so every child shares one frame index and one computed
 * investigation list -- a "jump to this row" button and the viewer have to
 * agree on what "this frame" means.
 */

import type { RoiDefinition } from '../core/roi.ts'
import { roiCompleteness } from '../core/roi.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import InvestigationTable from './InvestigationTable.tsx'
import TrackViewer from './TrackViewer.tsx'
import TrialStats from './TrialStats.tsx'
import { useInvestigations } from './useInvestigations.ts'
import { useTrackReview } from './useTrackReview.ts'
import type { TrackingJob } from './useTrackingJob.ts'

interface Props {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition | null
  readonly trackingJob: TrackingJob
}

export default function ReviewWorkspace({ video, roi, trackingJob }: Props) {
  const review = useTrackReview(video, trackingJob)
  const investigations = useInvestigations(video, roi, review.effective)
  const completeness = roiCompleteness(roi)

  if (!roi || !completeness.hasRing) {
    return (
      <section aria-labelledby="review-heading" className="review-workspace">
        <h2 id="review-heading" className="step-heading">4. Review, correct, and detect hole visits</h2>
        <p className="hint">Define the maze layout above first.</p>
      </section>
    )
  }

  if (!review.tracks || !review.effective) {
    return (
      <section aria-labelledby="review-heading" className="review-workspace">
        <h2 id="review-heading" className="step-heading">4. Review, correct, and detect hole visits</h2>
        <p className="hint">Track the video above first.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="review-heading" className="review-workspace">
      <h2 id="review-heading" className="step-heading">4. Review, correct, and detect hole visits — {video.name}</h2>
      <p className="hint">
        Scrub or click the path to see where the tracker put the animal; drag a point to fix it.
        The investigation list on the right updates live.
      </p>
      <div className="review-grid">
        <div className="review-column">
          <TrackViewer video={video} roi={roi} review={review} />
          <TrialStats video={video} roi={roi} effective={review.effective} investigations={investigations.investigations} />
        </div>
        <InvestigationTable video={video} roi={roi} review={review} inv={investigations} />
      </div>
    </section>
  )
}
