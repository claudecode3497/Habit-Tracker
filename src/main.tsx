import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/outfit";
import "./styles.css";
import { getRouter } from "./router";
import { initStore } from "@/lib/store";
import { isNative } from "@/lib/native";

async function boot() {
  await initStore();
  createRoot(document.getElementById("root")!).render(<RouterProvider router={getRouter()} />);

  if (isNative) {
    void import("@capacitor/status-bar").then(({ StatusBar }) => StatusBar.setOverlaysWebView({ overlay: false })).catch(() => {});
  } else if ("serviceWorker" in navigator && import.meta.env.PROD) {
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
  }
}

void boot();
