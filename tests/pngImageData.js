import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

// The fixture screenshots are ordinary 8-bit, non-interlaced RGB/RGBA PNGs.
// Keeping this tiny decoder in-tree makes recognizer regressions runnable with
// the project's built-in Node runtime rather than a native image dependency.
export function pngImageData(buffer) {
  if (buffer.length < PNG_SIGNATURE.length || !PNG_SIGNATURE.every((value, index) => buffer[index] === value)) {
    throw new Error("Expected a PNG image.");
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const compressedParts = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error("Truncated PNG image.");

    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      const compression = buffer[dataStart + 10];
      const filter = buffer[dataStart + 11];
      const interlace = buffer[dataStart + 12];
      if (bitDepth !== 8 || ![2, 6].includes(colorType) || compression !== 0 || filter !== 0 || interlace !== 0) {
        throw new Error("Unsupported PNG fixture format.");
      }
    } else if (type === "IDAT") {
      compressedParts.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || !compressedParts.length) throw new Error("PNG is missing image data.");

  const sourceChannels = colorType === 6 ? 4 : 3;
  const stride = width * sourceChannels;
  const inflated = inflateSync(Buffer.concat(compressedParts));
  if (inflated.length !== height * (stride + 1)) throw new Error("Unexpected PNG pixel data length.");

  const unfiltered = new Uint8Array(height * stride);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * stride;
    const previousRow = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset];
      sourceOffset += 1;
      const left = x >= sourceChannels ? unfiltered[rowStart + x - sourceChannels] : 0;
      const above = y > 0 ? unfiltered[previousRow + x] : 0;
      const upperLeft = y > 0 && x >= sourceChannels ? unfiltered[previousRow + x - sourceChannels] : 0;
      let decoded;
      if (filterType === 0) decoded = value;
      else if (filterType === 1) decoded = value + left;
      else if (filterType === 2) decoded = value + above;
      else if (filterType === 3) decoded = value + Math.floor((left + above) / 2);
      else if (filterType === 4) decoded = value + paeth(left, above, upperLeft);
      else throw new Error("Unsupported PNG filter.");
      unfiltered[rowStart + x] = decoded & 255;
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < unfiltered.length; sourceIndex += sourceChannels) {
    data[targetIndex] = unfiltered[sourceIndex];
    data[targetIndex + 1] = unfiltered[sourceIndex + 1];
    data[targetIndex + 2] = unfiltered[sourceIndex + 2];
    data[targetIndex + 3] = sourceChannels === 4 ? unfiltered[sourceIndex + 3] : 255;
    targetIndex += 4;
  }

  return { width, height, data };
}
