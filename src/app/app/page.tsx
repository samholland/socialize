"use client";

import { Suspense } from "react";
import WorkspaceEditorApp from "@/components/WorkspaceEditorApp";

export default function AppPage() {
  return (
    <Suspense
      fallback={
        <div className="app-root" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
          <div className="empty-state">
            <h3>Loading workspace…</h3>
          </div>
        </div>
      }
    >
      <WorkspaceEditorApp />
    </Suspense>
  );
}
