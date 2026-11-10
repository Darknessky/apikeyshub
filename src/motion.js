// Compositor-friendly reveals and movement. Scroll work runs only when needed.
export function createMotion({ enabled }) {
  const pending = new Set();
  const revealed = new WeakSet();
  const animations = new Map();
  const parallaxTargets = new Set();
  const visibleParallax = new Set();
  const parallaxValues = new WeakMap();
  const ambientTargets = new Set();
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let glowingCard;
  let flightDeck;
  let flightPointer;
  let flightFrame = 0;
  let steering = false;
  let pointerFrame = 0;
  let scrollFrame = 0;
  let pointer;
  let lastProgress;

  function play(element, frames, { delay = 0, duration = 560 } = {}) {
    animations.get(element)?.cancel();
    if (!enabled() || !element.isConnected) return;
    const animation = element.animate(frames, {
      duration, delay, fill: 'backwards', easing: 'cubic-bezier(.16,1,.3,1)',
    });
    animations.set(element, animation);
    const clean = () => {
      if (animations.get(element) === animation) animations.delete(element);
    };
    animation.onfinish = clean;
    animation.oncancel = clean;
  }

  function show(element, delay = 0) {
    pending.delete(element);
    revealObserver?.unobserve(element);
    element.classList.remove('reveal-pending');
    revealed.add(element);
    const isCard = element.classList.contains('provider-card');
    const isSculpture = element.classList.contains('flight-deck');
    // Individual transform properties leave hover and parallax transforms intact.
    play(element, [
      { opacity: 0, translate: '0 ' + (isCard ? 28 : isSculpture ? 18 : 32) + 'px', scale: isSculpture ? '.9' : '1' },
      { opacity: 1, translate: '0 0', scale: '1' },
    ], { delay, duration: isSculpture ? 1200 : isCard ? 650 : 850 });
  }

  function entranceDelay(element, index) {
    if (element.matches('.hero-eyebrow')) return 80;
    if (element.matches('.hero-line')) return element.previousElementSibling ? 280 : 160;
    if (element.matches('.hero-copy > p')) return 380;
    if (element.matches('.hero-actions')) return 470;
    if (element.matches('.hero-footnote')) return 560;
    if (element.matches('.flight-deck')) return 160;
    return Math.min(index * 75, 300);
  }

  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting && pending.has(entry.target) && entry.target.isConnected)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
      .forEach((entry, index) => show(entry.target, entranceDelay(entry.target, index)));
  }, { threshold: .06, rootMargin: '0px 0px -24px 0px' }) : null;

  const parallaxObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) visibleParallax.add(entry.target);
      else visibleParallax.delete(entry.target);
    });
    scheduleScroll();
  }, { rootMargin: '120px 0px 120px 0px' }) : null;

  const ambientObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      entry.target.classList.toggle('motion-offscreen', !entry.isIntersecting);
      if (entry.target.matches('.hero') && !entry.isIntersecting) clearFlight();
    });
  }, { rootMargin: '60px' }) : null;

  function refreshScrollTargets() {
    parallaxTargets.forEach(element => {
      if (!element.isConnected) {
        parallaxTargets.delete(element);
        visibleParallax.delete(element);
        parallaxObserver?.unobserve(element);
      }
    });
    document.querySelectorAll('[data-parallax]').forEach(element => {
      if (parallaxTargets.has(element)) return;
      parallaxTargets.add(element);
      if (parallaxObserver) parallaxObserver.observe(element);
      else visibleParallax.add(element);
    });
    scheduleScroll();
  }

  function refresh() {
    flightDeck = document.querySelector('.flight-deck');
    ambientTargets.forEach(element => {
      if (!element.isConnected) {
        ambientObserver?.unobserve(element);
        ambientTargets.delete(element);
      }
    });
    document.querySelectorAll('.hero, .build-section').forEach(element => {
      if (ambientTargets.has(element)) return;
      ambientTargets.add(element);
      ambientObserver?.observe(element);
    });
    refreshScrollTargets();
  }

  function reveal(elements, { replay = false } = {}) {
    elements.forEach(element => {
      if (replay) {
        revealed.delete(element);
        animations.get(element)?.cancel();
      }
      if (revealed.has(element) || pending.has(element)) return;
      if (!enabled() || !revealObserver) {
        element.classList.remove('reveal-pending');
        revealed.add(element);
        return;
      }
      pending.add(element);
      element.classList.add('reveal-pending');
      revealObserver.observe(element);
    });
    refresh();
  }

  function renderGrid(grid, markup) {
    const oldChildren = [...grid.children];
    const oldCards = new Map([...grid.querySelectorAll('.provider-card')].map(card => [card.dataset.provider, card]));
    // Capture visual positions first so an interrupted animation stays continuous.
    const before = new Map([...oldCards].map(([id, card]) => [id, card.getBoundingClientRect()]));
    const template = document.createElement('template');
    template.innerHTML = markup;
    const next = [...template.content.children].map(candidate => {
      const retained = oldCards.get(candidate.dataset.provider);
      if (retained) retained.style.setProperty('--card-index', candidate.style.getPropertyValue('--card-index'));
      return retained || candidate;
    });
    const retained = new Set(next);
    const focus = document.activeElement;
    oldChildren.forEach(element => {
      animations.get(element)?.cancel();
      if (!retained.has(element)) {
        pending.delete(element);
        revealObserver?.unobserve(element);
        if (element === glowingCard) clearGlow();
      }
    });
    grid.replaceChildren(...next);
    if (focus !== document.body && focus?.isConnected && grid.contains(focus)) focus.focus({ preventScroll: true });
    // Batch layout reads, then animate the difference back to its final position.
    const after = next.map(card => card.getBoundingClientRect());
    const newCards = [];
    next.forEach((card, index) => {
      const old = before.get(card.dataset.provider);
      if (!old || pending.has(card)) { newCards.push(card); return; }
      const dx = old.left - after[index].left;
      const dy = old.top - after[index].top;
      if (Math.abs(dx) + Math.abs(dy) > 1) {
        play(card, [
          { translate: dx + 'px ' + dy + 'px' },
          { translate: '0 0' },
        ], { duration: 480 });
      }
    });
    reveal(newCards);
  }

  function clearGlow() {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    glowingCard?.classList.remove('cursor-lit');
    glowingCard = null;
  }

  function clearFlight() {
    cancelAnimationFrame(flightFrame);
    flightFrame = 0;
    if (!steering || !flightDeck) return;
    flightDeck.style.setProperty('--flight-x', '0px');
    flightDeck.style.setProperty('--flight-y', '0px');
    flightDeck.style.setProperty('--flight-roll', '0deg');
    steering = false;
  }

  function steerFlight(event) {
    if (!enabled() || !finePointer.matches || event.pointerType !== 'mouse' || !flightDeck?.contains(event.target)) {
      clearFlight();
      return;
    }
    flightPointer = { x: event.clientX, y: event.clientY };
    if (flightFrame) return;
    flightFrame = requestAnimationFrame(() => {
      flightFrame = 0;
      if (!enabled() || !flightDeck?.isConnected) { clearFlight(); return; }
      const rect = flightDeck.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.max(-1, Math.min(1, (flightPointer.x - rect.left) / rect.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (flightPointer.y - rect.top) / rect.height * 2 - 1));
      flightDeck.style.setProperty('--flight-x', (x * 14).toFixed(2) + 'px');
      flightDeck.style.setProperty('--flight-y', (y * 10).toFixed(2) + 'px');
      flightDeck.style.setProperty('--flight-roll', (x * 4).toFixed(2) + 'deg');
      steering = true;
    });
  }

  document.addEventListener('pointermove', event => {
    steerFlight(event);
    const card = event.target.closest?.('.provider-card');
    if (!card || event.pointerType !== 'mouse' || !finePointer.matches || !enabled()) { clearGlow(); return; }
    if (glowingCard !== card) { clearGlow(); glowingCard = card; }
    pointer = { x: event.clientX, y: event.clientY };
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      if (!glowingCard?.isConnected || !enabled()) { clearGlow(); return; }
      const rect = glowingCard.getBoundingClientRect();
      glowingCard.style.setProperty('--cursor-x', (pointer.x - rect.left) + 'px');
      glowingCard.style.setProperty('--cursor-y', (pointer.y - rect.top) + 'px');
      glowingCard.classList.add('cursor-lit');
    });
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (glowingCard && !glowingCard.contains(event.relatedTarget)) clearGlow();
    if (steering && !flightDeck?.contains(event.relatedTarget)) clearFlight();
  }, { passive: true });
  window.addEventListener('blur', () => { clearGlow(); clearFlight(); });
  finePointer.addEventListener('change', () => { clearGlow(); clearFlight(); });
  document.addEventListener('focusin', event => {
    const element = event.target.closest?.('.reveal-pending');
    if (element) {
      show(element);
      animations.get(element)?.finish();
    }
  });

  function updateScroll() {
    scrollFrame = 0;
    const viewportHeight = window.innerHeight;
    const scrollRange = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
    const progress = scrollRange ? Math.min(1, Math.max(0, window.scrollY / scrollRange)) : 0;
    const progressValue = progress.toFixed(4);
    // Read all visible bounds before writing any style properties.
    const updates = enabled() ? [...visibleParallax].filter(element => element.isConnected).map(element => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const currentShift = Number.parseFloat(parallaxValues.get(element)) || 0;
      const distance = rect.top + rect.height / 2 - viewportHeight / 2 - currentShift;
      const strength = Number(element.dataset.parallax);
      const speed = Number.isFinite(strength) && strength > 0 ? Math.min(strength, .3) : .08;
      return { element, y: Math.max(-70, Math.min(70, -distance * speed)).toFixed(2), phase: Math.max(-1, Math.min(1, distance / viewportHeight)).toFixed(3) };
    }).filter(Boolean) : [...parallaxTargets].map(element => ({ element, y: '0', phase: '0' }));
    if (progressValue !== lastProgress) {
      document.documentElement.style.setProperty('--scroll-progress', progressValue);
      lastProgress = progressValue;
    }
    updates.forEach(({ element, y, phase }) => {
      if (parallaxValues.get(element) === y + ':' + phase) return;
      element.style.setProperty('--parallax-y', y + 'px');
      element.style.setProperty('--scroll-phase', phase);
      parallaxValues.set(element, y + ':' + phase);
    });
  }

  function scheduleScroll() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }

  window.addEventListener('scroll', () => { clearGlow(); clearFlight(); scheduleScroll(); }, { passive: true });
  window.addEventListener('resize', scheduleScroll, { passive: true });
  window.addEventListener('hashchange', scheduleScroll);
  document.addEventListener('load', scheduleScroll, true);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleScroll).observe(document.documentElement);

  function syncVisibility() {
    document.documentElement.classList.toggle('page-inactive', document.hidden);
    if (document.hidden) { clearGlow(); clearFlight(); }
    else scheduleScroll();
  }
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();

  function settle() {
    clearGlow();
    clearFlight();
    pending.forEach(element => {
      element.classList.remove('reveal-pending');
      revealed.add(element);
    });
    pending.clear();
    revealObserver?.disconnect();
    animations.forEach(animation => animation.finish());
    animations.clear();
    parallaxTargets.forEach(element => {
      element.style.setProperty('--parallax-y', '0px');
      element.style.setProperty('--scroll-phase', '0');
      parallaxValues.set(element, '0:0');
    });
    scheduleScroll();
  }

  return { reveal, renderGrid, settle, refresh };
}
