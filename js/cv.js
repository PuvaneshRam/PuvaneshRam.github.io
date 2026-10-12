(function () {
  const p = PROFILE;
  const sheet = document.getElementById('cv-sheet');
  // content comes from editable data files, so it is escaped before it reaches HTML
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (url) => {
    const u = String(url ?? '').trim();
    return /^(https?:|mailto:|tel:)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u) ? esc(u) : '#';
  };
  const initials = p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const ICONS = {
    phone: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12"/><path fill="var(--accent)" d="M9.2 6.5 7.7 7c-.9.4-1.2 1.3-.9 2.2.9 3.5 3.5 6.3 7 7.4.9.3 1.8 0 2.2-.8l.6-1.4-2.4-1.6-1.3 1c-1.6-.8-2.8-2.1-3.5-3.6l1-1.3z"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12"/><path fill="none" stroke="var(--accent)" stroke-width="1.6" d="M6.5 8.5h11v7.5h-11zM6.5 8.5l5.5 4.2 5.5-4.2"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 1.5a8 8 0 0 0-8 8c0 6 8 13 8 13s8-7 8-13a8 8 0 0 0-8-8z"/><circle cx="12" cy="9.5" r="3" fill="var(--accent)"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="3"/><path fill="#fff" d="M5.5 9.5h3V19h-3zM7 4.8a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zM10.5 9.5h2.9v1.3c.4-.8 1.4-1.6 2.9-1.6 3 0 3.6 2 3.6 4.6V19h-3v-4.6c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4V19h-3.1z"/></svg>',
    artstation: '<svg viewBox="0 0 24 24"><path d="M1 17.5 3.3 21.3c.4.7 1.1 1.2 2 1.2h14.4l-3-5z"/><path d="M23 17.6c0-.5-.1-.9-.4-1.3L14.4 2.6c-.4-.7-1.1-1.1-2-1.1H8.1l12.6 21.8 1.9-3.4c.4-.6.4-.9.4-2.3z"/><path d="M12.6 14.6 8 6.6l-4.6 8z"/></svg>',
    web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12"/><g fill="none" stroke="#fff" stroke-width="1.3"><circle cx="12" cy="12" r="7.5"/><ellipse cx="12" cy="12" rx="3.3" ry="7.5"/><path d="M4.5 12h15M5.5 8.2h13M5.5 15.8h13"/></g></svg>'
  };

  const section = (title, body) => `
    <section class="cv-section">
      <h2 class="cv-h"><span>${title}</span></h2>
      ${body}
    </section>`;

  const phone = p.cvOnly.phone;

  sheet.innerHTML = `
    <header class="cv-head">
      <div class="cv-photo">
        <span>${esc(initials)}</span>
        <img src="${safeUrl(p.photo)}" alt="${esc(p.name)}">
      </div>
      <div class="cv-id">
        <h1 class="cv-name">${esc(p.name)}</h1>
        <p class="cv-role">${esc(p.role)}</p>
        <ul class="cv-contact">
          <li>${ICONS.phone}<a href="${safeUrl(`tel:${phone.replace(/[^\d+]/g, '')}`)}">${esc(phone)}</a></li>
          <li>${ICONS.mail}<a href="${safeUrl(`mailto:${p.email}`)}">${esc(p.email)}</a></li>
          <li>${ICONS.pin}<span>${esc(p.location)} | ${esc(p.cvOnly.postalCode)}</span></li>
        </ul>
      </div>
      <span class="cv-star" aria-hidden="true"></span>
    </header>

    <div class="cv-body">
      ${section('Websites and Social Links', `<ul class="cv-links">${p.links.map((l) => `
        <li>${ICONS[l.icon] || ICONS.web}<a href="${safeUrl(l.url)}">${esc(l.url)}</a></li>`).join('')}</ul>`)}

      ${section('Summary', `<p class="cv-p">${esc(p.summary.join(' '))}</p>`)}

      ${section('Core Competencies', `<p class="cv-list">${p.competencies.map(esc).join('&nbsp;| ')}</p>`)}

      ${section('Software Skills', `<p class="cv-list">${p.software.map(esc).join('&nbsp;| ')}</p>`)}

      ${section('Education', p.education.map((e) => `
        <div class="cv-entry">
          <p class="cv-entry-title">${esc(e.degree)}, ${esc(e.school)}</p>
          <p class="cv-entry-date">${esc(e.start)} - ${esc(e.end)}</p>
        </div>`).join(''))}

      ${section('Experience', p.experience.map((e) => `
        <div class="cv-entry">
          <p class="cv-entry-title">${esc(e.role)}, ${esc(e.company)}</p>
          <p class="cv-entry-date">${esc(e.start.toUpperCase())} - ${esc(e.end.toUpperCase())}</p>
        </div>`).join(''))}

      ${section('Projects', p.cvOnly.projects.map((pr) => `
        <div class="cv-entry">
          <p class="cv-entry-title">${esc(pr.client)} – ${esc(pr.title)} | ${esc(pr.role)}</p>
          <p class="cv-p">${esc(pr.description)}</p>
        </div>`).join(''))}
    </div>

    <footer class="cv-foot">
      <span>${esc(p.name.toUpperCase())} <i>✦</i> ${esc(p.role.toUpperCase())}</span>
      <span>PORTFOLIO <i>✦</i> ${new Date().getFullYear()}</span>
    </footer>`;

  const photo = sheet.querySelector('.cv-photo img');
  photo.addEventListener('error', () => photo.classList.add('img-missing'));

  document.getElementById('cv-download').href = /^[a-z][a-z0-9+.-]*:/i.test(p.cvPdf) && !/^https?:/i.test(p.cvPdf) ? '#' : p.cvPdf;
  document.getElementById('cv-print').addEventListener('click', () => window.print());
})();
