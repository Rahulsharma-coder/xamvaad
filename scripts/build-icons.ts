/**
 * Rasterises the brand mark into the icon files browsers actually want.
 *
 * app/icon.svg covers every modern browser, but two gaps remain: Safari on
 * iOS ignores SVG touch icons, and a bare .ico is still the most reliable
 * fallback for a pinned tab or an old browser. Both are generated from the
 * same SVG so they cannot drift from the component.
 *
 *   npm run build-icons
 *
 * Only run this when the mark changes — the outputs are checked in, so a
 * normal build never needs it. `sharp` comes in with Next.js rather than as a
 * direct dependency, which is why this is not part of `npm run build`.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "src", "app", "icon.svg");

/**
 * Wraps a PNG in an ICO container.
 *
 * Every browser released this side of Vista reads PNG-compressed .ico
 * entries, so there is no need to encode a BMP — the header is 22 bytes and
 * the payload is the PNG verbatim.
 */
function pngToIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size >= 256 ? 0 : size, 6); // width (0 means 256)
  header.writeUInt8(size >= 256 ? 0 : size, 7); // height
  header.writeUInt8(0, 8); // palette size
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // offset to the payload
  return Buffer.concat([header, png]);
}

async function render(size: number): Promise<Buffer> {
  // density scales the SVG before rasterising; without it small sizes come
  // out of the rasteriser soft.
  return sharp(await readFile(source), { density: 384 })
    .resize(size, size, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const outputs: [string, number][] = [
    // Next.js picks these up from app/ by filename convention.
    [path.join(root, "src", "app", "apple-icon.png"), 180],
    // Referenced by the web manifest for installed/PWA use.
    [path.join(root, "public", "icon-192.png"), 192],
    [path.join(root, "public", "icon-512.png"), 512],
    // Social preview fallback.
    [path.join(root, "public", "logo-mark.png"), 512],
  ];

  for (const [file, size] of outputs) {
    await writeFile(file, await render(size));
    console.log(`  ${size.toString().padStart(3)}px  ${path.relative(root, file)}`);
  }

  const ico = pngToIco(await render(32), 32);
  const icoPath = path.join(root, "src", "app", "favicon.ico");
  await writeFile(icoPath, ico);
  console.log(`   32px  ${path.relative(root, icoPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
