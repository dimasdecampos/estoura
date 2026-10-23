// Ajudantes comuns dos testes: caminhos do projeto, Chrome e pasta das capturas de tela.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUB = path.join(ROOT, "public");
export const OUT = path.join(ROOT, "tests", "out"); // capturas de tela (ignorada pelo git)
fs.mkdirSync(OUT, { recursive: true });

// Chrome/Edge instalado. Para usar outro, defina CHROME_PATH.
export function chromePath() {
  const c = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = c.find(p => fs.existsSync(p));
  if (!found) throw new Error("Chrome não encontrado. Instale o Chrome ou defina CHROME_PATH.");
  return found;
}
export const launchArgs = () => ({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
