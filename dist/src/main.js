import { PROVIDERS, FILTER_GROUPS } from './data.js';
import { REFERRAL_LINKS } from './config.js';
import { COLLECTIONS, getResults, facetCount } from './directory.js';
import { icon, providerMark } from './icons.js';
import { createMotion } from './motion.js';

const state = { query: '', collection: 'all', sort: 'curated', filters: Object.fromEntries(FILTER_GROUPS.map(g => [g.key, []])) };
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused = false;
const effects = createMotion({ enabled: () => !motion.matches && !motionPaused });
motion.addEventListener('change', () => {
  if (motion.matches) {
    effects.settle();
    document.getAnimations().filter(animation => !animation.animationName).forEach(animation => animation.finish());
  } else effects.refresh();
});
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const statusBadge = p => `<span class='status status-${p.status.toLowerCase()}'><span class='status-dot'></span>${p.status}</span>`;
const apiButton = p => `<a class='button api-button' href='${esc(REFERRAL_LINKS[p.id])}' target='_blank' rel='noopener noreferrer' data-get-api='${p.id}' aria-label='Get API for ${esc(p.name)} (opens in a new tab)'>Get API key ${icon('external')}</a>`;
let previousFocus;
let toastTimeout;
let pendingDirectorySearch = false;

// Capturing image events also handles icons inserted later into a details dialog.
document.addEventListener('load', event => {
  if (event.target.matches?.('.provider-logo')) event.target.closest('.provider-mark').classList.add('icon-loaded');
}, true);
document.addEventListener('error', event => {
  if (event.target.matches?.('.provider-logo')) {
    event.target.hidden = true;
    event.target.closest('.provider-mark').classList.add('icon-unavailable');
  }
}, true);

