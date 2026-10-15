import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fredoka, self-hosted (the reference loaded it from Google Fonts)
import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "./game/ui/game.css";
import "./app/app.css";
import { App } from "./app/App";
import { SupabaseBackend } from "./data/supabaseBackend";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const root = createRoot(document.getElementById("root")!);

if (!url || !key) {
  root.render(
    <div className="screen">
      <h1>Not set up yet</h1>
      <p className="center">Copy .env.example to .env.local and fill in your Supabase URL and anon key, then restart.</p>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <App backend={new SupabaseBackend(url, key)} />
    </StrictMode>,
  );
}
