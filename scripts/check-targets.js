// Paste into DevTools on each page at a narrow viewport.
(() => {
  const controls = [...document.querySelectorAll("a,button,summary,input,select,textarea,[role=button]")];
  console.table(controls.flatMap(control => {
    const target = control.closest("label") ?? control;
    const rect = target.getBoundingClientRect();
    if (control.closest("[hidden],[inert]") || !rect.width || !rect.height ||
      getComputedStyle(control).visibility === "hidden" || (rect.width >= 44 && rect.height >= 44)) return [];
    return [{ element: control.tagName, label: control.getAttribute("aria-label") ?? control.textContent.trim(), width: rect.width, height: rect.height }];
  }));
})();
