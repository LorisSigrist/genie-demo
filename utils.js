export const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Generate a random String that can be used as an id.
 * @returns
 */
export function ID() {
  return Math.random().toString(36).slice(2);
}

/**
 * Get an element by its id and assert its type.
 *
 * @template T
 * @param {string} id
 * @param {{ new(): T }} prototype
 * @throws If the element with the given id is not found, or is of a different type.
 */
export function getElementById(id, prototype) {
  const element = document.getElementById(id);
  if (element instanceof prototype) {
    return element;
  }
  throw new Error(
    `Element with id ${id} is not an instance of ${prototype.name}`
  );
}

/**
 * Creates a new Canvas element with the dimensions and content of the given ImageData.
 * @param {ImageData} imageData
 * @returns {HTMLCanvasElement}
 */
export function getCanvasFromImageData(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d", { colorSpace: imageData.colorSpace });
  if (!ctx) throw new Error("Failed to create canvas context");
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Creates a linear function that maps the given range to the given domain.
 * The resulting function is f(y) => x
 *
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {(y: number) => number}
 */
export function createLinear(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return (y) => x0 + (y - y0) * (dx / dy);
}

/**
 * Creates a quadratic function that maps the given range to the given domain.
 * The inflection point is at (x0, y0)
 *
 * The resulting function is f(y) => x
 *
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {(y: number) => number}
 */
export function createQuadratic(x0, y0, x1, y1) {
  return (y) => x0 + Math.pow((y - y0) / (y1 - y0), 2) * (x1 - x0);
}


/**
 * Generates the smallest bounding box that contains all the given points.
 * 
 * @param {DOMPoint[]} points 
 * @returns {DOMRect}
 */
export function generateBoundingBox(...points) {
  const left = Math.min(...points.map(pt => pt.x));
  const top = Math.min(...points.map(pt => pt.y));
  const right = Math.max(...points.map(pt => pt.x));
  const bottom = Math.max(...points.map(pt => pt.y));

  const width = right - left;
  const height = bottom - top;

  return new DOMRect(left, top, width, height);
}