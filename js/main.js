// every piece of content comes from editable data files, so it is escaped before it reaches HTML
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// web, mail and site-relative links only, so a javascript: (or similar) URL can never run
function safeUrl(url) {
  const u = String(url ?? '').trim();
  return /^(https?:|mailto:)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u) ? esc(u) : '#';
}

// video-site links stored in a post's media list; src is the provider's video ID
const VIDEO_EMBEDS = {
  youtube: { label: 'YOUTUBE', url: (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0` },
  vimeo: { label: 'VIMEO', url: (id) => `https://player.vimeo.com/video/${id}` },
  gdrive: { label: 'DRIVE', url: (id) => `https://drive.google.com/file/d/${id}/preview` }
};

function allCards() {
  return [...PERSONAL_WORK, ...PROJECT_ITEMS];
}

function coverOf(p) {
  return p.cover || (p.media.find((m) => m.type === 'image') || {}).src || '';
}

function renderGrid(gridId, items) {
  const grid = document.getElementById(gridId);
  if (!grid || !items) return;

  grid.innerHTML = items.map((p, i) => {
    const artClass = `art-${(i % 3) + 1}`;
    const video = p.media.find((m) => m.type === 'video');
    const hasVideo = p.media.some((m) => m.type === 'video' || m.type in VIDEO_EMBEDS);
    const has3d = p.media.some((m) => m.type === '3d');
    return `
      <article class="card" tabindex="0" data-slug="${esc(p.slug)}">
        <div class="card-inner">
          <div class="card-media ${artClass}">
            <span class="placeholder-label">DROP RENDER<br>HERE</span>
            <img class="card-cover" src="${safeUrl(coverOf(p))}" alt="${esc(p.title)}">
            ${video ? `<video class="card-video" src="${safeUrl(video.src)}" muted loop playsinline></video>` : ''}
          </div>
          <div class="holo-sheen"></div>
          <div class="card-badges">
            ${hasVideo ? '<span class="badge badge-video">VIDEO</span>' : ''}
            ${has3d ? '<span class="badge badge-3d">3D</span>' : ''}
          </div>
          <div class="card-info">
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.category)}</p>
          </div>
        </div>
      </article>`;
  }).join('');

  grid.querySelectorAll('.card-cover').forEach((img) => {
    img.addEventListener('error', () => img.classList.add('img-missing'));
  });

  grid.querySelectorAll('.card-video').forEach((video) => {
    const card = video.closest('.card');
    card.addEventListener('mouseenter', () => video.play().catch(() => {}));
    card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
  });
}

function initCardTilt() {
  // touch taps emit fake mouse events; on phones the tilt sensor drives cards instead (effects.js)
  const canHover = matchMedia('(hover: hover)').matches;

  document.querySelectorAll('.card').forEach((card) => {
    const inner = card.querySelector('.card-inner');

    if (canHover) {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        inner.style.setProperty('--mx', `${x}%`);
        inner.style.setProperty('--my', `${y}%`);
        inner.style.setProperty('--rx', `${(x - 50) / 6}deg`);
        inner.style.setProperty('--ry', `${(50 - y) / 6}deg`);
      });

      card.addEventListener('mouseleave', () => {
        inner.style.setProperty('--rx', '0deg');
        inner.style.setProperty('--ry', '0deg');
      });
    }

    card.addEventListener('click', () => openProjectDetail(card.dataset.slug));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') openProjectDetail(card.dataset.slug);
    });
  });
}

// where "‹ BACK" on the detail screen returns to — the gallery the card was clicked from
let detailReturnScreen = 'menu';


// the grid tile preview — a cheap, non-interactive stand-in for each media type,
// clicking it opens the real thing (full video, full 3D embed, full-size image) in the lightbox
function tileHTML(item, alt) {
  const id = esc(encodeURIComponent(item.src));
  if (item.type === 'video') return `<video src="${safeUrl(item.src)}" muted preload="metadata" playsinline></video><span class="tile-badge">▶ VIDEO</span>`;
  if (item.type === 'youtube') return `<img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt="${esc(alt)}" loading="lazy"><span class="tile-badge">▶ YOUTUBE</span>`;
  if (item.type in VIDEO_EMBEDS) return `<div class="tile-3d"><span class="placeholder-label">VIDEO<br>CLICK TO PLAY</span></div><span class="tile-badge">▶ ${VIDEO_EMBEDS[item.type].label}</span>`;
  if (item.type === '3d') return `<div class="tile-3d"><span class="placeholder-label">3D MODEL<br>CLICK TO VIEW</span></div>`;
  return `<span class="placeholder-label">DROP RENDER<br>HERE</span><img src="${safeUrl(item.src)}" alt="${esc(alt)}" loading="lazy">`;
}

