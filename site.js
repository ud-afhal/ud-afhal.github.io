document.addEventListener("DOMContentLoaded", () => {
  // Proofs start collapsed on every page load; native <details> handles mouse and touch.
  document.querySelectorAll("details.proof[open]").forEach(el => el.removeAttribute("open"));

  // If MathJax is unavailable, preserve the original TeX source visibly.
  const fallback = () => {
    document.querySelectorAll(".math-source").forEach(el => {
      el.textContent = el.dataset.tex || el.textContent;
      el.classList.add("math-source-fallback");
    });
  };
  window.setTimeout(() => {
    if (!window.MathJax || !window.MathJax.typesetPromise) fallback();
  }, 3500);
});
