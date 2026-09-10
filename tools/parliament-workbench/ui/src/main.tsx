import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Cockpit } from "./Cockpit";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has("legacy") || location.pathname.startsWith("/entities/") ? <App /> : <Cockpit />}
  </React.StrictMode>
);
