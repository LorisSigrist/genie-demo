import {
  ID,
  SVG_NS,
  getCanvasFromImageData,
  createLinear,
  createQuadratic,
} from "./utils.js";

/**
 * Runs a genie exit animation for the given element
 * @param {HTMLElement} element
 * @param {HTMLElement} target
 * @param {{ duration: number }} options
 */
export const genieExit = (element, target, options) => {
  //step 1 - Generate bounding box for the element and the target.
  const elementBounds = element.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();

  //We will need two containers, one for positioning & clipping, and one for applying the filter
  const container = document.createElement("div");
  const filterContainer = document.createElement("div");

  container.style.position = "absolute";
  container.style.top = targetBounds.bottom + window.scrollY + "px";
  container.style.left = Math.min(elementBounds.left, targetBounds.left) + "px";
  container.style.right =
    window.innerWidth -
    Math.max(elementBounds.right, targetBounds.right) +
    "px";
  container.style.bottom =
    window.innerHeight - window.scrollY - elementBounds.bottom + "px";
  container.style.pointerEvents = "none";
  container.style.zIndex = "1000";
  container.style.overflow = "hidden"

  element.style.position = "absolute";
  element.style.bottom = "0";
  element.style.left = "0";

  //Add the element to the container
  document.body.appendChild(container);

  filterContainer.style.width = "100%";
  filterContainer.style.height = "100%";

  container.appendChild(filterContainer);

  //step 2 - Move the element to the container
  filterContainer.appendChild(element);

  const containerDimensions = container.getBoundingClientRect();
  const contentDimensions = element.getBoundingClientRect();
  const targetDimensions = target.getBoundingClientRect();

  /**
   * The distance from the top of the container to the top of the content
   */
  const y0 = contentDimensions.y - containerDimensions.y;

  /**
   * The left edge of the exit window
   */
  const x0 = containerDimensions.width - targetDimensions.width;

  /**
   * The distance from the left of the container to the left of the content
   */
  const x1 = contentDimensions.width;

  const depthMap = new ImageData(
    containerDimensions.width,
    containerDimensions.height
  );

  //These functions define the left and right edges of the content (x position) as a function of y in the range [0, y0]
  const getLeft = createQuadratic(0, y0, x0, 0);
  const getRight = createQuadratic(x1, y0, containerDimensions.width, 0);

  /**
   * We are limited by numerical precision, so we need to find the minimum scale factor
   * We do that by finding the maximum displacement we need to apply anywhere in the image
   *
   * We also add 20% extra for safety
   */
  const maxDisplacement = Math.max(x0, containerDimensions.width - x1) * 1.2;

  for (let y = 0; y < y0; y++) {
    const left = getLeft(y);
    const right = getRight(y);
    const getPercentage = createLinear(0, left, 1, right);

    for (let x = 0; x < depthMap.width; x++) {
      const offset = x - getPercentage(x) * contentDimensions.width;
      const val = (offset / maxDisplacement) * 255;

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
  // document.body.appendChild(newCanvas);

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
  feImage.setAttribute("result", "image-raw");

  // Since the image is from a canvas, which use sRGB color space,
  // we need to set  the color - interpolation - filters to sRGB on all the filter elements
  feImage.setAttribute("color-interpolation-filters", "sRGB");

  feImage.href.baseVal = newCanvas.toDataURL();

  const feColorMatrix = document.createElementNS(SVG_NS, "feColorMatrix");
  feColorMatrix.setAttribute("in", "image-raw");
  feColorMatrix.setAttribute("type", "matrix");
  feColorMatrix.setAttribute("color-interpolation-filters", "sRGB");

  //Remap the R channel from 0-1 to 0.5-1
  //Set the B channel to exactly 0.5
  feColorMatrix.setAttribute(
    "values",
    "0.5 0 0 0 0.5 0 0 0 0 0 0 0 0 0 0.5 0 0 0 1 0"
  );
  feColorMatrix.setAttribute("result", "image");

  //Displacement map
  const feDisplacementMap = document.createElementNS(
    SVG_NS,
    "feDisplacementMap"
  );
  feDisplacementMap.setAttribute("in", "SourceGraphic");
  feDisplacementMap.setAttribute("in2", "image");

  //Because the displacement is calculated as (Sample(x) * scale), where Sample(x) is between -0.5 and 0.5, we need the scale to be twice the maximum displacement
  feDisplacementMap.setAttribute("scale", String(-maxDisplacement * 2));

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

  //apply the filter to the container
  filterContainer.style.filter = `url(#${filterId})`;

  //Use the webAnimations API to animate the content's bottom property from zero to 100%
  const animation = element.animate(
    [
      { transform: "translateY(0)", opacity: 1 },
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
