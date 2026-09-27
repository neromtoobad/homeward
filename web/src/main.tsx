import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { HomewardProvider } from "./state.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HomewardProvider>
      <App />
    </HomewardProvider>
  </StrictMode>,
);
