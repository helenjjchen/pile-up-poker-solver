const MASK_WIDTH = 24;
const MASK_HEIGHT = 32;

// These are binary rank-glyph stencils sampled from verified, upright cards in
// the supported Pile-Up Poker UI. They deliberately contain no suit or face
// artwork, so the same rank can be compared across all four suits.
const ENCODED_RANK_GLYPHS = {
  "6": "A//AB//gD//wH4H4PwD8PgB8PAA8fAA8eAAceAAAeAAAcP/A8//g9//4/+f4/wD8/gB+/AA++AAe+AAe+AAeeAAfeAAfeAAfeAAefAAePAA+PgB+H4D8H//4D//wA//g",
  "7": "///////////////+AAA+AAA+AAB8AAB8AAD4AAD4AAHwAAHwAAPwAAPgAAPgAAfAAAfAAA+AAA+AAD+AAD8AAD8AAH4AAH4AAP4AAPwAAfwAAfAAAfAAA+AAA+AAB+AA",
  "8": "B//gH//4P//8P4H8fgB+fAA+eAAe+AAf+AAfeAAfeAAefAA+fgB+PwD8H//4D//wP//8fwD+fAA++AAf8AAP8AAP8AAP8AAP8AAP8AAP8AAP+AAffAA+fwD+P//8H//4D//w",
  "9": "B//gH//wP//4P4H8fgB8fAA++AAe+AAe+AAf8AAP8AAP+AAP+AAf+AAffAAffAA/PwD/P+P/H///D//vA/+PADAPAAAPeAAffAAefAAePgA+PgB8H4D8H//4D//wB//g",
  "10": "/A/4/A/8/B/+/B8+HB4eHDwOHDgPHDgPHDgHHHgHHHgHHHAHHHAHHHADHHADHHADHHADHHADHHADHHAHHHAHHHgHHHgHHHgHHDgPHDgPHDgOHBwOHB4+HB/+HA/8HA/4",
  J: "AAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAffAAf/AAf/AAffwA/fwA/f4D/P//+P//+D//8Af/g",
  Q: "Af/AB//gD//wH8P4HwB8PgB+eAAfeAAP8AAP8AAP8AAP8AAH8AAH8AAH8AAH8AAH8AAP8AAP8AAP8AAPeAAPfgA+HgB8H4D4D//4B//wA//4AAD4AAB8AAA+AAAfAAAP",
  K: "4AAO8AA+8AD+8AD88AH48APw8AfA8A+A8D8A8H4A8PwA8fAA8+AA/8AA/4AA/wAA/wAA/4AA/8AA8+AA8fAA8PwA8H4A8H8A8D+A8A/A8AfA8APw8AH48AD88AA+8AAf",
  A: "ADwAAHwAAH4AAP4AAP4AAP8AAf8AAf8AAe+AA++AA+eAA8fAB8fAB8PgD4PgD4PgD4HwHwHwHwDwHgD4PgD4P//8f//8f//8f//++AA++AA+8AAf8AAf8AAP4AAP4AAP",
};

function decodeBase64(encoded) {
  if (typeof atob === "function") return atob(encoded);
  // Node exposes Buffer, while browsers expose atob. The fallback keeps the
  // recognition unit tests runnable without bundler-specific globals.
  return Buffer.from(encoded, "base64").toString("binary");
}

function decodeMask(encoded) {
  const binary = decodeBase64(encoded);
  const mask = new Uint8Array(MASK_WIDTH * MASK_HEIGHT);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = (binary.charCodeAt(index >> 3) >> (7 - (index % 8))) & 1;
  }
  return mask;
}

export const RANK_GLYPH_MASK_SIZE = { width: MASK_WIDTH, height: MASK_HEIGHT };
export const RANK_GLYPH_TEMPLATES = Object.fromEntries(
  Object.entries(ENCODED_RANK_GLYPHS).map(([rank, encoded]) => [rank, decodeMask(encoded)]),
);