document.querySelector('#app').innerHTML = `
  <div class='app-shell'>
    <div class='scroll-progress' aria-hidden='true'></div>
    <header class='header'>
      <a class='brand' href='#discover' aria-label='ModelWing API home'><span class='brand-mark'><img class='brand-logo' src='/favicon.svg?v=purple3' alt='' width='38' height='38'></span><span class='brand-copy'><strong>ModelWing<span class='brand-period'>.</span></strong><small>THE API DIRECTORY</small></span></a>
      <nav aria-label='Main navigation'><a class='nav-link active' href='#discover'>The directory</a><a class='nav-link' href='#guides'>Field guide ${icon('external')}</a></nav>
      <div class='header-actions'><button class='search-shortcut' data-focus-search aria-label='Search the directory'>${icon('search')}<span>Find your API</span><kbd aria-hidden='true'>Ctrl K</kbd></button></div>
    </header>
    <main id='main-content'>
      <section class='hero' aria-labelledby='hero-title'>
        <div class='hero-copy'>
          <div class='hero-eyebrow'><span></span> A SMALL DIRECTORY FOR BIG IDEAS ${icon('sparkles')}</div>
          <h1 id='hero-title'><span class='hero-line'>Good ideas.</span><span class='hero-line'><em>Great APIs.</em></span></h1>
          <p>A spark of an idea. The right connection.<br>Discover AI providers that help you build what’s next.</p>
          <div class='hero-actions'><button class='button button-primary browse-providers'>Explore the directory ${icon('arrow')}</button><a class='hero-guide' href='#guides'>Take the first step ${icon('external')}</a></div>
          <div class='hero-footnote'><span class='mini-marks'>${PROVIDERS.slice(0, 3).map(providerMark).join('')}</span><span><strong>${String(PROVIDERS.length).padStart(2, '0')} curated providers</strong><br>Your next connection is here.</span></div>
        </div>
        <div class='flight-deck' data-parallax='0.035'>
          <div class='orbital-glow' aria-hidden='true'></div>
          <svg class='wing-sculpture' viewBox='0 0 600 540' fill='none' aria-hidden='true'>
            <defs>
              <linearGradient id='wing-metal' x1='8' y1='9' x2='53' y2='53' gradientUnits='userSpaceOnUse'><stop stop-color='#e4d8ff'/><stop offset='.2' stop-color='#9b72f0'/><stop offset='.44' stop-color='#6533b9'/><stop offset='.52' stop-color='#eee5ff'/><stop offset='.62' stop-color='#b490ff'/><stop offset='1' stop-color='#4d247d'/></linearGradient>
              <linearGradient id='wing-edge' x1='12' y1='15' x2='46' y2='49' gradientUnits='userSpaceOnUse'><stop stop-color='#f4ecff'/><stop offset='.5' stop-color='#d3baff'/><stop offset='1' stop-color='#7e48d5'/></linearGradient>
              <linearGradient id='orbit-light' x1='65' y1='380' x2='510' y2='170' gradientUnits='userSpaceOnUse'><stop stop-color='#bd93ff' stop-opacity='0'/><stop offset='.5' stop-color='#c4a8ff'/><stop offset='1' stop-color='#bd93ff' stop-opacity='.08'/></linearGradient>
              <filter id='wing-halo' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='3'/></filter>
              <path id='wing-left' d='M31 32C24 12 8 11 12 26c2 7 9 12 18 9-13 0-16 10-11 15 4 4 10-1 12-13'/>
              <path id='wing-right' d='M33 32c7-20 23-21 19-6-2 7-9 12-18 9 13 0 16 10 11 15-4 4-10-1-12-13'/>
            </defs>
            <g class='orbit-rings' stroke='#bba2ed'>
              <ellipse cx='300' cy='277' rx='249' ry='97' transform='rotate(-27 300 277)' opacity='.17'/>
              <ellipse cx='300' cy='277' rx='221' ry='158' transform='rotate(-27 300 277)' opacity='.09'/>
              <ellipse cx='300' cy='277' rx='265' ry='221' transform='rotate(-27 300 277)' opacity='.055'/>
              <path d='M74 386C109 415 239 391 364 327S567 200 532 169' stroke='url(#orbit-light)' stroke-width='1.5'/>
            </g>
            <g class='orbit-travelers' transform='rotate(-27 300 277)' stroke='#d9c5ff' stroke-linecap='round'>
              <ellipse class='orbit-comet orbit-comet-near' cx='300' cy='277' rx='249' ry='97' pathLength='100' stroke-dasharray='.2 99.8' stroke-width='4'/>
              <ellipse class='orbit-trail orbit-trail-near' cx='300' cy='277' rx='249' ry='97' pathLength='100' stroke-dasharray='4 96' stroke-width='1.5'/>
              <ellipse class='orbit-comet orbit-comet-far' cx='300' cy='277' rx='221' ry='158' pathLength='100' stroke-dasharray='.15 99.85' stroke-width='3'/>
            </g>
            <g class='sculpture-body'>
              <g class='butterfly-steering'>
                <g transform='translate(124 84) scale(5.5)'>
                  ${['left', 'right'].map(side => `<g class='butterfly-wing butterfly-wing-${side}'>
                    <use href='#wing-${side}' fill='#a571ff' opacity='.38' filter='url(#wing-halo)'/>
                    <use href='#wing-${side}' transform='translate(0 1.2)' fill='#321751' stroke='#8e62bd' stroke-width='.3'/>
                    <use href='#wing-${side}' fill='url(#wing-metal)' stroke='url(#wing-edge)' stroke-width='.45'/>
                    <path d='${side === 'left' ? 'M28.5 30C24 17 15 15.5 14 19.5' : 'M36 30c4-13 13-14.5 14-10.5'}' stroke='#f2e7ff' stroke-opacity='.6' stroke-width='.35' stroke-linecap='round'/>
                  </g>`).join('')}
                  <path d='M32 24v17' stroke='#e4d4ff' stroke-width='1.2' stroke-linecap='round'/>
                  <path class='butterfly-antennae' d='M32 25c0-4-2-6-3-7m3 7c0-4 2-6 3-7' stroke='#dac4ff' stroke-opacity='.8' stroke-width='.45' stroke-linecap='round'/>
                </g>
              </g>
            </g>
            <g class='flight-sparks' fill='#d9c5ff'><circle cx='74' cy='386' r='3'/><circle cx='532' cy='169' r='3'/><circle cx='178' cy='90' r='2'/><path d='M472 399v12m-6-6h12' stroke='#d9c5ff' stroke-width='1.2'/><path d='M122 171v8m-4-4h8' stroke='#d9c5ff' stroke-opacity='.5'/><circle cx='409' cy='106' r='1.6'/><circle cx='227' cy='438' r='1.8'/></g>
          </svg>
          <span class='orbit-caption' aria-hidden='true'>IDEAS, READY FOR TAKEOFF.</span>
          ${['byesu', 'ireze', 'buds'].map((id, index) => { const p = PROVIDERS.find(provider => provider.id === id); return `<button class='orbit-provider orbit-provider-${index}' data-details='${p.id}' aria-label='Details for ${esc(p.name)}'>${providerMark(p)}<span><strong>${esc(p.name)}</strong><small>${index === 0 ? 'One key. More possibilities.' : 'Find your next connection'}</small></span>${icon('arrow')}</button>`; }).join('')}
        </div>
        <div class='hero-baseline'><span><i></i> INDEPENDENT BY DESIGN. CONNECTED BY IDEAS.</span><button class='browse-providers'>SCROLL TO EXPLORE ${icon('arrow')}</button></div>
        <button class='motion-toggle' aria-label='Pause animations' aria-pressed='false'>${icon('pause')}<span>Pause motion</span></button>
      </section>
      <section class='provider-ribbon' aria-label='Explore featured providers'><span class='ribbon-label'>GOOD COMPANY.<br>GREAT CONNECTIONS.</span><div class='ribbon-providers'>${PROVIDERS.map(p => `<button data-details='${p.id}' aria-label='Details for ${esc(p.name)}'>${providerMark(p)}<span>${esc(p.name)}</span></button>`).join('')}</div></section>
      <div class='directory-layout' id='discover-view'>
        <div class='directory-heading'><div><span class='section-kicker'>01 / THE DIRECTORY</span><h2>Your next <em>great connection.</em></h2><p>A few carefully chosen APIs. A whole world of possibilities.</p></div><span class='directory-total'>${String(PROVIDERS.length).padStart(2, '0')}<small>HANDPICKED PROVIDERS</small></span></div>
        <div class='directory-controls'><div class='search-wrap'>${icon('search')}<input id='provider-search' type='search' placeholder='A provider, a model, a possibility…' aria-label='Search providers or models' autocomplete='off'><kbd aria-hidden='true'>CTRL K</kbd></div><button class='button mobile-filters'>${icon('sliders')} Filters <span class='mobile-filter-count'></span></button></div>
        <aside class='sidebar' aria-label='Provider filters'><div class='filter-heading'><h2>${icon('sliders')} A little more specific?</h2><button class='text-button reset-all'>Reset filters ${icon('close')}</button></div><div class='filter-groups' data-filter-container='desktop'></div></aside>
        <section class='results-section' aria-label='Provider directory'>
          <div class='collections-bar'><div class='tabs' role='tablist' aria-label='Provider collections'>${COLLECTIONS.filter(c => c.id !== 'top' && c.id !== 'disabled').map((c, i) => `<button id='tab-${c.id}' role='tab' aria-selected='${i === 0}' aria-controls='provider-panel' tabindex='${i === 0 ? 0 : -1}' class='tab ${i === 0 ? 'active' : ''}' data-collection='${c.id}'><span>${c.label}</span></button>`).join('')}<span class='tab-underline'></span></div><label class='sort-control'><span>Sort by</span><div class='select-wrap'><select id='sort-select' aria-label='Sort providers'><option value='curated'>Curated</option><option value='newest'>Newest first</option><option value='name'>Name A–Z</option></select>${icon('chevron')}</div></label></div>
          <div class='results-toolbar'><h2 id='results-title'>All providers <span class='result-count'>${PROVIDERS.length}</span></h2><p id='results-caption'>Your next good idea starts here.</p></div>
          <div class='active-filters' aria-label='Active filters'></div>
          <div id='provider-panel' role='tabpanel' aria-labelledby='tab-all' tabindex='0'><div class='provider-grid'></div></div>
        </section>
      </div>
      <section class='build-section' aria-labelledby='build-title'><div class='build-copy'><span class='section-kicker'>02 / FROM KEY TO CREATION</span><h2 id='build-title'>One connection.<br><em>Anything you imagine.</em></h2><p>The hard part should be choosing what to build.</p><a class='button' href='#guides'>Open the field guide ${icon('arrow')}</a></div><div class='build-steps'><article><span>01</span><h3>Find your fit.</h3><p>Explore the providers. Match the models and connection to your idea.</p>${icon('compass')}</article><article><span>02</span><h3>Make it yours.</h3><p>Get your API key and follow the provider’s setup guide.</p>${icon('key')}</article><article><span>03</span><h3>Let it take flight.</h3><p>Make your first request. Then build something only you would make.</p>${icon('bolt')}</article></div></section>
      <section id='guides-view' class='guides-view' hidden aria-labelledby='guide-title'></section>
    </main>
    <footer><div class='footer-top'><a class='footer-brand' href='#discover'>ModelWing<span>↗</span></a><a href='#guides'>Good things start<br>with a connection. ${icon('arrow')}</a></div><div class='footer-bottom'><span>A small directory for big ideas.</span><span>INDEPENDENT. CURATED. READY TO BUILD.</span><span>© ${new Date().getUTCFullYear()} ModelWing API</span></div></footer>
  </div>
  <dialog class='details-dialog' aria-labelledby='modal-title' aria-describedby='modal-description'><div class='modal-content'></div></dialog>
  <dialog class='filter-dialog' aria-labelledby='mobile-filter-title'><div class='mobile-filter-header'><h2 id='mobile-filter-title'>${icon('sliders')} Filters</h2><button class='icon-button close-filters' aria-label='Close filters'>${icon('close')}</button></div><div class='mobile-filter-intro'><span>A few filters. A better fit.</span><button class='text-button reset-all'>Reset</button></div><div class='filter-groups' data-filter-container='mobile'></div><div class='mobile-filter-footer'><button class='button button-primary show-providers'>Show ${PROVIDERS.length} providers ${icon('arrow')}</button></div></dialog>
  <div class='toast' role='status' aria-live='polite'></div><span id='results-announcement' class='sr-only' role='status' aria-live='polite' aria-atomic='true'></span>`;

