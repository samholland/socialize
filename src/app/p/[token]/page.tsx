import { PublicPresentationViewer } from "@/components/PublicPresentationViewer";
import { loadPublicPresentationByToken } from "@/lib/cloud/presentationLinks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublicPresentationPageProps = {
  params: {
    token: string;
  };
  searchParams?: {
    campaign?: string;
    rail?: string;
  };
};

export default async function PublicPresentationPage({
  params,
  searchParams,
}: PublicPresentationPageProps) {
  const rawToken = typeof params.token === "string" ? params.token : "";
  const token = decodeURIComponent(rawToken).trim();
  const presentation = await loadPublicPresentationByToken(token);

  if (!presentation) {
    return (
      <div className="app-root" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div className="empty-state">
          <h3>Presentation link unavailable</h3>
          <p>This link is invalid, expired, or has been revoked.</p>
        </div>
      </div>
    );
  }

  const initialCampaignId =
    typeof searchParams?.campaign === "string"
      ? searchParams.campaign.trim()
      : undefined;
  const initialShowCopyRail = searchParams?.rail !== "0";

  return (
    <PublicPresentationViewer
      presentation={presentation}
      initialCampaignId={initialCampaignId}
      initialShowCopyRail={initialShowCopyRail}
    />
  );
}
