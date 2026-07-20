const MASK_WIDTH = 16;
const MASK_HEIGHT = 24;

// Samples of the score font taken from verified Pile-Up Poker screenshots at
// several screen sizes and both light/dark appearances. Digits absent from the
// current corpus fall back to the structural classifier in screenshotRecognizer.
const ENCODED_SCORE_GLYPHS = {
  "0": [
    "A8AP+D/8P/5//ngeeB/wD/AP8A/wD/AH8AfwB/AP8A/wD/gPeB58Pn/+P/wf+A/w",
    "B+A//H/+f/58Pvw/8D/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP/D/8Pn5+f/4//A/w",
    "A8Af/h/+H/4f/n//fh94D/gP+A/4D/gP+A/4D/gP+A94D3gffh9+H3//H/4f/g/4",
  ],
  "1": [
    "/////////////wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/",
    "P/z//////////wP/A/8D/wP/A/8D/wP/A/8D/wP/A/8D/wP/A/8D/wP/A/8D/wP/",
    "//////////8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/",
    "//////////8D/wP/A/8D/wP/A/8D/wP/A/8D/wP/A/8D/wP/A/8D/wP/A/8D/wP/",
  ],
  "2": ["B+Af8D/4f/x+fnge8B7wHvAeAB4APgA8AHwA+AHwA/AH4A/AH4B/AP//////////"],
  "4": ["AHwA/AD8AfwB/AP8B/wPvA+8Hzw/PD48Pjx+PPw8//////////8AfAA8ADwAPAA8"],
  "5": ["f/x//n/+f/5//nAAcABwAHf4f/x//n/+fB94D3APAAcAB/AP+A98H3/+P/4f/A/4"],
  "7": [
    "//////////8APgA+AHwAfAB8APgA+ADwAfAB8APwA+AD4AfAB8APgA+AH4AfAB8A",
    "//////////8ADwA/AD4APgB8AHwA/ADwAPAA8APwA+AD4AfgB8AHwA8ADwAPAA8A",
    "//////////8APwA/AD4A/gD+AP4A+AH4AfgB4AHgAeAH4AfgB+AHgB+AH4AfgB8A",
  ],
  "8": [
    "A+Af+H/+fn/4H/gP+A/4D/gffD4//B/4f/78P/gf8A/wD/AP8A/4H/4/f/4//A/w",
    "A8A//H/+f/54HngeeB54Hn5+fn5//j/8f/7///gf+B/wD/AP+B94Hn/+f/4//APA",
  ],
  "9": [
    "B8Af+D/8f/58Pnge8A/wD/AP8A/4D3wff/8//x//D+cAD3gPeA98Hj/+P/wf+A/w",
    "D+A//H/+f/78Pvw/8A/wD/AP8A/8D/wPf/9//z//D+8AD/AP/A98D34+f/4//g/w",
    "D8B/+H/4f/5+fv5++B/wH/Af8B/4H/gff/9//x//H/8AH3gfeB94Hn/+f/5//h/4",
  ],
};

function decodeBase64(encoded) {
  if (typeof atob === "function") return atob(encoded);
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

export const SCORE_GLYPH_MASK_SIZE = { width: MASK_WIDTH, height: MASK_HEIGHT };
export const SCORE_GLYPH_TEMPLATES = Object.fromEntries(
  Object.entries(ENCODED_SCORE_GLYPHS).map(([digit, glyphs]) => [digit, glyphs.map(decodeMask)]),
);
