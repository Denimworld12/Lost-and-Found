/**
 * Item status diagram for the light section: Open → Claimed → Returned, with the reject,
 * dispute, timeout and cancel paths. Text inside carries the meaning; the figure caption
 * repeats it in prose for screen readers.
 */
export function StateDiagram() {
  const node = "fill-white stroke-mist";
  const label = "fill-abyss font-mono text-caption uppercase";
  const edge = "stroke-abyss/60";
  const edgeLabel = "fill-abyss/80 font-sans text-caption";
  return (
    <figure className="flex flex-col gap-16">
      <div className="overflow-x-auto rounded-card border border-mist">
        <svg
          viewBox="0 0 760 390"
          role="img"
          aria-labelledby="state-diagram-title"
          className="h-auto w-full min-w-640"
        >
          <title id="state-diagram-title">
            How an item moves between statuses
          </title>
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 10 5 0 10Z" className="fill-abyss/60" />
            </marker>
          </defs>

          <g transform="translate(0 90)">
            {/* Edges */}
            <path
              d="M150 90H290"
              className={edge}
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            <text x="220" y="78" textAnchor="middle" className={edgeLabel}>
              finder claims
            </text>

            <path
              d="M450 90H590"
              className={edge}
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            <text x="520" y="70" textAnchor="middle" className={edgeLabel}>
              owner confirms,
            </text>
            <text x="520" y="84" textAnchor="middle" className={edgeLabel}>
              or window passes
            </text>

            <path
              d="M330 116C300 160 160 160 110 116"
              className={edge}
              strokeWidth="1.5"
              fill="none"
              markerEnd="url(#arrow)"
            />
            <text x="220" y="168" textAnchor="middle" className={edgeLabel}>
              owner rejects (deposit to owner)
            </text>

            <path
              d="M370 116V200"
              className={edge}
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            <text x="380" y="164" className={edgeLabel}>
              either side disputes
            </text>

            <path
              d="M450 230C560 230 640 190 660 120"
              className={edge}
              strokeWidth="1.5"
              fill="none"
              markerEnd="url(#arrow)"
            />
            <text x="610" y="236" textAnchor="middle" className={edgeLabel}>
              arbiter pays finder
            </text>

            <path
              d="M290 238C200 260 90 220 72 120"
              className={edge}
              strokeWidth="1.5"
              fill="none"
              markerEnd="url(#arrow)"
            />
            <text x="150" y="270" textAnchor="middle" className={edgeLabel}>
              arbiter sides with owner
            </text>

            <path
              d="M85 64V-26"
              className={edge}
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            <text x="95" y="24" className={edgeLabel}>
              owner cancels (reward back to owner)
            </text>

            {/* Nodes */}
            <g>
              <rect
                x="20"
                y="64"
                width="130"
                height="52"
                rx="8"
                className={node}
              />
              <circle cx="42" cy="90" r="5" className="fill-node-cyan" />
              <text x="56" y="94" className={label}>
                Open
              </text>
            </g>
            <g>
              <rect
                x="290"
                y="64"
                width="160"
                height="52"
                rx="8"
                className={node}
              />
              <circle cx="312" cy="90" r="5" className="fill-node-violet" />
              <text x="326" y="94" className={label}>
                Claimed
              </text>
            </g>
            <g>
              <rect
                x="590"
                y="64"
                width="150"
                height="52"
                rx="8"
                className={node}
              />
              <circle cx="612" cy="90" r="5" className="fill-node-green" />
              <text x="626" y="94" className={label}>
                Returned
              </text>
            </g>
            <g>
              <rect
                x="290"
                y="204"
                width="160"
                height="52"
                rx="8"
                className={node}
              />
              <circle cx="312" cy="230" r="5" className="fill-node-magenta" />
              <text x="326" y="234" className={label}>
                Disputed
              </text>
            </g>
            <g>
              <rect
                x="20"
                y="-82"
                width="150"
                height="52"
                rx="8"
                className={node}
              />
              <circle cx="42" cy="-56" r="5" className="fill-steel" />
              <text x="56" y="-52" className={label}>
                Cancelled
              </text>
            </g>
          </g>
        </svg>
      </div>
      <figcaption className="text-body-sm text-abyss/80">
        An item starts Open. A finder&apos;s claim makes it Claimed. The owner
        confirming, or the response window passing, makes it Returned and pays
        the finder. If the owner rejects the claim it goes back to Open and the
        deposit goes to the owner. Either side can open a dispute; the security
        office then pays the finder or returns the item to Open. The owner can
        cancel an Open item.
      </figcaption>
    </figure>
  );
}
