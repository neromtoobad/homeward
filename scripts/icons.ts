// Renders web/public/icon.svg to the PNG sizes iOS and Android install prompts want.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const svg = readFileSync("web/public/icon.svg", "utf8");
for (const size of [180, 192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(`web/public/icon-${size}.png`, png);
  console.log(`web/public/icon-${size}.png`);
}
