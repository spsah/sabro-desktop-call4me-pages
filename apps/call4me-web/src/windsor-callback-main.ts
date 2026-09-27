import { attachBrowserWindsorStores } from "./windsor/auth";
import { completeWindsorOAuthCallback, windsorAppHref } from "./windsor/oauth";

attachBrowserWindsorStores();

const root = document.getElementById("root");

async function run(): Promise<void> {
  try {
    const completed = await completeWindsorOAuthCallback(window.location.href);
    if (root) {
      root.textContent = completed
        ? "Windsor connected. Returning to SABRO…"
        : "Windsor callback was missing a pending Connect. Return to the Windsor page and try again.";
    }
    window.history.replaceState(null, "", window.location.pathname);
    if (completed) {
      window.location.replace(`${windsorAppHref(window.location.href)}?connected=1`);
    }
  } catch (error) {
    if (root) {
      root.textContent =
        error instanceof Error ? error.message : "Windsor callback failed.";
    }
  }
}

void run();
