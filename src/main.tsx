import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fredoka, self-hosted (the reference loaded it from Google Fonts)
import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "./game/ui/game.css";
import { LocalStore } from "./data/gameStore";
import { Game } from "./game/ui/Game";

const store = new LocalStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Game store={store} />
  </StrictMode>,
);
