// The bare game with browser-only saving, for the Playwright parity check against the
// reference file. Only built when PARITY=1 (see vite.config.ts); never deployed.
import { createRoot } from "react-dom/client";
import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "./game/ui/game.css";
import { LocalStore } from "./data/gameStore";
import { Game } from "./game/ui/Game";

// adaptive off and the original 5 rares: the parity check compares against the reference
createRoot(document.getElementById("root")!).render(<Game store={new LocalStore()} adaptive={false} classicRares />);
