/* Homepage navigation. Permanent content belongs to index.html. */
(function () {
  const header = document.querySelector('.header');
  const button = header?.querySelector('.menu-btn');
  const nav = header?.querySelector('.nav');
  if (!header || !button || !nav) return;
  const mobile = window.matchMedia('(max-width: 1060px)');
  const setOpen = (open, restoreFocus = false) => {
    header.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    if (restoreFocus) button.focus();
  };
  header.classList.add('navigation-ready');
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    const target = link.hash && document.getElementById(link.hash.slice(1));
    setOpen(false);
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false, true);
    }
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) setOpen(false);
  });
  header.addEventListener('focusout', event => {
    if (event.relatedTarget && !header.contains(event.relatedTarget)) setOpen(false);
  });
  mobile.addEventListener('change', () => setOpen(false));
})();
