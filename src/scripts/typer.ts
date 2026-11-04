// Types and deletes each phrase in turn.
const el = document.querySelector<HTMLElement>('[data-phrases]');
if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const phrases: string[] = JSON.parse(el.dataset.phrases!);
  let i = 0, n = phrases[0].length, deleting = true;
  const step = () => {
    const word = phrases[i];
    n += deleting ? -1 : 1;
    el.textContent = word.slice(0, n);
    let wait = deleting ? 45 : 90;
    if (!deleting && n === word.length) { deleting = true; wait = 2200; }
    else if (deleting && n === 0) { deleting = false; i = (i + 1) % phrases.length; wait = 300; }
    setTimeout(step, wait);
  };
  if (phrases.length > 1) setTimeout(step, 2500);
}
