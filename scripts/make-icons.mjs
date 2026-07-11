import sharp from "sharp";
import png2icons from "png2icons";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
mkdirSync(buildDir, { recursive: true });

const svg = readFileSync(path.join(buildDir, "icon.svg"));
const master = await sharp(svg, { density: 384 }).resize(1024, 1024).png().toBuffer();

// Linux / generic PNG
writeFileSync(path.join(buildDir, "icon.png"), await sharp(master).resize(512, 512).png().toBuffer());
// Windows .ico (multi-resolution)
writeFileSync(path.join(buildDir, "icon.ico"), png2icons.createICO(master, png2icons.BILINEAR, 0, false));
// macOS .icns
writeFileSync(path.join(buildDir, "icon.icns"), png2icons.createICNS(master, png2icons.BILINEAR, 0));

console.log("Brand icons written to build/ (icon.png, icon.ico, icon.icns)");
