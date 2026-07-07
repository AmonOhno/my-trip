import { formatClock, formatDistance, formatDuration } from "../core/format";
import type { TimelineSegment } from "../core/types";

interface TimelineProps {
  segments: readonly TimelineSegment[];
  onSelectSpot?: (spotId: string) => void;
}

export function Timeline({ segments, onSelectSpot }: TimelineProps) {
  if (segments.length === 0) {
    return <p className="muted">タイムラインはまだありません。</p>;
  }
  return (
    <ol className="timeline">
      {segments.map((seg) =>
        seg.kind === "stay" ? (
          <li key={seg.spot.id} className="stay">
            <button
              type="button"
              className="stay-btn"
              onClick={onSelectSpot ? () => onSelectSpot(seg.spot.id) : undefined}
              aria-label={`${seg.spot.name} を地図で見る`}
            >
              <span className="stay-name">{seg.spot.name}</span>
              <br />
              <span className="muted">
                {formatClock(seg.spot.arrivedAt)}
                {seg.spot.departedAt !== null
                  ? ` – ${formatClock(seg.spot.departedAt)}(${formatDuration(seg.spot.departedAt - seg.spot.arrivedAt)})`
                  : " – 滞在中"}
              </span>
              {seg.spot.note ? <div className="muted">{seg.spot.note}</div> : null}
            </button>
          </li>
        ) : (
          <li key={`move-${seg.fromMs}`} className="move">
            移動 {formatDistance(seg.distanceM)}・{formatDuration(seg.toMs - seg.fromMs)}
          </li>
        ),
      )}
    </ol>
  );
}
