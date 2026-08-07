import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Aspirants live on their phones, so "Add to Home Screen" is a real entry
 * point rather than a checkbox. The icons come from the same SVG as the tab
 * icon — see scripts/build-icons.ts.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Xamvaad — Where Aspirants Discuss",
    short_name: "Xamvaad",
    description:
      "Structured discussion for competitive exam aspirants. Memory questions, objection tracking and cutoff estimates, organised by board, exam, phase and shift.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4F46E5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // Maskable so Android can crop it to whatever shape the launcher uses
        // without clipping the mark.
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
