import { useEffect, useState } from "react";
import { passkeyHint } from "./lib/keys.ts";
import { Add } from "./screens/add.tsx";
import { Claim } from "./screens/claim.tsx";
import { Home } from "./screens/home.tsx";
import { Me } from "./screens/me.tsx";
import { Schedule } from "./screens/schedule.tsx";
import { Send } from "./screens/send.tsx";
import { Welcome } from "./screens/welcome.tsx";
import { useHomeward } from "./state.tsx";

export type Route = "/" | "/send" | "/schedule" | "/me" | "/add" | "/c";

export function navigate(to: string) {
  history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useRoute(): Route {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return (["/send", "/schedule", "/me", "/add", "/c"].includes(path) ? path : "/") as Route;
}

export function App() {
  const route = useRoute();
  const { session, vault, busy } = useHomeward();

  let screen;
  if (route === "/c") screen = <Claim />;
  else if (!session || !vault) screen = <Welcome returning={Boolean(passkeyHint())} />;
  else if (route === "/send") screen = <Send />;
  else if (route === "/schedule") screen = <Schedule />;
  else if (route === "/me") screen = <Me />;
  else if (route === "/add") screen = <Add />;
  else screen = <Home />;

  return (
    <main className="shell">
      {screen}
      {busy && (
        <div className="busy" role="status" aria-live="polite">
          <span className="spinner" aria-hidden /> {busy}…
        </div>
      )}
    </main>
  );
}
