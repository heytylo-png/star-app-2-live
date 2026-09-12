import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { RaiApp } from "@/components/rai-app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RaiApp />
  </StrictMode>,
);
