const isPro = new URLSearchParams(window.location.search).get("mode") === "pro";

document.body.classList.toggle("pro-page", isPro);
document.title = isPro
  ? "Fantasyland Pile-Up Poker Pro Solver"
  : "Fantasyland Pile-Up Poker Solver";

const normalModeLink = document.querySelector("#normalModeLink");
const proModeLink = document.querySelector("#proModeLink");
if (isPro) {
  normalModeLink.removeAttribute("aria-current");
  proModeLink.setAttribute("aria-current", "page");
} else {
  normalModeLink.setAttribute("aria-current", "page");
  proModeLink.removeAttribute("aria-current");
}

document.querySelectorAll(".mode-normal").forEach((element) => {
  element.hidden = isPro;
});
document.querySelectorAll(".mode-pro").forEach((element) => {
  element.hidden = !isPro;
});

const pickerPanel = document.querySelector(".picker-panel");
const resultPanel = document.querySelector(".result-panel");
const gridAttemptDetails = document.querySelector("#gridAttemptDetails");
const attemptPreview = document.querySelector("#attemptPreview");
const boardArea = document.querySelector(".board-area");
const selectedCount = document.querySelector("#selectedCount");
const manualPickerHint = document.querySelector("#manualPickerHint");
const statusLine = document.querySelector("#statusLine");
const scoringExplainerTitle = document.querySelector("#scoringExplainerTitle");
const deepSearchOption = document.querySelector("#deepSearchOption");

pickerPanel.setAttribute("aria-label", isPro ? "Pro deal card picker" : "Deal card picker");
resultPanel.setAttribute("aria-label", isPro ? "Pro optimizer result" : "Optimizer result");
gridAttemptDetails.setAttribute("aria-label", isPro ? "Pro grid attempt" : "Grid attempt");
attemptPreview.alt = isPro
  ? "Uploaded Pro grid attempt screenshot"
  : "Uploaded grid attempt screenshot";
boardArea.classList.toggle("pro-board-area", isPro);
selectedCount.textContent = isPro ? "1/30" : "0/20";
manualPickerHint.textContent = isPro ? "Choose 29 more" : "Choose 20 cards";
statusLine.textContent = isPro ? "Select 29 more cards." : "Select 20 cards.";
scoringExplainerTitle.textContent = isPro
  ? "Pro rules and scoring"
  : "What counts as a scoring way?";
deepSearchOption.value = isPro ? "45000" : "30000";
deepSearchOption.textContent = isPro ? "Deep · 45s" : "Deep · 30s";

await import(
  isPro
    ? "./proApp.js?v=pro-solver-19"
    : "./app.js?v=solver-cache-50"
);
