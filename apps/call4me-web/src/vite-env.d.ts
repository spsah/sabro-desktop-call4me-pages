/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Same-origin Path A default is /windsor-mcp/. Set `direct` only for github.io fallback builds. */
  readonly VITE_WINDSOR_MCP_PROXY?: string;
  /** Same-origin default is /aigate/v1/messages. Set `direct` only for local prove against the bridge. */
  readonly VITE_AIGATE_PROXY?: string;
  /** Show interim List/Worst prove buttons. Default off; `?prove=1` also works. */
  readonly VITE_WINDSOR_PROVE_UI?: string;
  readonly VITE_EVIDENCE_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
