export type PublicPresentationMedia = {
  kind: "none" | "image" | "video";
  url: string | null;
  storagePath: string | null;
  mimeType: string | null;
};

export type PublicPresentationCampaign = {
  id: string;
  name: string;
  platform: string;
  mediaAspect: "1:1" | "3:4" | "9:16";
  primaryText: string;
  facebookPageName: string;
  headline: string;
  url: string;
  cta: string;
  ctaVisible: boolean;
  ctaBgColor: string;
  ctaTextColor: string;
  status: "draft" | "ready" | "approved";
  updatedAt: string;
  media: PublicPresentationMedia;
  engagementSeed: number;
};

export type PublicPresentationDocument = {
  token: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  clientVerified: boolean;
  clientAvatarUrl: string | null;
  expiresAt: string | null;
  campaigns: PublicPresentationCampaign[];
};
