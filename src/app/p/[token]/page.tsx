import { PublicPresentationViewer } from "@/components/PublicPresentationViewer";
import { loadPublicPresentationByToken } from "@/lib/cloud/presentationLinks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublicPresentationPageProps = {
  params:
    | {
        token: string;
      }
    | Promise<{
        token: string;
      }>;
  searchParams?:
    | {
        campaign?: string;
        rail?: string;
      }
    | Promise<{
        campaign?: string;
        rail?: string;
      }>;
};

function safeDecodeToken(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function PublicPresentationPage({
  params,
  searchParams,
}: PublicPresentationPageProps) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const rawToken =
    resolvedParams && typeof resolvedParams.token === "string"
      ? resolvedParams.token
      : "";
  const token = safeDecodeToken(rawToken).trim();
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
    typeof resolvedSearchParams?.campaign === "string"
      ? resolvedSearchParams.campaign.trim()
      : undefined;
  const initialShowCopyRail = resolvedSearchParams?.rail !== "0";

  return (
    <PublicPresentationViewer
      presentation={presentation}
      initialCampaignId={initialCampaignId}
      initialShowCopyRail={initialShowCopyRail}
    />
  );
}
