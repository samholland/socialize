import { drawFacebookFeedSurface } from "./feed/renderFacebookFeedSurface";
import { drawInstagramFeedSurface } from "./feed/renderInstagramFeedSurface";
import type { DrawFeedSurfaceArgs } from "./feed/types";

export async function drawFeedSurface(args: DrawFeedSurfaceArgs) {
  const key = args.platform.toLowerCase();
  if (key.includes("facebook")) {
    await drawFacebookFeedSurface(args);
    return;
  }

  await drawInstagramFeedSurface(args);
}