function filterMarkup(prefix) {
  return FILTER_GROUPS.map(group => `<fieldset class='filter-group'><legend>${group.label}</legend>${group.options.map((option, i) => `<label class='filter-option' for='${prefix}-${group.key}-${i}'><input type='checkbox' id='${prefix}-${group.key}-${i}' data-filter-key='${group.key}' value='${esc(option)}'><span class='check-box'>${icon('check')}</span><span class='filter-label'>${option === 'Live' ? `<span class='tiny-dot green'></span>` : ''}${option}</span><span class='facet-count' data-count-key='${group.key}' data-option='${esc(option)}'>0</span></label>`).join('')}</fieldset>`).join('');
}
document.querySelectorAll('[data-filter-container]').forEach(el => { el.innerHTML = filterMarkup(el.dataset.filterContainer); });

function cardMarkup(p, i) {
  return `<article class='provider-card ${p.badge === 'Featured' ? 'featured-card' : ''}' style='--card-index:${i}' data-provider='${p.id}' aria-labelledby='provider-${p.id}'>
    <div class='card-orbit' aria-hidden='true'><span></span><span></span><span></span></div>
    <div class='card-top'><div class='card-identity'>${providerMark(p)}<div><h3 class='card-title' id='provider-${p.id}'>${esc(p.name)}</h3><span class='card-kind'>${esc(p.type)}</span></div></div><div class='card-stamp'>${statusBadge(p)}${p.badge ? `<span class='special-badge badge-featured'>${icon('star')}${esc(p.badge)}</span>` : ''}</div></div>
    <div class='card-tags'>${p.tags.map((tag, index) => `<span class='${index === 0 ? 'category-tag' : 'descriptive-tag'}'>${esc(tag)}</span>`).join('')}</div>
    <p class='card-description'>${esc(p.description)}</p>
    <div class='card-meta'><span class='card-number' aria-hidden='true'>MW / ${String(PROVIDERS.indexOf(p) + 1).padStart(2, '0')}</span><time class='updated' datetime='${p.updated}' title='Date added to the directory'>Added ${date(p.updated)}</time></div>
    <div class='card-actions'><button class='button details-button' data-details='${p.id}' aria-label='Details for ${esc(p.name)}'>Details ${icon('arrow', 'card-arrow')}</button><a class='button docs-button' href='${esc(p.docs)}' target='_blank' rel='noopener noreferrer' aria-label='Setup guides for ${esc(p.name)} (opens in a new tab)'>Docs ${icon('external')}</a>${apiButton(p)}</div>
  </article>`;
}

