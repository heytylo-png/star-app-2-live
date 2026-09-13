import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { RaiApp } from "@/components/rai-app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RaiApp />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/star-app-2-live/sw.js", {
      scope: "/star-app-2-live/",
    });
  });
}
