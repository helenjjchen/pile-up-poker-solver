import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { recognizeFantasylandImageData } from "../src/screenshotRecognizer.js";
import { pngImageData } from "./pngImageData.js";

const SUIT_COLORS = {
  H: [245, 151, 157],
  S: [83, 172, 232],
  C: [134, 165, 122],
  D: [245, 181, 88],
};

const fixtures = [
  {
    file: "pileup-iphone-club-discard-partial.png",
    total: 14370,
    grid: ["8S", "6H", "7C", "9H", "7H", "AD", "7D", "9D", "9S", "QH", "8C", "9C", "10D", "QS", "KH", "JH"],
    discard: ["KC", "QC", "AC", "JC"],
  },
  {
    file: "pileup-iphone-club-discard-15870.png",
    total: 15870,
    grid: ["8S", "9H", "7H", "10D", "7D", "9C", "6H", "8C", "QS", "AD", "KH", "JH", "7C", "9S", "QH", "9D"],
    discard: ["KC", "QC", "AC", "JC"],
  },
];

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  return { hue, saturation, lightness };
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (section < 1) [r, g] = [chroma, intermediate];
  else if (section < 2) [r, g] = [intermediate, chroma];
  else if (section < 3) [g, b] = [chroma, intermediate];
  else if (section < 4) [g, b] = [intermediate, chroma];
  else if (section < 5) [r, b] = [intermediate, chroma];
  else [r, b] = [chroma, intermediate];
  const offset = lightness - chroma / 2;
  return [
    Math.round((r + offset) * 255),
    Math.round((g + offset) * 255),
    Math.round((b + offset) * 255),
  ];
}

function hueDistance(first, second) {
  const distance = Math.abs(first - second);
  return Math.min(distance, 360 - distance);
}

const sourceHues = Object.fromEntries(
  Object.entries(SUIT_COLORS).map(([suit, rgb]) => [suit, rgbToHsl(...rgb).hue]),
);

// Change hue while retaining each pixel's saturation and lightness. That keeps
// antialiasing coverage and glyph geometry stable while assigning every suit
// a genuinely different theme color.
function recolorSuitPalette(imageData, targetHues) {
  const data = new Uint8ClampedArray(imageData.data);
  const changedBySuit = Object.fromEntries(Object.keys(SUIT_COLORS).map((suit) => [suit, 0]));
  let changedPixels = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const hsl = rgbToHsl(data[offset], data[offset + 1], data[offset + 2]);
    if (hsl.saturation < 0.08) continue;

    let nearestSuit = null;
    let nearestDistance = Infinity;
    for (const [suit, sourceHue] of Object.entries(sourceHues)) {
      const distance = hueDistance(hsl.hue, sourceHue);
      if (distance < nearestDistance) {
        nearestSuit = suit;
        nearestDistance = distance;
      }
    }
    if (nearestDistance > 18) continue;

    const [red, green, blue] = hslToRgb(
      targetHues[nearestSuit],
      hsl.saturation,
      hsl.lightness,
    );
    if (red === data[offset] && green === data[offset + 1] && blue === data[offset + 2]) continue;
    data[offset] = red;
    data[offset + 1] = green;
    data[offset + 2] = blue;
    changedPixels += 1;
    changedBySuit[nearestSuit] += 1;
  }

  return {
    imageData: { width: imageData.width, height: imageData.height, data },
    changedPixels,
    changedBySuit,
  };
}

const themes = [
  {
    name: "canonical colors assigned to different suits",
    hues: {
      H: sourceHues.S,
      S: sourceHues.C,
      C: sourceHues.D,
      D: sourceHues.H,
    },
  },
  {
    name: "novel high-contrast hues",
    hues: {
      H: 182,
      S: 282,
      C: 6,
      D: 64,
    },
  },
];

for (const fixture of fixtures) {
  const original = pngImageData(readFileSync(new URL(`./fixtures/${fixture.file}`, import.meta.url)));

  for (const theme of themes) {
    const label = `${fixture.file} (${theme.name})`;
    const recolored = recolorSuitPalette(original, theme.hues);
    assert.ok(
      recolored.changedPixels > original.width * original.height * 0.01,
      `${label}: the test must substantially recolor the screenshot`,
    );
    for (const suit of Object.keys(SUIT_COLORS)) {
      assert.ok(recolored.changedBySuit[suit] > 250, `${label}: the ${suit} palette must be meaningfully recolored`);
    }

    const recognized = recognizeFantasylandImageData(recolored.imageData);
    assert.deepEqual(recognized.grid, fixture.grid, `${label}: grid cards`);
    assert.deepEqual(recognized.discard, fixture.discard, `${label}: discard cards`);
    assert.equal(recognized.displayedScore.total, fixture.total, `${label}: displayed score`);
    assert.equal(recognized.displayedScore.handCount, 10, `${label}: displayed hand count`);
    assert.equal(
      recognized.complete,
      true,
      `${label}: recognition should be complete (${recognized.warning || "no warning"})`,
    );
    assert.equal(recognized.warning, "", `${label}: recognition should not need manual correction`);
  }
}

console.log("recognizer theme-invariance tests passed");
