import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "هفت‌دست · HaftDast",
    short_name: "هفت‌دست",
    description: "حکم؛ دو، سه یا چهار نفره، آنلاین یا با ربات — Hokm for 2, 3 or 4 players",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b1a3a",
    theme_color: "#142b5c",
    lang: "fa",
    dir: "rtl",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
