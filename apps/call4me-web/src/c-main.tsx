import React from "react";
import ReactDOM from "react-dom/client";
import TenantApp from "./TenantApp";
import "./tenant-chrome.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <TenantApp />
  </React.StrictMode>,
);