function lightboxItemHTML(item, alt) {
  const id = esc(encodeURIComponent(item.src));
  if (item.type === 'video') return `<video src="${safeUrl(item.src)}" controls autoplay playsinline></video>`;
  if (item.type in VIDEO_EMBEDS) return `<iframe src="${VIDEO_EMBEDS[item.type].url(id)}" allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  if (item.type === '3d') return `<iframe src="https://sketchfab.com/models/${id}/embed" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen></iframe>`;
  return `<img src="${safeUrl(item.src)}" alt="${esc(alt)}" loading="lazy">`;
}

// Pinterest/Dribbble-style masonry grid: every image, video or 3D embed keeps its own
// natural aspect ratio (nothing cropped) — click a tile to open the full-size lightbox.
function renderGalleryGrid(gridEl, media, alt, onOpen) {
  gridEl.innerHTML = media.map((item, i) => `<button type="button" class="detail-tile" data-index="${i}">${tileHTML(item, alt)}</button>`).join('');
  gridEl.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.classList.add('img-missing')));
  gridEl.querySelectorAll('.detail-tile').forEach((tile) => {
    tile.addEventListener('click', () => onOpen(Number(tile.dataset.index)));
  });
}

let lightboxMedia = [];
let lightboxIndex = 0;
let lightboxAlt = '';

function showLightboxItem() {
  const item = lightboxMedia[lightboxIndex];
  const stage = document.getElementById('lightbox-stage');
  stage.innerHTML = lightboxItemHTML(item, lightboxAlt);
  stage.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.classList.add('img-missing')));
  document.getElementById('lightbox-counter').textContent = `${lightboxIndex + 1} / ${lightboxMedia.length}`;
}

function openLightbox(media, index, alt) {
  lightboxMedia = media;
  lightboxIndex = index;
  lightboxAlt = alt;
  document.getElementById('detail-lightbox').hidden = false;
  showLightboxItem();
}

function stepLightbox(dir) {
  lightboxIndex = (lightboxIndex + dir + lightboxMedia.length) % lightboxMedia.length;
  showLightboxItem();
}

function closeLightbox() {
  document.getElementById('detail-lightbox').hidden = true;
  document.getElementById('lightbox-stage').innerHTML = '';
}

function initLightbox() {
  document.querySelectorAll('[data-lightbox-close]').forEach((el) => el.addEventListener('click', closeLightbox));
  document.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => stepLightbox(-1));
  document.querySelector('[data-lightbox-next]')?.addEventListener('click', () => stepLightbox(1));
}

function openProjectDetail(slug) {
  const project = allCards().find((p) => p.slug === slug);
  if (!project) return;

  detailReturnScreen = currentScreen();

  const headerEl = document.getElementById('detail-header');
  const gridEl = document.getElementById('detail-grid');
  const media = project.media;

  headerEl.innerHTML = `
    <div class="detail-header-main">
      <h2 class="detail-title">${esc(project.title)}</h2>
      <p class="detail-category">${esc(project.category)}</p>
      ${project.description ? `<p class="detail-description">${esc(project.description)}</p>` : ''}
    </div>
    <div class="detail-header-meta">
      ${project.stats ? `
        <div class="detail-stats">
          <div><b>${esc(project.stats.reactions)}</b><span>Reactions</span></div>
          <div><b>${esc(project.stats.views)}</b><span>Views</span></div>
          <div><b>${esc(project.stats.comments)}</b><span>Comments</span></div>
        </div>` : ''}
      ${project.postedDate ? `<p class="detail-posted">${esc(project.postedDate)}</p>` : ''}
      ${project.software ? `
        <div class="detail-block">
          <p class="detail-block-label">Software Used</p>
          <div class="tag-row">${project.software.map((s) => `<span class="tag-chip">${esc(s)}</span>`).join('')}</div>
        </div>` : ''}
      ${project.artstationUrl || profileLink('artstation') ? `<a class="btn btn-outline detail-link" href="${safeUrl(project.artstationUrl || profileLink('artstation'))}" target="_blank" rel="noopener noreferrer">VIEW ON ARTSTATION ↗</a>` : ''}
    </div>`;

  renderGalleryGrid(gridEl, media, project.title, (index) => openLightbox(media, index, project.title));
  document.querySelector('.screen-detail').scrollTop = 0;

  goToScreen('detail');
}

function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function timelineHTML(entries) {
  return `<ol class="timeline">${entries.map((e) => `
    <li>
      <span class="tl-date">${esc(e.start)} — ${esc(e.end)}</span>
      <b class="tl-title">${esc(e.title)}</b>
      <span class="tl-org">${esc(e.org)}</span>
    </li>`).join('')}</ol>`;
}

// phone, postal code and client projects (PROFILE.cvOnly) are deliberately never rendered here
function renderAbout() {
  const el = document.getElementById('about-content');
  if (!el) return;
  const p = PROFILE;

  el.innerHTML = `
    <aside class="about-profile">
      <div class="about-photo">
        <span class="about-initials">${esc(initials(p.name))}</span>
        <img src="${safeUrl(p.photo)}" alt="${esc(p.name)}">
      </div>
      <h3 class="about-name">${esc(p.name)}</h3>
      <p class="about-role">${esc(p.role)}</p>
      <p class="about-location">${esc(p.location)}</p>
      <a class="btn btn-solid about-cv" href="${safeUrl(p.cvPdf)}" download>DOWNLOAD CV ↓</a>
      <a class="about-cv-view" href="cv.html" target="_blank" rel="noopener">View CV online ↗</a>
      <ul class="about-links">
        ${p.links.map((l) => `<li><a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} <span>↗</span></a></li>`).join('')}
      </ul>
    </aside>

    <div class="about-body">
      <section class="about-block">
        <p class="about-label">Summary</p>
        ${p.summary.map((t) => `<p class="about-text">${esc(t)}</p>`).join('')}
      </section>
      <section class="about-block">
        <p class="about-label">Experience</p>
        ${timelineHTML(p.experience.map((e) => ({ title: e.role, org: e.company, start: e.start, end: e.end })))}
      </section>
      <section class="about-block">
        <p class="about-label">Core Competencies</p>
        <div class="chip-list">${p.competencies.map((c) => `<span class="tag-chip">${esc(c)}</span>`).join('')}</div>
      </section>
      <section class="about-block">
        <p class="about-label">Software</p>
        <div class="chip-list">${p.software.map((s) => `<span class="tag-chip">${esc(s)}</span>`).join('')}</div>
      </section>
      <section class="about-block">
        <p class="about-label">Education</p>
        ${timelineHTML(p.education.map((e) => ({ title: e.degree, org: e.school, start: e.start, end: e.end })))}
      </section>
    </div>`;

  const photo = el.querySelector('.about-photo img');
  photo.addEventListener('error', () => photo.classList.add('img-missing'));
}

// links from the Profile (edited in the admin), so every link on the site follows one source
function profileLink(icon) {
  return (PROFILE.links.find((l) => l.icon === icon) || {}).url || '';
}

// links ticked "Show on Contact page & main menu" in the admin (all others stay on the CV only)
const siteLinks = () => PROFILE.links.filter((l) => !l.hideOnSite);

function renderProfileLinks() {
  const menu = document.getElementById('menu-links');
  if (menu) {
    menu.innerHTML = siteLinks()
      .map((l) => `<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`)
      .join('');
  }
  const cta = document.getElementById('work-artstation-cta');
  const artstation = profileLink('artstation');
  if (cta && /^https?:\/\//i.test(artstation)) {
    cta.href = artstation;
    cta.hidden = false;
  }
}

function renderContact() {
  const el = document.getElementById('contact-content');
  if (!el) return;
  const p = PROFILE;

  el.innerHTML = `
    <p class="section-kicker">GET IN TOUCH</p>
    <h2 class="footer-title contact-title">LET'S WORK TOGETHER</h2>
    <a class="contact-email" href="${safeUrl(`mailto:${p.email}`)}">${esc(p.email)}</a>
    <p class="contact-location">Based in ${esc(p.location)}</p>
    <div class="footer-links">
      <a href="${safeUrl(`mailto:${p.email}`)}">Email</a>
      ${siteLinks().map((l) => `<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}
    </div>

    <div class="recruiter-card">
      <p class="section-kicker">FOR RECRUITERS</p>
      <h3 class="recruiter-title">HIRING A ${esc(p.role.toUpperCase())}?</h3>
      <p class="recruiter-text">Experience, client projects, software and education — all on one page.</p>
      <div class="recruiter-actions">
        <a class="btn btn-solid" href="${safeUrl(p.cvPdf)}" download>DOWNLOAD CV (PDF) ↓</a>
        <a class="btn btn-outline" href="cv.html" target="_blank" rel="noopener">VIEW ONLINE ↗</a>
      </div>
    </div>`;
}

function spawnParticles() {
  const container = document.getElementById('fx-particles');
  if (!container) return;

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const count = 30;
  const colors = ['var(--accent-2)', 'var(--ink)', 'var(--lavender)'];

  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.className = 'spark';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const dist = 160 + Math.random() * 240;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    spark.style.left = `${centerX}px`;
    spark.style.top = `${centerY}px`;
    spark.style.setProperty('--dx', `${dx}px`);
    spark.style.setProperty('--dy', `${dy}px`);
    spark.style.background = colors[i % colors.length];

    container.appendChild(spark);
    spark.addEventListener('animationend', () => spark.remove());
  }
}

function triggerBootTransition() {
  const bootTitle = document.getElementById('boot-title');
  const flash = document.getElementById('fx-flash');
  const star = document.getElementById('fx-star');

  bootTitle.classList.add('title-pulse');
  flash.classList.add('flash-pulse');
  star.classList.add('star-burst');
  spawnParticles();

  // swap screens while the star burst covers the viewport, so it reads as a wipe
  setTimeout(() => goToScreen('menu'), 380);
  setTimeout(() => {
    bootTitle.classList.remove('title-pulse');
    flash.classList.remove('flash-pulse');
    star.classList.remove('star-burst');
  }, 750);
}

function initTickers() {
  document.querySelectorAll('.ticker-track').forEach((track) => {
    const group = track.querySelector('.ticker-group');
    const groupWidth = group.getBoundingClientRect().width;
    if (!groupWidth) return;

    // enough copies to cover the widest the window can get, plus one to scroll into
    const copies = Math.ceil(Math.max(window.screen.width, window.innerWidth) / groupWidth) + 1;
    for (let i = 0; i < copies; i++) track.appendChild(group.cloneNode(true));

    track.style.setProperty('--shift', `-${groupWidth}px`);
    track.style.animationDuration = `${groupWidth / 60}s`;
  });
}

function initBoot() {
  const boot = document.getElementById('boot-screen');
  if (!boot) return;
  let triggered = false;

  function trigger() {
    if (triggered) return;
    triggered = true;
    triggerBootTransition();
  }

  boot.addEventListener('click', trigger);
  document.addEventListener('keydown', (e) => {
    if (currentScreen() === 'boot') trigger();
  });
}

function currentScreen() {
  return document.querySelector('.screen.active')?.dataset.screen || 'menu';
}

function goToScreen(name) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.screen === name);
  });

  const target = document.querySelector(`.screen[data-screen="${name}"]`);
  const focusTarget = name === 'menu'
    ? target.querySelector('.menu-item')
    : target.querySelector('.back-btn');
  focusTarget?.focus();
}