function animate(element, frames, options = {}) {
  if (!motion.matches && !motionPaused && element) element.animate(frames, { duration: 230, fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...options });
}

function updateResults() {
  const results = getResults(PROVIDERS, state);
  const grid = document.querySelector('.provider-grid');
  effects.renderGrid(grid, results.length ? results.map(cardMarkup).join('') : `<div class='empty-state'><span class='empty-icon'>${icon('search')}</span><h3>No connections found.</h3><p>Try another provider or model, or clear your filters to find a new starting point.</p><button class='button button-primary reset-all'>Clear search & filters ${icon('arrow')}</button></div>`);
  const collection = COLLECTIONS.find(c => c.id === state.collection);
  document.querySelector('#results-title').innerHTML = `${collection.label === 'All Providers' ? 'All providers' : collection.label} <span class='result-count'>${results.length}</span>`;
  animate(document.querySelector('.result-count'), [{ opacity: .3 }, { opacity: 1 }]);
  document.querySelector('#results-caption').textContent = state.query || Object.values(state.filters).some(v => v.length) ? `${results.length} of ${PROVIDERS.length} providers match your search.` : 'Your next good idea starts here.';
  document.querySelector('#provider-panel').setAttribute('aria-labelledby', `tab-${state.collection}`);
  document.querySelector('#results-announcement').textContent = `${results.length} provider${results.length === 1 ? '' : 's'} found. ${collection.label}. Sorted by ${document.querySelector('#sort-select').selectedOptions[0].textContent}.`;
  document.querySelectorAll('[data-filter-key]').forEach(input => { input.checked = state.filters[input.dataset.filterKey].includes(input.value); });
  document.querySelectorAll('[data-count-key]').forEach(count => {
    const next = facetCount(PROVIDERS, state, count.dataset.countKey, count.dataset.option);
    if (count.textContent !== String(next)) animate(count, [{ opacity: .2 }, { opacity: 1 }]);
    count.textContent = next;
  });
  const chips = Object.entries(state.filters).flatMap(([key, values]) => values.map(value => `<button class='filter-chip' data-remove-key='${key}' data-remove-value='${esc(value)}' aria-label='Remove ${esc(value)} filter'>${esc(value)} ${icon('close')}</button>`));
  if (state.query) chips.unshift(`<button class='filter-chip' data-clear-search aria-label='Clear search'>${icon('search')}${esc(state.query)} ${icon('close')}</button>`);
  const active = document.querySelector('.active-filters');
  active.innerHTML = chips.length ? chips.join('') + `<button class='text-button reset-all'>Clear all</button>` : '';
  active.querySelectorAll('.filter-chip').forEach(chip => animate(chip, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' }]));
  const filterCount = Object.values(state.filters).flat().length;
  document.querySelector('.mobile-filter-count').textContent = filterCount || '';
  document.querySelector('.show-providers').innerHTML = `Show ${results.length} provider${results.length === 1 ? '' : 's'} ${icon('arrow')}`;
}

function moveUnderline(shouldAnimate = true) {
  const tab = document.querySelector('.tab.active');
  const underline = document.querySelector('.tab-underline');
  const left = tab.offsetLeft;
  const width = tab.offsetWidth;
  if (shouldAnimate && !motion.matches && !motionPaused) {
    const oldLeft = parseFloat(underline.style.left) || 0;
    const oldWidth = parseFloat(underline.style.width) || width;
    animate(underline, [
      { left: `${oldLeft}px`, width: `${oldWidth}px` },
      { left: `${left + (left - oldLeft) * .025}px`, width: `${width}px`, offset: .76 },
      { left: `${left}px`, width: `${width}px` },
    ], { duration: 360 });
  }
  underline.style.left = `${left}px`;
  underline.style.width = `${width}px`;
}

function reset() {
  state.query = ''; state.collection = 'all'; state.sort = 'curated';
  FILTER_GROUPS.forEach(g => { state.filters[g.key] = []; });
  document.querySelector('#provider-search').value = '';
  document.querySelector('#sort-select').value = 'curated';
  setCollection('all');
}

function setCollection(id) {
  state.collection = id;
  document.querySelectorAll('[data-collection]').forEach(tab => {
    const active = tab.dataset.collection === id;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  moveUnderline(); updateResults();
}

document.querySelector('#provider-search').addEventListener('input', e => {
  state.query = e.target.value;
  if (location.hash === '#guides') location.hash = '#discover';
  updateResults();
});
document.querySelector('#sort-select').addEventListener('change', e => { state.sort = e.target.value; updateResults(); animate(e.target, [{ opacity: .4 }, { opacity: 1 }]); });

function focusSearch() {
  if (location.hash === '#guides') { pendingDirectorySearch = true; location.hash = '#discover'; return; }
  const input = document.querySelector('#provider-search');
  input.scrollIntoView({ behavior: motion.matches || motionPaused ? 'instant' : 'smooth', block: 'center' });
  input.focus({ preventScroll: true });
}
document.addEventListener('change', e => {
  if (!e.target.matches('[data-filter-key]')) return;
  const { filterKey } = e.target.dataset;
  const value = e.target.value;
  state.filters[filterKey] = e.target.checked ? [...state.filters[filterKey], value] : state.filters[filterKey].filter(v => v !== value);
  updateResults();
});
document.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  if (button.matches('[data-focus-search]')) focusSearch();
  if (button.matches('.browse-providers')) {
    document.querySelector('#discover-view').scrollIntoView({ behavior: motion.matches || motionPaused ? 'instant' : 'smooth', block: 'start' });
    document.querySelector('#provider-panel').focus({ preventScroll: true });
  }
  if (button.matches('.motion-toggle')) {
    motionPaused = !motionPaused;
    document.documentElement.classList.toggle('motion-paused', motionPaused);
    if (motionPaused) effects.settle();
    else effects.refresh();
    if (motionPaused) document.getAnimations().filter(animation => !animation.animationName).forEach(animation => animation.finish());
    button.setAttribute('aria-pressed', String(motionPaused));
    button.setAttribute('aria-label', motionPaused ? 'Resume animations' : 'Pause animations');
    button.querySelector('span').textContent = motionPaused ? 'Resume motion' : 'Pause motion';
    button.querySelector('.icon').outerHTML = icon(motionPaused ? 'play' : 'pause');
  }
  if (button.matches('.reset-all')) { reset(); if (!document.querySelector('.filter-dialog').open) document.querySelector('#provider-search').focus(); }
  if (button.dataset.collection) setCollection(button.dataset.collection);
  if (button.dataset.details) openDetails(button.dataset.details);
  if (button.matches('[data-remove-key]')) { state.filters[button.dataset.removeKey] = state.filters[button.dataset.removeKey].filter(v => v !== button.dataset.removeValue); updateResults(); document.querySelector('#provider-search').focus(); }
  if (button.matches('[data-clear-search]')) { state.query = ''; document.querySelector('#provider-search').value = ''; updateResults(); document.querySelector('#provider-search').focus(); }
  if (button.matches('.mobile-filters')) openDialog(document.querySelector('.filter-dialog'));
  if (button.matches('.close-filters, .show-providers')) closeDialog(document.querySelector('.filter-dialog'));
  if (button.matches('.close-details')) closeDialog(document.querySelector('.details-dialog'));
  if (button.matches('[data-copy]')) copyRoute(button);
});

document.querySelector('.tabs').addEventListener('keydown', e => {
  const tabs = [...document.querySelectorAll('.tab')];
  const index = tabs.indexOf(document.activeElement);
  if (index < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus(); setCollection(tabs[next].dataset.collection); tabs[next].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: motion.matches || motionPaused ? 'instant' : 'smooth' });
});
document.addEventListener('keydown', e => {
  const dialog = document.querySelector('dialog[open]');
  if (e.key === 'Tab' && dialog) {
    const focusable = [...dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(element => element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first && ((!e.shiftKey && document.activeElement === last) || (e.shiftKey && document.activeElement === first) || !dialog.contains(document.activeElement))) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !dialog) { e.preventDefault(); focusSearch(); }
});

function openDialog(dialog) {
  previousFocus = document.activeElement;
  dialog.showModal();
  document.body.classList.add('dialog-open');
  if (dialog.classList.contains('filter-dialog')) animate(dialog, [{ opacity: 0, transform: 'translateX(-35px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 250 });
  else animate(dialog, [{ opacity: 0, transform: 'scale(.96) translateY(8px)' }, { opacity: 1, transform: 'scale(1.005) translateY(0)', offset: .8 }, { opacity: 1, transform: 'scale(1) translateY(0)' }], { duration: 240 });
}
function closeDialog(dialog) { dialog.close(); }
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', e => {
    const rect = dialog.getBoundingClientRect();
    if (e.target === dialog && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) closeDialog(dialog);
  });
  dialog.addEventListener('close', () => { document.body.classList.remove('dialog-open'); if (previousFocus?.isConnected) previousFocus.focus(); });
});

function openDetails(id) {
  const p = PROVIDERS.find(provider => provider.id === id);
  document.querySelector('.modal-content').innerHTML = `
    <div class='modal-banner'><button class='icon-button close-details' aria-label='Close provider details' autofocus>${icon('close')}</button><div class='modal-logo'>${providerMark(p)}</div></div>
    <div class='modal-body'><div class='modal-identity'><h2 id='modal-title'>${esc(p.name)}</h2><div class='modal-meta'>${statusBadge(p)}<span>${esc(p.type)}</span><span>Added ${date(p.updated)}</span></div></div>
    <p class='modal-description' id='modal-description'>${esc(p.description)}</p>
    <p class='provider-offer'>${esc(p.offer)}</p>
    <p class='provider-overview'>${p.models.length ? esc(p.models.slice(0, 3).join(', ')) + (p.models.length > 3 ? ` and ${p.models.length - 3} more` : '') : 'Models not documented'} · ${p.clients.length ? esc(p.clients.join(' + ')) + ' client routes' : 'Client route not documented'}</p>
    <div class='modal-actions'>${apiButton(p)}<a class='button' href='${esc(p.docs)}' target='_blank' rel='noopener noreferrer'>${icon('book')}View Documentation ${icon('external')}</a></div>
    ${p.documentationLinks ? `<nav class='provider-doc-links' aria-label='${esc(p.name)} documentation'>${p.documentationLinks.map(link => `<a href='${esc(link.url)}' target='_blank' rel='noopener noreferrer'>${esc(link.label)} ${icon('external')}</a>`).join('')}</nav>` : ''}
    ${p.hasProviderDocs ? '' : `<p class='field-note'>Provider documentation is not listed. View our client setup guides instead.</p>`}
    ${p.notice ? `<p class='provider-notice'>${icon('info')}${esc(p.notice)} <a href='${esc(p.website)}' target='_blank' rel='noopener noreferrer'>Visit current website ${icon('external')}</a></p>` : ''}
    <details class='modal-technical'><summary>Models, metrics & connection details ${icon('chevron')}</summary>
    <section class='modal-section' aria-labelledby='models-heading'><div class='section-heading'><h3 id='models-heading'>${icon('grid')} Documented models</h3></div>${p.models.length ? `<div class='model-list'>${p.models.map(model => `<span>${icon('code')}${esc(model)}</span>`).join('')}</div>` : `<p class='field-note'>Models unknown — the provider does not publish its model IDs.</p>`}</section>
    <section class='modal-section' aria-labelledby='metrics-heading'><div class='section-heading'><h3 id='metrics-heading'>${icon('bolt')} Published API metrics</h3></div><div class='metrics-grid'><div><span>Req/Min</span><strong class='text-metric'>Not listed</strong></div><div><span>Latency</span><strong class='text-metric'>Not listed</strong></div><div><span>Uptime %</span><strong class='text-metric'>Not listed</strong></div></div></section>
    <section class='modal-section' aria-labelledby='connection-heading'><div class='section-heading'><h3 id='connection-heading'>${icon('sliders')} Connection details</h3></div><dl class='modal-connections'><div><dt>Client route</dt><dd>${esc(p.clients.join(' + ') || 'Not documented')}</dd></div>${p.clientEndpoints ? Object.entries(p.clientEndpoints).map(([client, endpoint]) => `<div><dt>${esc(client)} base URL</dt><dd>${esc(endpoint)}</dd></div>`).join('') : ''}<div><dt>API Category</dt><dd>${esc(p.categories.join(', '))}</dd></div><div><dt>Authentication</dt><dd>${esc(p.auth)}</dd></div><div><dt>Card required</dt><dd>${esc(p.cardRequired)}</dd></div><div><dt>Added</dt><dd>${p.updated}</dd></div><div><dt>Data format</dt><dd>${esc(p.dataFormat)}</dd></div><div><dt>Rate limit</dt><dd>${esc(p.rateLimit)}</dd></div></dl></section>
    <section class='modal-section' aria-labelledby='route-heading'><div class='section-heading'><h3 id='route-heading'>${icon('terminal')} API route</h3></div>${p.route ? `<div class='route-box'><code>${esc(p.route)}</code><button class='icon-button' data-copy='${p.id}' aria-label='Copy API route'>${icon('copy')}</button></div><p class='field-note'><span class='copy-feedback' role='status' aria-live='polite'></span>Confirm the endpoint in your provider dashboard.</p>` : `<p class='field-note'>Not documented. Copy the current base URL from the provider’s dashboard.</p>`}</section>
    </details><div class='modal-disclaimer'>${icon('info')}<p>Reviewed from <a href='${esc(p.source)}' target='_blank' rel='noopener noreferrer'>${esc(p.sourceLabel || 'API Hub')}</a> on ${date(p.imported)}. Pricing, offers, status and models reflect that source. Check the provider’s dashboard for current terms.</p></div></div>`;
  openDialog(document.querySelector('.details-dialog'));
}

async function copyRoute(button) {
  const route = PROVIDERS.find(p => p.id === button.dataset.copy).route;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(route);
    else {
      const textarea = document.createElement('textarea'); textarea.value = route; textarea.style.cssText = 'position:fixed;opacity:0'; button.closest('dialog').append(textarea); textarea.select();
      const success = document.execCommand('copy'); textarea.remove(); if (!success) throw new Error('Copy unavailable');
    }
    button.innerHTML = icon('check'); button.setAttribute('aria-label', 'Copied API route');
    const feedback = button.closest('.modal-section').querySelector('.copy-feedback');
    feedback.textContent = 'Copied to clipboard. ';
    showToast(`${icon('checkCircle')} Copied API route`);
    setTimeout(() => { if (button.isConnected) { button.innerHTML = icon('copy'); button.setAttribute('aria-label', 'Copy API route'); feedback.textContent = ''; } }, 2000);
  } catch { button.closest('.modal-section').querySelector('.copy-feedback').textContent = 'Select and copy the route manually. '; showToast('Copy unavailable. Select and copy the route above.'); }
}
function showToast(content) {
  const toast = document.querySelector('.toast'); toast.innerHTML = content; toast.classList.add('visible');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2600);
}

