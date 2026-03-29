"use client";

import { useEffect, useMemo, useState } from "react";
import { PreviewCanvas, type PreviewMedia } from "@/components/PreviewCanvas";
import type {
  PublicPresentationCampaign,
  PublicPresentationDocument,
} from "@/lib/presentation/types";

type PublicPresentationViewerProps = {
  presentation: PublicPresentationDocument;
  initialCampaignId?: string;
  initialShowCopyRail?: boolean;
};

function campaignStatusLabel(status: "draft" | "ready" | "approved"): string {
  if (status === "ready") return "Ready";
  if (status === "approved") return "Approved";
  return "Draft";
}

function pickSlideIndex(
  campaigns: PublicPresentationCampaign[],
  campaignId: string | undefined
): number {
  if (!campaignId) return 0;
  const index = campaigns.findIndex((campaign) => campaign.id === campaignId);
  return index >= 0 ? index : 0;
}

function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }

  return new Promise((resolve, reject) => {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      document.body.removeChild(area);
    }
  });
}

export function PublicPresentationViewer({
  presentation,
  initialCampaignId,
  initialShowCopyRail = true,
}: PublicPresentationViewerProps) {
  const [slideIndex, setSlideIndex] = useState(() =>
    pickSlideIndex(presentation.campaigns, initialCampaignId)
  );
  const [showCopyRail, setShowCopyRail] = useState(initialShowCopyRail);
  const [copyFlash, setCopyFlash] = useState(false);

  const campaignCount = presentation.campaigns.length;
  const clampedSlideIndex =
    campaignCount > 0
      ? Math.max(0, Math.min(slideIndex, campaignCount - 1))
      : 0;
  const campaign = presentation.campaigns[clampedSlideIndex] ?? null;

  useEffect(() => {
    if (campaignCount === 0) {
      if (slideIndex !== 0) setSlideIndex(0);
      return;
    }
    if (slideIndex >= campaignCount) {
      setSlideIndex(campaignCount - 1);
    }
  }, [campaignCount, slideIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSlideIndex((value) => Math.max(value - 1, 0));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSlideIndex((value) =>
          campaignCount > 0 ? Math.min(value + 1, campaignCount - 1) : 0
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [campaignCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (campaign?.id) {
      url.searchParams.set("campaign", campaign.id);
    } else {
      url.searchParams.delete("campaign");
    }
    url.searchParams.set("rail", showCopyRail ? "1" : "0");
    const nextSearch = url.searchParams.toString();
    const currentSearch = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;
    if (nextSearch === currentSearch) return;
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [campaign?.id, showCopyRail]);

  const stageMedia: PreviewMedia = useMemo(() => {
    if (!campaign || campaign.media.kind === "none" || !campaign.media.url) {
      return { kind: "none" };
    }
    return {
      kind: campaign.media.kind,
      url: campaign.media.url,
    };
  }, [campaign]);

  const canvasDisplayWidth = showCopyRail
    ? "min(69.6vw, calc((100vh - 170px) * 0.675))"
    : "min(98.4vw, calc((100vh - 130px) * 0.675))";

  return (
    <div className="presentation-overlay presentation-overlay-public" role="main">
      <div className="presentation-topbar">
        <div className="presentation-topbar-copy">
          <div className="presentation-title">{presentation.projectName}</div>
          <div className="presentation-subtitle">
            {presentation.clientName} ·{" "}
            {campaignCount > 0 ? `${clampedSlideIndex + 1} / ${campaignCount}` : "0 / 0"}
          </div>
        </div>
        <div className="presentation-topbar-actions">
          {copyFlash && <span className="copy-success">Link copied!</span>}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              void copyText(window.location.href).then(() => {
                setCopyFlash(true);
                window.setTimeout(() => setCopyFlash(false), 1200);
              });
            }}
          >
            Copy Link
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowCopyRail((shown) => !shown)}
          >
            {showCopyRail ? "Hide Copy" : "Show Copy"}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (document.fullscreenElement) {
                void document.exitFullscreen().catch(() => {
                  // noop
                });
                return;
              }
              const element = document.documentElement;
              if (element.requestFullscreen) {
                void element.requestFullscreen().catch(() => {
                  // noop
                });
              }
            }}
          >
            Fullscreen
          </button>
        </div>
      </div>

      <div className="presentation-main">
        {showCopyRail && (
          <aside className="presentation-copy-rail">
            {campaign ? (
              <>
                <div className="presentation-copy-meta">
                  <span className="badge badge-platform">{campaign.platform}</span>
                  <span className={`badge badge-${campaign.status}`}>
                    {campaignStatusLabel(campaign.status)}
                  </span>
                </div>
                <h3 className="presentation-copy-title">{campaign.name}</h3>
                <div className="presentation-copy-label">Body Copy</div>
                <div className="presentation-copy-body">
                  {campaign.primaryText.trim() || "No body copy yet."}
                </div>
                {campaign.platform === "Facebook Feed" && (
                  <>
                    <div className="presentation-copy-label">Headline</div>
                    <div className="presentation-copy-body">
                      {campaign.headline.trim() || "—"}
                    </div>
                    <div className="presentation-copy-label">URL</div>
                    <div className="presentation-copy-body">{campaign.url.trim() || "—"}</div>
                  </>
                )}
                <div className="presentation-copy-label">CTA</div>
                <div className="presentation-copy-body">{campaign.cta || "—"}</div>
              </>
            ) : (
              <div className="presentation-empty-copy">This project has no ads yet.</div>
            )}
          </aside>
        )}

        <section className="presentation-stage" style={{ backgroundColor: "#ffffff" }}>
          {campaign ? (
            <PreviewCanvas
              primaryText={campaign.primaryText}
              facebookPageName={campaign.facebookPageName}
              headline={campaign.headline}
              url={campaign.url}
              cta={campaign.cta}
              ctaVisible={campaign.ctaVisible}
              ctaBgColor={campaign.ctaBgColor}
              ctaTextColor={campaign.ctaTextColor}
              platform={campaign.platform}
              mediaAspect={campaign.mediaAspect}
              clientName={presentation.clientName}
              clientVerified={presentation.clientVerified}
              clientAvatarUrl={presentation.clientAvatarUrl ?? undefined}
              media={stageMedia}
              instagramFeedOverlayEnabled={false}
              mockupBackdropColor="#ffffff"
              transparentPngExport={false}
              engagementPreset="medium"
              engagementSeed={campaign.engagementSeed}
              onMediaChange={() => {
                // Public presentation view is read-only.
              }}
              disableMediaInteractions
              displayWidth={canvasDisplayWidth}
            />
          ) : (
            <div className="empty-state">
              <h3>No ads in this project</h3>
              <p>Ask the workspace owner to add a creative.</p>
            </div>
          )}
        </section>
      </div>

      <div className="presentation-nav">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setSlideIndex((value) => Math.max(value - 1, 0))}
          disabled={clampedSlideIndex <= 0}
        >
          Previous
        </button>
        <div className="presentation-nav-hint">Use ← and → keys to navigate</div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() =>
            setSlideIndex((value) =>
              campaignCount > 0 ? Math.min(value + 1, campaignCount - 1) : 0
            )
          }
          disabled={campaignCount === 0 || clampedSlideIndex >= campaignCount - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}
