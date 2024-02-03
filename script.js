import { genieExit } from "./genie.js";
import { getElementById } from "./utils.js";

const target = getElementById("target", HTMLDivElement);
const genieElements = /** @type {NodeListOf<HTMLElement>}  */ (
  document.querySelectorAll(".genie")
);

genieElements.forEach((element) => {
  element.addEventListener("click", () => {
    genieExit(element, target, { duration: 400 });
  });
});