document.querySelector('#guides-view').innerHTML = `
  <div class='guide-heading'><div class='section-kicker'>THE MODELWING FIELD GUIDE</div><h2 id='guide-title'>From a good idea<br>to <em>your first request.</em></h2><p>Four small steps. Then the possibilities are yours.</p><a class='text-link' href='#discover'>${icon('arrow')} Back to the directory</a></div>
  <div class='guide-steps'><article><span class='step-number'>01</span><h3>Find your fit</h3><p>Compare model needs, authentication, and SDK support. Use the provider documentation and dashboard to confirm the details listed in this directory.</p></article><article><span class='step-number'>02</span><h3>Check the dashboard</h3><p>Confirm pricing, free-credit eligibility, rate limits, and model availability. Create your account directly with the provider and generate your own API key.</p></article><article><span class='step-number'>03</span><h3>Keep your key private</h3><p>Store your key in a server-side environment variable. Make API calls from your backend. Never embed a private API key in browser code or commit it to a repository.</p></article><article><span class='step-number'>04</span><h3>Make a small request</h3><p>Start with the provider’s documented example, confirmed endpoint, and model identifier. Set a timeout, handle errors, and check usage in the dashboard.</p></article></div>
  <div class='guide-code'><div>${icon('terminal')} A server-side starting point <span class='technical-label'>ILLUSTRATIVE ONLY</span></div><pre><code># Replace each placeholder using the provider's official docs.
# Run from your backend or local terminal, never the browser.
curl https://api.example.com/provider/v1/chat/completions \\
  -H 'Authorization: Bearer YOUR_PRIVATE_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{"model":"PROVIDER_MODEL_ID","messages":[{"role":"user","content":"Hello!"}]}'</code></pre><p>${icon('info')} This endpoint is a placeholder. Authentication and request formats vary by provider.</p></div>`;

