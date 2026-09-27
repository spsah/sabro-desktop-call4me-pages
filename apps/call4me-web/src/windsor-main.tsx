import React from "react";
import ReactDOM from "react-dom/client";
import WindsorApp from "./WindsorApp";
import "./styles.css";

document.title = "SABRO";
const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <WindsorApp />
  </React.StrictMode>,
);
