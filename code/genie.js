import {
  ID,
  SVG_NS,
  getCanvasFromImageData,
  createLinear,
  createQuadratic,
  generateBoundingBox,
} from "./utils.js";

/**
 * Runs a genie exit animation for the given element
 * @param {HTMLElement} element
 * @param {HTMLElement} target
 * @param {{ duration: number, debug?: boolean }} options
 */
export const genieExit = (element, target, options) => {
  //the animation has two phases:
  // 1. The element is squeezed into the flight path
  // 2. The element is moved to the target

  const phase1Duration = options.duration * 0.3;
  const phase2Duration = options.duration * 0.7;

  //step 1 - Generate bounding box for the element and the target.
  const elementBounds = element.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();

  const targetLeft = new DOMPoint(targetBounds.left, targetBounds.bottom);
  const targetRight = new DOMPoint(targetBounds.right, targetBounds.bottom);
  const elementLeft = new DOMPoint(elementBounds.left, elementBounds.bottom);
  const elementRight = new DOMPoint(elementBounds.right, elementBounds.bottom);

  const bb = generateBoundingBox(
    targetLeft,
    targetRight,
    elementLeft,
    elementRight
  );

  //We will need two containers, one for positioning & clipping, and one for applying the filter
  const container = document.createElement("div");
  const filterContainer = document.createElement("div");

  container.style.position = "absolute";
  container.style.top = bb.top + window.scrollY + "px";
  container.style.left = bb.left + "px";
  container.style.width = bb.width + "px";
  container.style.height = bb.height + "px";
  container.style.pointerEvents = "none";
  container.style.zIndex = "1000";
  container.style.overflow = "hidden"; //Needed to clip the content

  if (options.debug) container.style.outline = "1px solid red";

  filterContainer.style.inset = "100%";
  filterContainer.style.height = "100%";

  element.style.position = "absolute";
  element.style.bottom = "0";
  element.style.left = elementBounds.left - bb.left + "px";
  element.style.width = elementBounds.width + "px";

  //step 2 - Move the element to the container
  filterContainer.appendChild(element);
  container.appendChild(filterContainer);
  document.body.appendChild(container);

  const containerDimensions = container.getBoundingClientRect();
  const contentDimensions = element.getBoundingClientRect();

  const contentTop = Math.round(contentDimensions.y - containerDimensions.y);
  const contentBottom = Math.round(containerDimensions.height);
  const contentTopLeft = Math.round(
    contentDimensions.x - containerDimensions.x
  );
  const contentTopRight = Math.round(
    contentDimensions.width + contentDimensions.x - containerDimensions.x
  );

  const depthMap = new ImageData(
    containerDimensions.width,
    containerDimensions.height
  );

  //These functions define the left and right edges of the content (x position) as a function of y in the range [0, y0]
  const getLeft = createQuadratic(
    contentTopLeft,
    contentBottom,
    targetLeft.x - containerDimensions.x,
    0
  );

  const getRight = createQuadratic(
    contentTopRight,
    contentBottom,
    targetRight.x - containerDimensions.x,
    0
  );

  //The maximum displacement in either direction
  const maxDisplacementRight = targetLeft.x - containerDimensions.x;
  const maxDisplacementLeft =
    containerDimensions.width - targetRight.x + containerDimensions.x;

  /**
   * Which brighness value in the displacement map corresponds to zero displacement
   */
  const zeroValue = Math.round(
    (maxDisplacementLeft / (maxDisplacementRight + maxDisplacementLeft)) * 255
  );

  /**
   * We are limited by numerical precision, so we need to find the minimum scale factor
   * We do that by finding the maximum displacement we need to apply anywhere in the image
   *
   * We also add 15% extra for safety
   */
  const displacementScale =
    Math.max(maxDisplacementRight, maxDisplacementLeft) * 1.15;

  for (let y = 0; y < depthMap.height; y++) {
    const left = getLeft(y);
    const right = getRight(y);
    const getPercentage = createLinear(0, left, 1, right);

    for (let x = 0; x < depthMap.width; x++) {
      const percentage = getPercentage(x);
      const offsetPx = x - percentage * contentDimensions.width;
      const val = (offsetPx / displacementScale) * 255 + zeroValue;

      const index = (y * depthMap.width + x) * 4;
      depthMap.data[index] = val;
      depthMap.data[index + 1] = 0;
      depthMap.data[index + 2] = 0;
      depthMap.data[index + 3] = 255;
    }
  }

  const filterId = ID();

  //create temporary canvas to generate data URL
  const depthMapCanvas = getCanvasFromImageData(depthMap);

  if (options.debug) {
    depthMapCanvas.style.position = "absolute";
    depthMapCanvas.style.inset = "0";
    depthMapCanvas.style.zIndex = "-10";
    depthMapCanvas.style.pointerEvents = "none";
    depthMapCanvas.style.opacity = "0.5";
    container.appendChild(depthMapCanvas);
  }

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", depthMap.width.toString());
  svg.setAttribute("height", depthMap.width.toString());

  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", filterId);

  const feImage = document.createElementNS(SVG_NS, "feImage");
  feImage.setAttribute("x", "0");
  feImage.setAttribute("y", "0");
  feImage.setAttribute("width", depthMap.width + "px");
  feImage.setAttribute("height", depthMap.height + "px");
  feImage.setAttribute("result", ID());

  // Since the image is from a canvas, which use sRGB color space,
  // we need to set  the color - interpolation - filters to sRGB on all the filter elements
  feImage.setAttribute("color-interpolation-filters", "sRGB");

  feImage.href.baseVal = depthMapCanvas.toDataURL();

  const feColorMatrix = document.createElementNS(SVG_NS, "feColorMatrix");
  feColorMatrix.setAttribute("in", feImage.getAttribute("result") ?? "");
  feColorMatrix.setAttribute("type", "matrix");
  feColorMatrix.setAttribute("color-interpolation-filters", "sRGB");

  const zeroPoint = zeroValue / 255;

  //the zeroPoint should result in a value of 0.5 exactly
  //All values in the range [0, 1] should be contained in the range [0, 1]
  const slope = zeroPoint <= 0.5 ? 0.5 / (1 - zeroPoint) : 0.5 / zeroPoint;
  const intercept = 0.5 - zeroPoint * slope;

  feColorMatrix.setAttribute(
    "values",
    `${slope} 0 0 0 ${intercept}
     0 0 0 0 0 
     0 0 0 0 0.5 
     0 0 0 1 0`
  );

  if (options.debug) {
    console.log("Slope: ", slope);
    console.log("Intercept: ", intercept);
    console.log("Matrix", feColorMatrix.getAttribute("values"));
    console.log("Zero value", zeroValue);
    console.log("Zero point", zeroPoint);
    console.log("Max displacement right", maxDisplacementRight);
    console.log("Max displacement left", maxDisplacementLeft);
    console.log(containerDimensions);
  }

  feColorMatrix.setAttribute("result", ID());

  //Displacement map
  const feDisplacementMap = document.createElementNS(
    SVG_NS,
    "feDisplacementMap"
  );
  feDisplacementMap.setAttribute("in", "SourceGraphic");
  feDisplacementMap.setAttribute(
    "in2",
    feColorMatrix.getAttribute("result") ?? ""
  );

  const finalScaleValue = String(-displacementScale * 2);

  //Because the displacement is calculated as (Sample(x) * scale), where Sample(x) is between -0.5 and 0.5, we need the scale to be twice the maximum displacement
  feDisplacementMap.setAttribute("scale", "0");

  //set color space to linearRGB
  feDisplacementMap.setAttribute("color-interpolation-filters", "sRGB");
  feDisplacementMap.setAttribute("image-rendering", "smooth");

  feDisplacementMap.setAttribute("xChannelSelector", "R");
  feDisplacementMap.setAttribute("yChannelSelector", "B");

  svg.appendChild(filter);
  filter.appendChild(feImage);
  filter.appendChild(feColorMatrix);
  filter.appendChild(feDisplacementMap);

  //Animate the feDisplacementMap's scale property from 0 to the maximum displacement
  
  const animateElement = document.createElementNS(SVG_NS, "animate");
  animateElement.setAttribute("attributeName", "scale");
  animateElement.setAttribute("from", "0");
  animateElement.setAttribute("to", finalScaleValue);
  animateElement.setAttribute("dur", phase1Duration + "ms");
  animateElement.setAttribute("fill", "freeze");
  feDisplacementMap.appendChild(animateElement);
  
  //append the svg to the container, but make it invisible
  document.body.appendChild(svg);
  svg.style.position = "fixed";
  svg.style.top = "-100%";
  svg.style.left = "-100%";
  svg.style.zIndex = "-1000000";
  svg.style.pointerEvents = "none";
  svg.style.opacity = "0";

  //apply the filter to the container
  filterContainer.style.filter = `url(#${filterId})`;

  //Use the webAnimations API to animate the content's bottom property from zero to 100%

  const cleanUp = () => {
    container.remove();
    svg.remove();
  };

  const animate = isSafari() ? animateWithJS : animateWithWebAnimations;

  sleep(phase1Duration)
    // There currently is a safari bug where filters aren't applied to animated elements
    // so we need to animate the exit step by step manually
    .then(() => animate(element, { duration: phase2Duration, distance: containerDimensions.height }))
    .then(() => cleanUp());
};

function animateWithWebAnimations(element, { duration, distance }) {
  return new Promise((resolve) => {
    const animation = element.animate(
      [
        {
          transform: "translateY(0)",
        },
        {
          transform: `translateY(-${distance}px)`,
        },
      ],
      {
        duration,
        easing: "ease-in",
        fill: "forwards",
      }
    );

    animation.onfinish = resolve;
  });
}

/**
 * Manually animate the element using JS instead of the WebAnimations API
 *
 * @param {HTMLElement} element
 * @param {{ duration: number, distance: number }} options
 * @returns {Promise<void>} A promise that resolves when the animation is complete
 */
function animateWithJS(element, { duration, distance }) {
  return new Promise((resolve) => {
    const start = performance.now();
    const end = start + duration;

    element.style.transform = "translateY(0)";

    function step() {
      const now = performance.now();

      const progress = (now - start) / duration;
      const value = distance * progress;
      element.style.transform = `translateY(-${value}px)`;

      if (now < end) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(step);
  });
}

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}