function renderRoute() {
  const guides = location.hash === '#guides';
  document.querySelector('#discover-view').hidden = guides;
  document.querySelector('#guides-view').hidden = !guides;
  document.querySelector('.hero').hidden = guides;
  document.querySelector('.provider-ribbon').hidden = guides;
  document.querySelector('.build-section').hidden = guides;
  document.querySelectorAll('.nav-link').forEach(link => { const active = link.hash === (guides ? '#guides' : '#discover'); link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  document.title = guides ? 'Setup Guides — ModelWing API' : 'ModelWing API — Find your next API';
  if (!guides) requestAnimationFrame(() => moveUnderline(false));
}
window.addEventListener('hashchange', () => {
  renderRoute();
  effects.reveal(document.querySelectorAll(location.hash === '#guides' ? '.guide-heading, .guide-steps article, .guide-code' : '.hero-eyebrow, .hero-line, .hero-copy > p, .hero-actions, .hero-footnote, .flight-deck'), { replay: true });
  if (pendingDirectorySearch) { pendingDirectorySearch = false; focusSearch(); }
  else window.scrollTo({ top: 0, behavior: 'instant' });
});
new ResizeObserver(() => moveUnderline(false)).observe(document.querySelector('.tabs'));
updateResults(); renderRoute(); requestAnimationFrame(() => moveUnderline(false));
effects.reveal(document.querySelectorAll('.brand, .header nav, .header-actions, .hero-eyebrow, .hero-line, .hero-copy > p, .hero-actions, .hero-footnote, .flight-deck, .hero-baseline, .ribbon-label, .ribbon-providers button, .directory-heading, .directory-controls, .sidebar, .collections-bar, .results-toolbar, .build-copy, .build-steps article, .guide-heading, .guide-steps article, .guide-code, .footer-top, .footer-bottom'));
