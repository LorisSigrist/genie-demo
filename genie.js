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

  //step 2 - Move the element to the container
  filterContainer.appendChild(element);
  container.appendChild(filterContainer);
  document.body.appendChild(container);

  const containerDimensions = container.getBoundingClientRect();
  const contentDimensions = element.getBoundingClientRect();

  /**
   * The distance from the top of the container to the top of the content
   */
  const y0 = contentDimensions.y - containerDimensions.y;

  /**
   * The left edge of the exit window
   */
  const x0 = targetLeft.x - containerDimensions.x;

  /**
   * The distance from the left of the container to the left of the content
   */
  const x1 = contentDimensions.width;

  const depthMap = new ImageData(
    containerDimensions.width,
    containerDimensions.height
  );

  //These functions define the left and right edges of the content (x position) as a function of y in the range [0, y0]
  const getLeft = createQuadratic(
    0,
    y0,
    targetLeft.x - containerDimensions.x,
    0
  );
  const getRight = createQuadratic(
    x1,
    y0,
    targetRight.x - containerDimensions.x,
    0
  );

  //The maximum displacement in either direction
  const maxDisplacementRight = targetLeft.x - containerDimensions.x;
  const maxDisplacementLeft =
    containerDimensions.width - targetRight.x + containerDimensions.x;

  //Which value in the displacement map corresponds to zero displacement
  const zeroValue = Math.round(
    (maxDisplacementLeft / (maxDisplacementRight + maxDisplacementLeft)) * 255
  );

  /**
   * We are limited by numerical precision, so we need to find the minimum scale factor
   * We do that by finding the maximum displacement we need to apply anywhere in the image
   *
   * We also add 20% extra for safety
   */
  const displacementScale =
    Math.max(maxDisplacementRight, maxDisplacementLeft) * 1.2;

  for (let y = 0; y < y0; y++) {
    const left = getLeft(y);
    const right = getRight(y);
    const getPercentage = createLinear(0, left, 1, right);

    for (let x = 0; x < depthMap.width; x++) {
      const offset = x - getPercentage(x) * contentDimensions.width;
      const val = (offset / displacementScale) * 255;

      const index = (y * depthMap.width + x) * 4;
      depthMap.data[index] = val;
      depthMap.data[index + 1] = 0;
      depthMap.data[index + 2] = 0;
      depthMap.data[index + 3] = 255;
    }
  }

  //Fill the rest of the image with black
  for (let y = y0; y < depthMap.height; y++) {
    for (let x = 0; x < depthMap.width; x++) {
      const index = (y * depthMap.width + x) * 4;
      depthMap.data[index] = 0;
      depthMap.data[index + 1] = 0;
      depthMap.data[index + 2] = 0;
      depthMap.data[index + 3] = 255;
    }
  }

  const filterId = ID();

  //create temporary canvas to generate data URL
  const newCanvas = getCanvasFromImageData(depthMap);

  // (optional) add the canvas to the body to see the generated depth map
  document.body.appendChild(newCanvas);

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

  feImage.href.baseVal = newCanvas.toDataURL();

  const feColorMatrix = document.createElementNS(SVG_NS, "feColorMatrix");
  feColorMatrix.setAttribute("in", feImage.getAttribute("result") ?? "");
  feColorMatrix.setAttribute("type", "matrix");
  feColorMatrix.setAttribute("color-interpolation-filters", "sRGB");

  const slope = createLinear(1, 0, 0.5, 127.5)(Math.abs(127.5 - zeroValue));
  const intercept = 0.5 - slope * zeroValue;

  //Remap the R channel from 0-1 to 0.5-1
  //Set the B channel to exactly 0.5
  feColorMatrix.setAttribute(
    "values",
    `${slope} 0 0 0 ${intercept}
     0 0 0 0 0 
     0 0 0 0 0.5 
     0 0 0 1 0`
  );


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

  //Because the displacement is calculated as (Sample(x) * scale), where Sample(x) is between -0.5 and 0.5, we need the scale to be twice the maximum displacement
  feDisplacementMap.setAttribute("scale", String(-displacementScale * 2));

  //set color space to linearRGB
  feDisplacementMap.setAttribute("color-interpolation-filters", "sRGB");
  feDisplacementMap.setAttribute("image-rendering", "smooth");

  feDisplacementMap.setAttribute("xChannelSelector", "R");
  feDisplacementMap.setAttribute("yChannelSelector", "B");

  svg.appendChild(filter);
  filter.appendChild(feImage);
  filter.appendChild(feColorMatrix);
  filter.appendChild(feDisplacementMap);

  //append the svg to the container, but make it invisible
  document.body.appendChild(svg);
  svg.style.position = "fixed";
  svg.style.top = "-100%";
  svg.style.left = "-100%";
  svg.style.pointerEvents = "none";
  svg.style.opacity = "0";
  svg.style.zIndex = "-1000000";

  //apply the filter to the container
  filterContainer.style.filter = `url(#${filterId})`;

  //Use the webAnimations API to animate the content's bottom property from zero to 100%
  const animation = element.animate(
    [
      {
        transform: "translateY(0)",
      },
      {
        transform: `translateY(-${containerDimensions.height}px)`,
        opacity: 0,
      },
    ],
    {
      duration: options.duration,
      easing: "ease-in",
      fill: "forwards",
    }
  );

  //When the animation is complete, remove the container and the svg
  animation.onfinish = () => {
    container.remove();
    svg.remove();
  };
};
