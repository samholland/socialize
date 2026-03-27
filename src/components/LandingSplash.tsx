"use client";

import Link from "next/link";
import Image from "next/image";
import { LandingWarp } from "@/components/LandingWarp";

type LandingSplashProps = {
  cloudEnabled: boolean;
};

export function LandingSplash({ cloudEnabled }: LandingSplashProps) {
  const warpSpeed = 0.2;

  return (
    <main className="landing-root">
      <LandingWarp speedScale={warpSpeed} />
      <div className="landing-shell">
        <Image
          className="landing-logo"
          src="/images/socialize/socialize-brand.svg"
          alt="Socialize"
          width={1600}
          height={360}
          priority
        />
        <div className="landing-actions">
          {cloudEnabled ? (
            <>
              <Link className="btn btn-primary" href="/login">
                Sign In
              </Link>
              <Link className="btn btn-secondary" href="/app?mode=local">
                Open Local Workspace
              </Link>
            </>
          ) : (
            <Link className="btn btn-primary" href="/app">
              Open Local Workspace
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
