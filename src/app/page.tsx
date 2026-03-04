"use client";

import { useState } from "react";
import { PreviewCanvas } from "@/components/PreviewCanvas";

export default function Home() {
  const [primaryText, setPrimaryText] = useState(
    "This is placeholder ad copy."
  );

  const [cta, setCta] = useState("Learn More");

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "280px 1fr 460px" }}>
      
      <aside style={{ borderRight: "1px solid #ddd", padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 12 }}>Clients</h2>
        <div style={{ fontSize: 14, color: "#555" }}>
          (campaign tree later)
        </div>
      </aside>

      <main style={{ borderRight: "1px solid #ddd", padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 12 }}>Editor</h2>

        <label style={{ fontSize: 14 }}>Primary Text</label>
        <textarea
          value={primaryText}
          onChange={(e) => setPrimaryText(e.target.value)}
          style={{
            width: "100%",
            height: 120,
            marginTop: 6,
            marginBottom: 16,
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 6
          }}
        />

        <label style={{ fontSize: 14 }}>CTA</label>
        <select
          value={cta}
          onChange={(e) => setCta(e.target.value)}
          style={{
            display: "block",
            marginTop: 6,
            padding: 8,
            borderRadius: 6,
            border: "1px solid #ccc"
          }}
        >
          <option>Learn More</option>
          <option>Shop Now</option>
          <option>Sign Up</option>
          <option>Download</option>
        </select>
      </main>

      <section style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 12 }}>Preview</h2>

        <PreviewCanvas
          primaryText={primaryText}
          cta={cta}
        />
      </section>

    </div>
  );
}