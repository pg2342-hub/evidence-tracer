import { createRoot } from "react-dom/client";
import { App } from "./App";

fetch("./data.json")
  .then((r) => r.json())
  .then((data) => createRoot(document.getElementById("root")!).render(<App data={data} />));
