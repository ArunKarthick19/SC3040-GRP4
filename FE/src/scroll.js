// Scrolls so `el` sits `offset` px below the top of the screen (clear of the sticky navbar), over `duration` ms
export function scrollToElement(el, duration = 500, offset = 88) {
  const start = window.scrollY;
  const end = el.getBoundingClientRect().top + window.scrollY - offset;
  const startTime = performance.now();

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // fast at first, slows down at the end
    window.scrollTo(0, start + (end - start) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
