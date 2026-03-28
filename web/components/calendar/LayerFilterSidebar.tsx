"use client";

import { useState, useEffect } from "react";
import type { CalendarLayer } from "@hillfamilyhoopla/shared";
import { apiClient } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LayerFilterSidebarProps {
  /** Currently hidden layer IDs */
  hiddenLayerIds: Set<string>;
  onChange: (hiddenLayerIds: Set<string>) => void;
  onClose?: () => void;
}

// ─── LayerFilterSidebar ───────────────────────────────────────────────────────

export default function LayerFilterSidebar({
  hiddenLayerIds,
  onChange,
  onClose,
}: LayerFilterSidebarProps) {
  const [layers, setLayers] = useState<CalendarLayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ layers: CalendarLayer[] }>("/calendar/layers")
      .then((d) => setLayers(d.layers))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  function toggleLayer(id: string) {
    const next = new Set(hiddenLayerIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function showAll() {
    onChange(new Set());
  }

  // Split: family layer first, then personal layers
  const familyLayer = layers.find((l) => l.isFamilyLayer);
  const personalLayers = layers.filter((l) => !l.isFamilyLayer);

  return (
    <aside className="flex flex-col w-52 border-r bg-card h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-semibold">Calendars</span>
        <div className="flex items-center gap-2">
          {hiddenLayerIds.size > 0 && (
            <button
              type="button"
              onClick={showAll}
              className="text-xs text-primary hover:underline"
            >
              Show all
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close filters"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Loading…</span>
        </div>
      ) : (
        <div className="p-3 space-y-4">
          {/* Family layer */}
          {familyLayer && (
            <LayerSection
              title="Family"
              layers={[familyLayer]}
              hiddenLayerIds={hiddenLayerIds}
              onToggle={toggleLayer}
            />
          )}

          {/* Personal layers */}
          {personalLayers.length > 0 && (
            <LayerSection
              title="Personal"
              layers={personalLayers}
              hiddenLayerIds={hiddenLayerIds}
              onToggle={toggleLayer}
            />
          )}

          {layers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No calendars found
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

// ─── LayerSection ─────────────────────────────────────────────────────────────

function LayerSection({
  title,
  layers,
  hiddenLayerIds,
  onToggle,
}: {
  title: string;
  layers: CalendarLayer[];
  hiddenLayerIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        {title}
      </p>
      <ul className="space-y-0.5">
        {layers.map((layer) => {
          const visible = !hiddenLayerIds.has(layer.id);
          return (
            <li key={layer.id}>
              <button
                type="button"
                onClick={() => onToggle(layer.id)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                {/* Color swatch / checkbox */}
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                  style={{
                    backgroundColor: visible ? layer.color : "transparent",
                    border: `2px solid ${layer.color}`,
                  }}
                >
                  {visible && (
                    <svg
                      className="h-2.5 w-2.5 text-white"
                      fill="none"
                      viewBox="0 0 10 10"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M1.5 5l2.5 2.5 4.5-4.5"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className={`truncate ${visible ? "text-foreground" : "text-muted-foreground line-through"}`}
                >
                  {layer.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