function initMenuNav() {
  document.querySelectorAll('.menu-item').forEach((item) => {
    item.addEventListener('click', () => goToScreen(item.dataset.target));
  });

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => goToScreen('menu'));
  });

  document.getElementById('detail-back')?.addEventListener('click', () => goToScreen(detailReturnScreen));

  document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('detail-lightbox');
    if (lightbox && !lightbox.hidden) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') stepLightbox(1);
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      return;
    }

    if (e.key === 'Escape' && currentScreen() === 'detail') {
      goToScreen(detailReturnScreen);
      return;
    }
    if (e.key === 'Escape' && currentScreen() !== 'menu') {
      goToScreen('menu');
      return;
    }

    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const backward = e.key === 'ArrowUp' || e.key === 'ArrowLeft';

    if (currentScreen() === 'menu' && (forward || backward)) {
      const items = Array.from(document.querySelectorAll('.menu-item'));
      const idx = items.indexOf(document.activeElement);
      const next = forward
        ? items[(idx + 1 + items.length) % items.length]
        : items[(idx - 1 + items.length) % items.length];
      (next || items[0]).focus();
      e.preventDefault();
    }
  });
}

renderGrid('work-grid', PERSONAL_WORK);
renderGrid('projects-grid', PROJECT_ITEMS);
renderAbout();
renderContact();
renderProfileLinks();
initCardTilt();
initMenuNav();
initLightbox();
initBoot();
document.fonts.ready.then(initTickers);
