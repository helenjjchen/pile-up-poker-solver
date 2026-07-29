const MASK_WIDTH = 24;
const MASK_HEIGHT = 32;

// Pro renders a smaller corner rank than the Normal game. These binary
// stencils are sampled from upright Pro cards and are intentionally
// color-independent so the same templates work for every suit.
const ENCODED_PRO_RANK_GLYPHS = {
  "2": [
    "AP8AAP8AD//wD//wP+f8P+f8/gH8/gH8PgB8PgB8OAB8OAB8AAH8AAH8AAH8AAH8AAfwAAfwAD/wAD/wAP/AAP/AA/8AA/8AD+AAD+AAP+AAP+AA///////////8///8",
    "AH+AAH+AD//8D//8P/P/P/P//8D//8D//wD//wD/+AAf+AAfAAD/AAD/AAD/AAD/AAP8AAP8AA/8AA/8AH/wAH/wAf+AAf+AD/AAD/AAP/AAP/AA////////P///P///",
    "Af4AAf4AP//wP//w///w+APw+AP8+AD8+AD84AD84AD8AAD8AAD8AAD8AAP8AAPwAAPwAA/wAA/wAA/wAA+AAH+AAH4AAf4AAfAAD/AAD8AAP///P//////////8///8",
    "A/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AA/4H//4H//4H//4H//4H//4H//4H//4H/////////////////////////////////",
    "A//AA//AH//AHAAA/AAA4AAA4AAHAAAHAAAHAAAHAAAHAAAHAAAHAAAHAAAHAAAHAAA4AAA4AAH4AAHAAA/AAA4AA/4AA/AAA/AAH/AAH4AA/4AA/AAA////A///A///",
    "AD/gAD/gB//8B+A8B+A8AAAAPAAAPAAAPAAAPAAHAAAHAAAHAAAHAAA/AAA8AAA8AAA8AAA8AAD8AADgAD/gAD8AAP8AAPwAAPwAB/wAB+AA/+AA/wAA///g///g///g",
  ],
  "3": [
    "AP/AAP/AD//wD//wP4f8P4f8/gH//gH//gH//gH/AAH8AAH8AD/8AD/8A//wA//wAP/8AP/8AAH8AAH8AAB/AAB/+AB/+AB//uH8/uH8P+f8P+f8D//wD//wA//AA//A",
    "AP/gAP/gB///B+A/B+A/AAAHAAAHAAAHAAAHAAAHAAAHAAAHAAAHAD//AD/8AD/8AAfgAAfgAAf8AAA8AAA/AAAHAAAHAAAHAAAH4AAH4AAH/wA/PwA/P/z/B/z8B/z8",
    "A/4AA/4A//44/AA4/AA44AA44AA/AAA/AAA/AAA4AAA4AAA4AH/4AH/AAH/AAA/AAA/AAA/4AAA4AAA/AAAHAAAHAAAAAAAHAAAH4AAH4AAH////H//4H//4A//AA//A",
    "AAA/AAA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AD/8AP//APw/wPAPwPAPwMAPwAAPwAAPwAP/AAP8AAP/AAP/wAAPwAAPwAADwAADw8ADw/wPwPwPwP//wD//A",
    "B//gB//gP//8PAD8/AD84AA84AA8AAA8AAA8AAA8AAD8AAD8AP/8AP8AAP8AAAfgAAfgAAf8AAA8AAA/AAA/AAA/AAAHAAAH4AA/4AA8/AA8/AA8///8P//gP//g",
  ],
  "4": [
    "AA/4AA/4AB/4AB/4AB/4AB/4AH/4AH/4Af/4Af/4Af/4Afv4B/v4B/P4H/P4H/P4H/P4f/P4f8P4f//+f//+////////////H//+H//+AAP4AAP4AAP4AAP4AAP4AAP4",
    "AAPAAAPAAA/wAA/wAD/wAD/wAP/wAP/wAP/wAP/wA//wA//wD8PAD8PAD8PwD8Pw/wPw/wPw/8/w/8/w///8///8////////AAPwAAPwAAPwAAPwAAPwAAPwAAPAAAPA",
    "AAf8AAf8AAf8AAf8AD/8AD/8AP/8AP/8AP/8A//8A/38A/38A+HwD+HwD4HwD4HwPgHwPgHw/gHw/gHw////////////P///P///P///AAHwAAHwAAHwAAHwAAHwAAHw",
  ],
  "5": [
    "///8///8///8/wAA/wAA+AAA+AAA+AAA+H4A+H4A///8///8/////8P//8P/+AD/+AD/+AD/AAAfAAAfAAAf+AAf+AAf+AD/+AD//8P//8P8///8P//8P//8Af4AAf4A",
  ],
  "6": [
    "AP8AAP8AA//AA//AP8PwP8PwPwD8PwD8/AAw/AAw/A8A/A8A///w///w///8///8/wD8/wD8/AA//AA//AA//AA//AA//AA/PwD8PwD8P8P8P8P8D//wD//wAP8AAP8A",
    "A//AA//AD//wD//wP8PwP8PwPwDwPwDw/AAw/AAw//8A//8A///w///w///w///w/wD//wD//AD//AD//AA//AA//AA8/AA8PwD8PwD8P//wP//wA//wA//wAP8AAP8A",
  ],
  "7": [
    "P/38P/38////////D4f/D4f/AAf/AAf/AAf8AAf8AAf8AAf8AAfwAAfwAAfwAAfwAAfAAAfAAD/AAD/AAP/AAP/AAP/AAP/AAPwAAPwAA/wAA/wAA/wAA/wAAOAAAOAA",
    "P//8P//8////////////AAB/AAB/AAB8AAH8AAH8AAH8AAHwAAfwAAfwAAfwAAfwAAfwAD/wAD/AAD/AAD/AAD/AAD8AAP8AAP8AAP8AAPwAA/wAA/wAA/wAA/wAA/wA",
  ],
  "8": [
    "AP8AAP8AD//wD//wP/P8P/P8PwD8PwD8PwA8PwA8PwD8PwD8P8D8P8D8D//wD//wD//8D//8PwD8PwD8/wA//wA//wA//wA//wA//wA/PwD8PwD8P//8P//8A//wA//w",
    "AP/AAP/AD//wD//wPwD8PwD8PwA8PwA8PwA8PwA8PwD8PwD8D8P8D8P8D//wD//wD//8D//8PwD8PwD8/AA//AA//AA//AA//AA//AA/PwD8PwD8D//wD//wA/8AA/8A",
    "A/8AA/8AP//8P//8P4H8P4H8/gB//gB//gB//gB//gB8/gB8P4f8P4f8D//wD//wP//8P//8/gB//gB//gB//gB/+AAf+AAf/gB//gB/P4B8P4B8P//wP//wA//AA//A",
  ],
  "9": [
    "AP/AAP/AD//wD//wP4f8P4f8/gB//gB//gB//gB//gB//gB//gB//gB//4H//4H/P///P///D///D///APx/APx/PgB/PgB//4B//4B/P+f8P+f8D//wD//wA//AA//A",
    "A//wA//wP//8P//8/+H8/+H8/gB//gB//gB//gB//gB//gB//gB//gB//gH//gH/P///P///D///D///AAB/AAB/PgB/PgB/P4H/P4H/P//8P//8D//wD//wAP8AAP8A",
  ],
  "10": [
    "eAPweAPw/B/8/B/8/H/+fH4+fH4+PHgePPgfPPgfPPgfPPgfPPgfPPgHPPgHPPgHPPgHPPgHPPgHPPgHPPgfPPgfPPgfPHgfPH4fPH4ePH/+PH/+PH/+PB/8PB/8",
    "/B/w/B/w/H/+/H/+/H/+PH4+fH4/fHgffPgffPgffPgffPgffPgffPgffPgffPgffPgffPgffPgffPgffPgffPgffPgffPgffPgffP4/fH4+fH/+fB/+fB/+PA/8PA/8",
  ],
  "J": [
    "AAA8AAA8AAD/AAD/AAD/AAD8AAD/AAD/AAD/AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8/wD8/wD8/wD8/wD8///8P//8P//8P//gP//g",
    "AAAHAAAHAAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA//4A//4A//4H/H4H/H///H///H///A//AA//A",
  ],
  "Q": [
    "AP4AD//wD//wH//4H8P4f8P4fgD4/gD++AB++AAe+AAf8AAf8AAf8AAf8AAf8AAf8AAe+AB++AB++AB++AB+/gD+fgD4f//4H//wD//wD//4AAP4AAP+AAB+AAB+AAAY",
    "A//AB//4B//4f//+f4H+f4H+fgA+/gA//AA/8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP/AA//AA//gA/fgA+f4H+H4H+H//+B//4AP/4AP/+AAB+AAB/AAA/AAA/AAAO",
  ],
  "K": [
    "PwAHPwAH/wD//wD//wP//wP8/w/8/w/8/3/8/3/w///w//+A//+A//4A//4A//AA//AA//AA//AA//4A//4A//+A/3+A/3/w/w/w/w/8/wP8/wP//wD//wD//wD//wD/",
    "PgB/PgB//gH//gH8/j/8/j/w/7/w/7/A///A//8A//8A//8A//8A/+AA/+AA/+AA/+AA//wA//wA//8A//8A///A///A///A/j/A/j/wPgfw/gf8/gH8/gH8OAAAOAAA",
  ],
  "A": [
    "ADwAADwAAP8AAP8AAP8AAP8AA//AA//AA//AA//AA//wA/PwD/PwD8PwD8PwD8PwD8PwD8PwD8DwP//wP//wP//wP//wP//wPwDw/wD//AA//AA//AAP/AAPMAADMAAD",
    "ADAAADAAAD8AAD8AAP8AAP8AAP/AAP/AA//AA//AA//AA//AD//wD//wD8PwD8PwD8PwD8PwP8P8P8P8P//8P//8P//8P//8P///P////AA//AA//AA//AA/MAAPMAAP",
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

export const PRO_RANK_GLYPH_TEMPLATES = Object.fromEntries(
  Object.entries(ENCODED_PRO_RANK_GLYPHS).map(([rank, encodedTemplates]) => [
    rank,
    encodedTemplates.map(decodeMask),
  ]),
);
