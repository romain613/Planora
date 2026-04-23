// ─── Server-side Landing Page HTML Template ───
// Generates a complete, professional HTML page with Tailwind CSS
// Inspired by high-converting landing pages (monbilandecompetences.com style)
// No React needed — pure HTML served directly by Express

export function renderLandingPage({ id, name, sections, settings, seo, color, calendarSlug, companyName, companySlug }) {
  const pc = color || settings?.colorPrimary || '#2563EB';
  const bg = settings?.colorBg || '#FFFFFF';
  const tx = settings?.colorText || '#111827';
  const bookingUrl = calendarSlug ? `/book/${companySlug}/${calendarSlug}` : null;
  const cName = companyName || name || 'Mon entreprise';
  const mainCta = bookingUrl || '#contact';
  const mainCtaText = bookingUrl ? 'Prendre rendez-vous' : 'Nous contacter';
  const ctaIsExternal = !!bookingUrl;

  // Sort & filter visible sections
  const vis = (sections || [])
    .filter(s => s.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const hasSection = (type) => vis.some(s => s.type === type);

  // Resolve CTA link
  const resolveCta = (link) => {
    if (link === 'calendar' && bookingUrl) return bookingUrl;
    if (link === 'form') return '#contact';
    if (link && link.startsWith('http')) return link;
    return mainCta;
  };

  const ctaTarget = (link) => (link === 'calendar' && bookingUrl) ? ' target="_blank" rel="noreferrer"' : '';

  // Escape HTML
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Get testimonial stats
  const testiSection = vis.find(s => s.type === 'testimonials');
  const testiItems = testiSection?.content?.items || [];
  const testiCount = testiItems.length;
  const avgRating = testiCount ? (testiItems.reduce((a, t) => a + (t.rating || 5), 0) / testiCount).toFixed(1) : null;

  // Get contact info for footer
  const contactSection = vis.find(s => s.type === 'contact');
  const contactContent = contactSection?.content || {};

  // Lighter shade util
  const pcLight = pc + '12';
  const pcMedium = pc + '20';

  // ─── Mini-CTA Banner (injected between sections) ───
  const miniCtaBanner = (text, subtext, idx) => `
    <section class="scroll-reveal py-10 md:py-14 px-6 relative overflow-hidden" style="background: ${idx % 2 === 0 ? `linear-gradient(135deg, ${pc}08 0%, ${pc}15 100%)` : `${bg}`}">
      <div class="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div>
          <h3 class="text-xl md:text-2xl font-extrabold mb-1" style="color: ${tx}">${text}</h3>
          ${subtext ? `<p class="text-sm opacity-60" style="color: ${tx}">${subtext}</p>` : ''}
        </div>
        <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-2 px-7 py-3.5 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap flex-shrink-0" style="background: ${pc}">
          ${mainCtaText}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </a>
      </div>
    </section>`;

  // Counter for mini CTA banners
  let miniCtaIdx = 0;
  const miniCtaTexts = [
    { t: "Vous avez un projet ? Parlons-en !", s: "Gratuit et sans engagement" },
    { t: "Ne perdez plus de temps, agissez maintenant", s: "Prenez rendez-vous en quelques clics" },
    { t: "Des questions ? On vous rappelle gratuitement", s: "Réponse sous 24h garantie" },
  ];

  // ─── Build sections HTML ───
  const builtSections = [];
  vis.forEach((section, sectionIndex) => {
    const c = section.content || {};
    let html = '';

    switch (section.type) {

      case 'hero': {
        const hasMedia = c.videoUrl || c.imageUrl;
        const ytMatch = (c.videoUrl || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);

        let mediaHtml = '';
        if (c.videoUrl && ytMatch) {
          mediaHtml = `<div class="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1" class="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope" allowfullscreen></iframe></div>`;
        } else if (c.videoUrl) {
          mediaHtml = `<div class="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl"><video src="${esc(c.videoUrl)}" autoplay muted loop playsinline class="w-full h-full object-cover"></video></div>`;
        } else if (c.imageUrl) {
          mediaHtml = `<div class="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"><img src="${esc(c.imageUrl)}" alt="${esc(c.title)}" loading="eager" class="w-full h-full object-cover"/></div>`;
        }

        const trustHtml = avgRating ? `
          <div class="flex items-center gap-4 mt-8 flex-wrap ${hasMedia ? '' : 'justify-center'}">
            <div class="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full">
              <span class="text-yellow-300 text-sm">${'★'.repeat(Math.round(avgRating))}</span>
              <span class="text-sm text-white/80 font-semibold">${avgRating}/5</span>
            </div>
            <span class="text-sm text-white/60">${testiCount} avis client${testiCount > 1 ? 's' : ''}</span>
          </div>` : '';

        html = `
        <section id="hero" class="relative overflow-hidden" style="background: linear-gradient(160deg, ${pc} 0%, ${pc}D0 40%, ${pc}AA 100%)">
          <div class="absolute inset-0 pointer-events-none" style="background: radial-gradient(ellipse at 70% 20%, rgba(255,255,255,0.08) 0%, transparent 60%); "></div>
          <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><circle cx=%2230%22 cy=%2230%22 r=%221%22 fill=%22white%22/></svg>'); background-size: 60px 60px;"></div>
          <div class="relative max-w-7xl mx-auto px-6 ${hasMedia ? 'py-16 md:py-24' : 'py-20 md:py-32'} grid ${hasMedia ? 'lg:grid-cols-2' : 'grid-cols-1'} gap-12 items-center">
            <div class="${hasMedia ? '' : 'max-w-3xl mx-auto text-center'}">
              <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-white text-sm font-semibold mb-6 border border-white/10">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Disponible maintenant
              </div>
              <h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-[1.08] tracking-tight">${esc(c.title || name)}</h1>
              <p class="text-lg md:text-xl text-white/80 mb-10 leading-relaxed max-w-xl ${hasMedia ? '' : 'mx-auto'}">${esc(c.subtitle)}</p>
              ${c.cta ? `
              <div class="flex items-center gap-4 flex-wrap ${hasMedia ? '' : 'justify-center'}">
                <a href="${resolveCta(c.ctaLink)}"${ctaTarget(c.ctaLink)} class="group inline-flex items-center gap-2 px-8 py-4 bg-white font-bold text-lg rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300" style="color: ${pc}">
                  ${esc(c.cta)}
                  <svg class="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                </a>
                ${hasSection('contact') ? `<a href="#contact" class="inline-flex items-center gap-2 px-6 py-4 rounded-xl border-2 border-white/20 text-white font-semibold hover:bg-white/10 transition-all duration-200">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  Nous contacter
                </a>` : ''}
              </div>` : ''}
              ${trustHtml}
            </div>
            ${hasMedia ? `
            <div class="hidden lg:block relative">
              ${mediaHtml}
              ${bookingUrl ? `
              <div class="absolute -bottom-4 -left-4 bg-white rounded-xl px-5 py-3 shadow-xl flex items-center gap-3 animate-float">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg" style="background: ${pc}">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div>
                  <div class="text-sm font-bold text-gray-900">Reservation en ligne</div>
                  <div class="text-xs text-gray-500">24h/24 · 7j/7</div>
                </div>
              </div>` : ''}
            </div>` : ''}
          </div>
          ${hasMedia && c.imageUrl && !c.videoUrl ? `
          <div class="lg:hidden px-6 pb-12 -mt-4 relative">
            <div class="aspect-video rounded-2xl overflow-hidden shadow-xl">
              <img src="${esc(c.imageUrl)}" alt="${esc(c.title)}" loading="eager" class="w-full h-full object-cover"/>
            </div>
          </div>` : ''}
        </section>

        <!-- Reassurance bar -->
        <div class="py-5 border-b border-gray-100 overflow-hidden" style="background: ${bg}">
          <div class="max-w-7xl mx-auto px-6 flex justify-center gap-6 md:gap-12 flex-wrap">
            ${[
              {i:'<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>',t:'Reponse rapide'},
              {i:'<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>',t:'Donnees securisees'},
              {i:'<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',t:'RDV en ligne 24h/24'},
              {i:'<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',t:'100% gratuit'}
            ].map(r => `
              <div class="flex items-center gap-2 text-sm font-semibold opacity-50 whitespace-nowrap" style="color: ${tx}">
                <span style="color: ${pc}" class="flex-shrink-0">${r.i}</span>
                <span>${r.t}</span>
              </div>`).join('')}
          </div>
        </div>`;
        break;
      }

      case 'about': {
        const hasImg = !!c.imageUrl;
        html = `
        <section id="about" class="scroll-reveal py-16 md:py-24 px-6" style="background: ${bg}">
          <div class="max-w-7xl mx-auto grid ${hasImg ? 'lg:grid-cols-2' : 'grid-cols-1'} gap-12 lg:gap-16 items-center">
            ${hasImg ? `
            <div class="relative">
              <div class="rounded-2xl overflow-hidden shadow-xl aspect-[4/3]">
                <img src="${esc(c.imageUrl)}" alt="${esc(c.title)}" loading="lazy" class="w-full h-full object-cover"/>
              </div>
              <div class="absolute -bottom-4 -right-4 w-24 h-24 rounded-2xl opacity-20" style="background: ${pc}"></div>
            </div>` : ''}
            <div class="${hasImg ? '' : 'max-w-3xl mx-auto text-center'}">
              <span class="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-5" style="background: ${pcLight}; color: ${pc}">A propos</span>
              <h2 class="text-3xl md:text-4xl font-extrabold mb-6 leading-tight" style="color: ${tx}">${esc(c.title || 'A propos')}</h2>
              <p class="text-base md:text-lg leading-[1.9] opacity-65" style="color: ${tx}">${esc(c.text)}</p>
              <div class="mt-8">
                <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-2 text-sm font-bold hover:gap-3 transition-all duration-200" style="color: ${pc}">
                  En savoir plus
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                </a>
              </div>
            </div>
          </div>
        </section>`;
        break;
      }

      case 'process': {
        const steps = c.items || c.steps || [];
        html = `
        <section id="process" class="scroll-reveal py-16 md:py-24 px-6" style="background: ${bg === '#FFFFFF' ? '#FAFBFC' : bg}">
          <div class="max-w-7xl mx-auto">
            <div class="text-center mb-14">
              <span class="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4" style="background: ${pcLight}; color: ${pc}">Comment ca marche</span>
              <h2 class="text-3xl md:text-4xl font-extrabold mb-4" style="color: ${tx}">${esc(c.title || 'Comment ca marche ?')}</h2>
              <p class="text-base opacity-60 max-w-2xl mx-auto" style="color: ${tx}">${esc(c.subtitle || 'Un processus simple et efficace en quelques etapes')}</p>
            </div>
            <div class="grid md:grid-cols-${Math.min(steps.length, 4)} gap-8 relative">
              <!-- Connection line -->
              <div class="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 opacity-10" style="background: ${pc}"></div>
              ${steps.map((step, i) => `
              <div class="relative text-center group">
                <div class="w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center text-2xl md:text-3xl font-extrabold text-white mx-auto mb-5 shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-300 relative z-10" style="background: linear-gradient(135deg, ${pc}, ${pc}CC)">
                  ${i + 1}
                </div>
                <h3 class="text-lg font-bold mb-2" style="color: ${tx}">${esc(step.title || step.name || `Etape ${i+1}`)}</h3>
                <p class="text-sm leading-relaxed opacity-55 max-w-xs mx-auto" style="color: ${tx}">${esc(step.description || step.text || '')}</p>
              </div>`).join('')}
            </div>
            <div class="text-center mt-12">
              <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-2 px-8 py-4 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" style="background: ${pc}">
                ${mainCtaText}
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              </a>
            </div>
          </div>
        </section>`;
        break;
      }

      case 'stats': {
        const items = c.items || [];
        html = `
        <section id="stats" class="scroll-reveal relative overflow-hidden py-16 md:py-20 px-6" style="background: linear-gradient(135deg, ${pc} 0%, ${pc}CC 100%)">
          <div class="absolute inset-0 pointer-events-none opacity-[0.04]" style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%2240%22 fill=%22none%22 stroke=%22white%22 stroke-width=%220.5%22/></svg>'); background-size: 40px 40px;"></div>
          <div class="relative max-w-7xl mx-auto">
            ${c.title ? `<h2 class="text-3xl md:text-4xl font-extrabold text-white text-center mb-12">${esc(c.title)}</h2>` : ''}
            <div class="grid grid-cols-2 md:grid-cols-${Math.min(items.length, 4)} gap-6 md:gap-10">
              ${items.map(stat => `
              <div class="text-center group">
                <div class="text-3xl md:text-5xl font-extrabold text-white mb-2 group-hover:scale-110 transition-transform duration-300">${esc(stat.value || stat.number || '0')}</div>
                <div class="text-sm md:text-base text-white/70 font-medium">${esc(stat.label || stat.title || '')}</div>
              </div>`).join('')}
            </div>
            <div class="text-center mt-10">
              <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-2 px-8 py-3.5 bg-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" style="color: ${pc}">
                Rejoignez-nous
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              </a>
            </div>
          </div>
        </section>`;
        break;
      }

      case 'benefits': {
        const items = c.items || [];
        html = `
        <section id="benefits" class="scroll-reveal py-16 md:py-24 px-6" style="background: ${bg}">
          <div class="max-w-7xl mx-auto">
            <div class="text-center mb-14">
              <span class="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4" style="background: ${pcLight}; color: ${pc}">Nos avantages</span>
              <h2 class="text-3xl md:text-4xl font-extrabold mb-4" style="color: ${tx}">${esc(c.title || 'Pourquoi nous choisir ?')}</h2>
              <p class="text-base opacity-60 max-w-2xl mx-auto" style="color: ${tx}">${esc(c.subtitle || '')}</p>
            </div>
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              ${items.map((b, i) => {
                const icons = [
                  '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
                  '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>',
                  '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>',
                  '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
                  '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
                  '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>',
                ];
                return `
                <div class="group flex gap-4 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                  <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300" style="background: ${pcLight}; color: ${pc}">
                    ${icons[i % icons.length]}
                  </div>
                  <div>
                    <h3 class="text-base font-bold mb-1.5" style="color: ${tx}">${esc(b.title || b.name || '')}</h3>
                    <p class="text-sm leading-relaxed opacity-55" style="color: ${tx}">${esc(b.description || b.text || '')}</p>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </section>`;
        break;
      }

      case 'services': {
        const items = c.items || [];
        const svgIcons = [
          '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/></svg>',
          '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M8 12L11 15L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
          '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"/><path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
          '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.6"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.6"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.3"/></svg>',
          '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" fill="currentColor" opacity="0.8"/></svg>',
          '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="currentColor"/></svg>',
        ];

        html = `
        <section id="services" class="scroll-reveal py-16 md:py-24 px-6" style="background: ${bg === '#FFFFFF' ? '#FAFBFC' : bg}">
          <div class="max-w-7xl mx-auto">
            <div class="text-center mb-14">
              <span class="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4" style="background: ${pcLight}; color: ${pc}">Nos services</span>
              <h2 class="text-3xl md:text-4xl font-extrabold mb-4" style="color: ${tx}">${esc(c.title || 'Nos services')}</h2>
              <p class="text-base opacity-60 max-w-2xl mx-auto" style="color: ${tx}">${esc(c.subtitle || 'Decouvrez nos prestations adaptees a vos besoins')}</p>
            </div>
            <div class="grid sm:grid-cols-2 ${items.length >= 3 ? 'lg:grid-cols-3' : ''} gap-6">
              ${items.map((item, i) => `
              <div class="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 border border-gray-100">
                ${item.imageUrl ? `
                <div class="h-48 overflow-hidden relative">
                  <img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
                  <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>` : `
                <div class="h-2" style="background: linear-gradient(90deg, ${pc}, ${pc}88)"></div>`}
                <div class="p-6">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background: ${pcLight}; color: ${pc}">
                      ${svgIcons[i % svgIcons.length]}
                    </div>
                    <h3 class="text-lg font-bold" style="color: ${tx}">${esc(item.name)}</h3>
                  </div>
                  <p class="text-sm leading-relaxed opacity-55 mb-4" style="color: ${tx}">${esc(item.description)}</p>
                  ${item.price ? `<div class="text-xl font-extrabold mb-3" style="color: ${pc}">${esc(item.price)}</div>` : ''}
                  <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-1.5 text-sm font-bold hover:gap-2.5 transition-all duration-200" style="color: ${pc}">
                    En savoir plus
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                  </a>
                </div>
              </div>`).join('')}
            </div>
            <div class="text-center mt-10">
              <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-2 px-8 py-4 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" style="background: ${pc}">
                Voir toutes nos prestations
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              </a>
            </div>
          </div>
        </section>`;
        break;
      }

      case 'guarantee': {
        const items = c.items || [];
        html = `
        <section id="guarantee" class="scroll-reveal py-16 md:py-20 px-6" style="background: ${bg}">
          <div class="max-w-5xl mx-auto">
            <div class="rounded-2xl border-2 p-8 md:p-12 relative overflow-hidden" style="border-color: ${pc}20; background: linear-gradient(135deg, ${pc}05 0%, ${pc}10 100%)">
              <div class="absolute top-0 right-0 w-32 h-32 opacity-5" style="background: ${pc}; border-radius: 0 0 0 100%;"></div>
              <div class="flex flex-col md:flex-row items-start gap-6 md:gap-10">
                <div class="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0" style="background: ${pcLight}; color: ${pc}">
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                </div>
                <div class="flex-1">
                  <h2 class="text-2xl md:text-3xl font-extrabold mb-4" style="color: ${tx}">${esc(c.title || 'Nos garanties')}</h2>
                  <p class="text-base opacity-60 mb-6" style="color: ${tx}">${esc(c.subtitle || 'Votre satisfaction est notre priorite')}</p>
                  ${items.length ? `
                  <div class="grid sm:grid-cols-2 gap-3">
                    ${items.map(g => `
                    <div class="flex items-start gap-3">
                      <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style="background: ${pcLight}; color: ${pc}">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                      </div>
                      <span class="text-sm font-medium" style="color: ${tx}">${esc(g.text || g.title || g.name || '')}</span>
                    </div>`).join('')}
                  </div>` : ''}
                  <div class="mt-8">
                    <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-2 px-7 py-3.5 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" style="background: ${pc}">
                      ${mainCtaText}
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>`;
        break;
      }

      case 'testimonials': {
        const items = c.items || [];
        const colors = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#EC4899', '#0891B2'];
        html = `
        <section id="testimonials" class="scroll-reveal py-16 md:py-24 px-6" style="background: ${bg === '#FFFFFF' ? '#FAFBFC' : bg}">
          <div class="max-w-7xl mx-auto">
            <div class="text-center mb-14">
              <span class="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4" style="background: ${pcLight}; color: ${pc}">Ils nous font confiance</span>
              <h2 class="text-3xl md:text-4xl font-extrabold mb-4" style="color: ${tx}">${esc(c.title || 'Temoignages')}</h2>
              ${avgRating ? `<div class="flex items-center justify-center gap-2 mt-3">
                <span class="text-yellow-400 text-lg">${'★'.repeat(Math.round(avgRating))}</span>
                <span class="text-lg font-bold" style="color: ${tx}">${avgRating}/5</span>
                <span class="text-sm opacity-50" style="color: ${tx}">— ${testiCount} avis verifies</span>
              </div>` : ''}
            </div>
            <div class="grid sm:grid-cols-2 ${items.length >= 3 ? 'lg:grid-cols-3' : ''} gap-6">
              ${items.map((t, i) => {
                const ac = colors[i % colors.length];
                return `
                <div class="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative flex flex-col">
                  <div class="absolute top-5 right-6 text-5xl opacity-[0.06] font-black leading-none" style="color: ${pc}">"</div>
                  ${t.rating ? `<div class="text-yellow-400 text-sm mb-4 tracking-wider">${'★'.repeat(Math.min(t.rating, 5))}${'☆'.repeat(Math.max(0, 5 - t.rating))}</div>` : ''}
                  <p class="text-[15px] leading-relaxed opacity-70 mb-5 italic flex-1" style="color: ${tx}">"${esc(t.text)}"</p>
                  <div class="flex items-center gap-3 border-t border-gray-50 pt-4">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style="background: linear-gradient(135deg, ${ac}, ${ac}BB)">${(t.name || '?')[0].toUpperCase()}</div>
                    <div class="text-sm font-semibold" style="color: ${tx}">${esc(t.name)}</div>
                  </div>
                </div>`;
              }).join('')}
            </div>
            <div class="text-center mt-10">
              <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-2 px-8 py-4 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" style="background: ${pc}">
                ${mainCtaText}
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              </a>
            </div>
          </div>
        </section>`;
        break;
      }

      case 'gallery': {
        const images = c.images || c.items || [];
        html = `
        <section id="gallery" class="scroll-reveal py-16 md:py-24 px-6" style="background: ${bg}">
          <div class="max-w-7xl mx-auto">
            <div class="text-center mb-14">
              <span class="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4" style="background: ${pcLight}; color: ${pc}">Galerie</span>
              <h2 class="text-3xl md:text-4xl font-extrabold" style="color: ${tx}">${esc(c.title || 'Nos realisations')}</h2>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
              ${images.map((img, i) => `
              <div class="group relative rounded-xl overflow-hidden ${i === 0 ? 'md:col-span-2 md:row-span-2' : ''} aspect-square">
                <img src="${esc(img.url || img.imageUrl || img)}" alt="${esc(img.alt || img.title || '')}" loading="lazy" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"/>
                <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                  ${img.title ? `<span class="text-white text-sm font-semibold">${esc(img.title)}</span>` : ''}
                </div>
              </div>`).join('')}
            </div>
          </div>
        </section>`;
        break;
      }

      case 'faq': {
        const items = c.items || [];
        html = `
        <section id="faq" class="scroll-reveal py-16 md:py-24 px-6" style="background: ${bg === '#FFFFFF' ? '#FAFBFC' : bg}">
          <div class="max-w-3xl mx-auto">
            <div class="text-center mb-14">
              <span class="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4" style="background: ${pcLight}; color: ${pc}">FAQ</span>
              <h2 class="text-3xl md:text-4xl font-extrabold mb-4" style="color: ${tx}">${esc(c.title || 'Questions frequentes')}</h2>
              <p class="text-base opacity-60" style="color: ${tx}">Toutes les reponses a vos questions</p>
            </div>
            <div class="space-y-3">
              ${items.map((faq, i) => `
              <div class="faq-item bg-white rounded-xl border border-gray-100 overflow-hidden transition-all duration-200 hover:border-gray-200 shadow-sm">
                <button onclick="toggleFaq(this)" class="w-full flex items-center justify-between px-6 py-5 text-left">
                  <span class="text-[15px] font-semibold pr-4" style="color: ${tx}">${esc(faq.q)}</span>
                  <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200" style="background: ${pcLight}; color: ${pc}">
                    <svg class="w-4 h-4 faq-icon transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  </div>
                </button>
                <div class="faq-answer hidden px-6 pb-5">
                  <p class="text-[15px] leading-relaxed opacity-65" style="color: ${tx}">${esc(faq.a)}</p>
                </div>
              </div>`).join('')}
            </div>
            <div class="text-center mt-10 p-8 rounded-2xl" style="background: ${pc}08">
              <p class="text-base font-semibold mb-3" style="color: ${tx}">Vous avez d'autres questions ?</p>
              <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-2 px-7 py-3.5 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" style="background: ${pc}">
                Contactez-nous
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              </a>
            </div>
          </div>
        </section>`;
        break;
      }

      case 'cta': {
        html = `
        <section id="booking" class="scroll-reveal relative overflow-hidden py-16 md:py-24 px-6" style="background: linear-gradient(135deg, ${pc} 0%, ${pc}DD 100%)">
          <div class="absolute inset-0 pointer-events-none opacity-[0.03]" style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><circle cx=%2230%22 cy=%2230%22 r=%221.5%22 fill=%22white%22/></svg>'); background-size: 60px 60px;"></div>
          <div class="relative max-w-3xl mx-auto text-center text-white">
            <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-sm font-semibold mb-6 border border-white/10">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Passez a l'action
            </div>
            <h2 class="text-3xl md:text-5xl font-extrabold mb-5 leading-tight">${esc(c.title || 'Pret a commencer ?')}</h2>
            <p class="text-lg md:text-xl opacity-80 mb-10 leading-relaxed max-w-xl mx-auto">${esc(c.subtitle || "N'attendez plus, prenez rendez-vous des maintenant.")}</p>
            <div class="flex gap-4 justify-center flex-wrap">
              <a href="${resolveCta(c.buttonLink)}"${ctaTarget(c.buttonLink)} class="group inline-flex items-center gap-2 px-10 py-4 bg-white font-bold text-lg rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300" style="color: ${pc}">
                ${esc(c.buttonText || 'Reserver')}
                <svg class="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              </a>
              ${hasSection('contact') ? `<a href="#contact" class="inline-flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-white/25 text-white font-semibold hover:bg-white/10 transition-all duration-200">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                Nous contacter
              </a>` : ''}
            </div>
            <div class="flex justify-center gap-6 mt-8 flex-wrap">
              ${['Gratuit et sans engagement', 'Reponse rapide', 'RDV en ligne 24h/24'].map(t => `
              <span class="flex items-center gap-1.5 text-sm opacity-60 font-medium">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M5 13l4 4L19 7"/></svg>
                ${t}
              </span>`).join('')}
            </div>
          </div>
        </section>`;
        break;
      }

      case 'contact': {
        html = `
        <section id="contact" class="scroll-reveal py-16 md:py-24 px-6" style="background: ${bg}">
          <div class="max-w-6xl mx-auto">
            <div class="text-center mb-14">
              <span class="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4" style="background: ${pcLight}; color: ${pc}">Contact</span>
              <h2 class="text-3xl md:text-4xl font-extrabold mb-4" style="color: ${tx}">${esc(c.title || 'Contactez-nous')}</h2>
              <p class="text-base opacity-60" style="color: ${tx}">Nous sommes a votre ecoute</p>
            </div>
            <div class="grid ${c.showForm ? 'lg:grid-cols-5' : ''} gap-10">
              <div class="${c.showForm ? 'lg:col-span-2' : ''} space-y-5">
                ${c.address ? `
                <div class="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-white">
                  <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style="background: ${pcLight}; color: ${pc}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </div>
                  <div>
                    <div class="text-xs font-bold uppercase tracking-wider opacity-40 mb-1" style="color: ${tx}">Adresse</div>
                    <div class="text-[15px] leading-relaxed" style="color: ${tx}">${esc(c.address)}</div>
                  </div>
                </div>` : ''}
                ${c.phone ? `
                <div class="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-white">
                  <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style="background: ${pcLight}; color: ${pc}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                  </div>
                  <div>
                    <div class="text-xs font-bold uppercase tracking-wider opacity-40 mb-1" style="color: ${tx}">Telephone</div>
                    <a href="tel:${esc(c.phone)}" class="text-[15px] font-semibold hover:underline" style="color: ${pc}">${esc(c.phone)}</a>
                  </div>
                </div>` : ''}
                ${c.email ? `
                <div class="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-white">
                  <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style="background: ${pcLight}; color: ${pc}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  </div>
                  <div>
                    <div class="text-xs font-bold uppercase tracking-wider opacity-40 mb-1" style="color: ${tx}">Email</div>
                    <a href="mailto:${esc(c.email)}" class="text-[15px] font-semibold hover:underline" style="color: ${pc}">${esc(c.email)}</a>
                  </div>
                </div>` : ''}
                ${c.hours ? `
                <div class="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-white">
                  <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style="background: ${pcLight}; color: ${pc}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <div>
                    <div class="text-xs font-bold uppercase tracking-wider opacity-40 mb-1" style="color: ${tx}">Horaires</div>
                    <div class="text-[15px]" style="color: ${tx}">${esc(c.hours)}</div>
                  </div>
                </div>` : ''}
                ${bookingUrl ? `
                <div class="mt-4">
                  <a href="${bookingUrl}" target="_blank" rel="noreferrer" class="flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 hover:shadow-md" style="border-color: ${pc}30; background: ${pc}05">
                    <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style="background: ${pc}">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <div>
                      <div class="text-sm font-bold" style="color: ${pc}">Prendre rendez-vous en ligne</div>
                      <div class="text-xs opacity-50" style="color: ${tx}">Disponible 24h/24</div>
                    </div>
                  </a>
                </div>` : ''}
              </div>
              ${c.showForm ? `
              <div class="lg:col-span-3 bg-gray-50 rounded-2xl p-6 md:p-8 border border-gray-100">
                <div id="lead-form">
                  <div class="text-lg font-bold mb-1" style="color: ${tx}">Envoyez-nous un message</div>
                  <p class="text-sm opacity-50 mb-6" style="color: ${tx}">Nous vous repondrons dans les plus brefs delais</p>
                  <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label class="text-xs font-semibold opacity-50 block mb-1.5" style="color: ${tx}">Nom *</label>
                      <input id="lf-name" placeholder="Votre nom" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none transition-colors bg-white" required/>
                    </div>
                    <div>
                      <label class="text-xs font-semibold opacity-50 block mb-1.5" style="color: ${tx}">Email *</label>
                      <input id="lf-email" type="email" placeholder="votre@email.com" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none transition-colors bg-white" required/>
                    </div>
                  </div>
                  <div class="mb-3">
                    <label class="text-xs font-semibold opacity-50 block mb-1.5" style="color: ${tx}">Telephone</label>
                    <input id="lf-phone" placeholder="+33 6 12 34 56 78" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none transition-colors bg-white"/>
                  </div>
                  <div class="mb-4">
                    <label class="text-xs font-semibold opacity-50 block mb-1.5" style="color: ${tx}">Message *</label>
                    <textarea id="lf-message" rows="4" placeholder="Decrivez votre besoin..." class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none transition-colors resize-y bg-white" required></textarea>
                  </div>
                  <button onclick="submitLead()" id="lf-btn" class="w-full py-3.5 text-white font-bold rounded-xl text-[15px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer flex items-center justify-center gap-2" style="background: ${pc}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                    Envoyer le message
                  </button>
                  <p class="text-xs opacity-40 mt-3 text-center" style="color: ${tx}">En envoyant ce formulaire, vous acceptez d'etre recontacte</p>
                </div>
                <div id="lead-done" class="hidden text-center py-10">
                  <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style="background: ${pcLight}; color: ${pc}">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <div class="text-xl font-bold mb-2" style="color: ${tx}">Message envoye !</div>
                  <div class="text-sm opacity-60" style="color: ${tx}">Nous vous repondrons dans les plus brefs delais.</div>
                </div>
              </div>` : ''}
            </div>
          </div>
        </section>`;
        break;
      }

      default:
        break;
    }

    if (html) {
      builtSections.push(html);

      // Inject mini-CTA banner after about, services, or testimonials (max 2 banners total)
      if (miniCtaIdx < 2 && ['about', 'services', 'testimonials'].includes(section.type)) {
        const mc = miniCtaTexts[miniCtaIdx % miniCtaTexts.length];
        builtSections.push(miniCtaBanner(mc.t, mc.s, miniCtaIdx));
        miniCtaIdx++;
      }
    }
  });

  const sectionsHtml = builtSections.join('\n');

  // ─── Navigation ───
  const navLinks = [];
  if (hasSection('about')) navLinks.push({ href: '#about', label: 'A propos' });
  if (hasSection('services')) navLinks.push({ href: '#services', label: 'Services' });
  if (hasSection('process')) navLinks.push({ href: '#process', label: 'Comment ca marche' });
  if (hasSection('testimonials')) navLinks.push({ href: '#testimonials', label: 'Avis' });
  if (hasSection('faq')) navLinks.push({ href: '#faq', label: 'FAQ' });
  if (hasSection('contact')) navLinks.push({ href: '#contact', label: 'Contact' });

  // ─── Full HTML ───
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(seo?.title || name || cName)}</title>
  <meta name="description" content="${esc(seo?.description || '')}">
  <meta name="keywords" content="${esc(seo?.keywords || '')}">
  <meta property="og:title" content="${esc(seo?.title || name || cName)}">
  <meta property="og:description" content="${esc(seo?.description || '')}">
  <meta property="og:type" content="website">
  <link rel="icon" href="/favicon.svg">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
    html { scroll-behavior: smooth; }
    img { max-width: 100%; }

    /* Scroll reveal animation */
    .scroll-reveal {
      opacity: 0;
      transform: translateY(30px);
      transition: opacity 0.7s ease, transform 0.7s ease;
    }
    .scroll-reveal.visible {
      opacity: 1;
      transform: translateY(0);
    }

    /* Staggered reveal for children */
    .scroll-reveal.visible > div > div:nth-child(1) { transition-delay: 0.05s; }
    .scroll-reveal.visible > div > div:nth-child(2) { transition-delay: 0.1s; }
    .scroll-reveal.visible > div > div:nth-child(3) { transition-delay: 0.15s; }

    /* Navbar scroll effect */
    .nav-scrolled { box-shadow: 0 1px 20px rgba(0,0,0,.06); }

    /* FAQ open state */
    .faq-item.open .faq-icon { transform: rotate(45deg); }
    .faq-item.open .faq-answer { display: block !important; }
    .faq-item.open button > div:last-child { background: ${pc}; color: white; }

    /* Focus states */
    input:focus, textarea:focus { border-color: ${pc} !important; box-shadow: 0 0 0 3px ${pc}15; }

    /* Float animation for booking card */
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
    .animate-float { animation: float 3s ease-in-out infinite; }

    /* Sticky mobile CTA */
    .sticky-cta {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 40;
      padding: 12px 16px;
      background: white;
      box-shadow: 0 -4px 20px rgba(0,0,0,.1);
      transform: translateY(100%);
      transition: transform 0.3s ease;
    }
    .sticky-cta.show { transform: translateY(0); }

    @media (min-width: 768px) {
      .sticky-cta { display: none !important; }
    }
  </style>
</head>
<body style="background: ${bg}; color: ${tx}">

  <!-- NAVIGATION -->
  <nav id="main-nav" class="sticky top-0 z-50 backdrop-blur-xl border-b border-black/5 transition-shadow duration-300" style="background: ${bg}E6">
    <div class="max-w-7xl mx-auto flex justify-between items-center h-16 px-6">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-base font-extrabold" style="background: linear-gradient(135deg, ${pc}, ${pc}BB)">${cName[0]}</div>
        <span class="text-[17px] font-extrabold tracking-tight" style="color: ${tx}">${esc(cName)}</span>
      </div>
      <div class="hidden md:flex items-center gap-7">
        ${navLinks.map(l => `<a href="${l.href}" class="text-sm font-medium opacity-60 hover:opacity-100 transition-opacity" style="color: ${tx}">${l.label}</a>`).join('')}
        <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="px-5 py-2.5 text-white text-sm font-bold rounded-lg shadow-md hover:-translate-y-0.5 transition-all duration-200" style="background: ${pc}">${mainCtaText}</a>
      </div>
      <button onclick="document.getElementById('mobile-menu').classList.toggle('hidden')" class="md:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </div>
    <div id="mobile-menu" class="hidden md:hidden border-t border-gray-100 px-6 py-4 space-y-3" style="background: ${bg}">
      ${navLinks.map(l => `<a href="${l.href}" class="block text-sm font-medium opacity-70 py-1" style="color: ${tx}" onclick="document.getElementById('mobile-menu').classList.add('hidden')">${l.label}</a>`).join('')}
      <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="block text-center px-5 py-2.5 text-white text-sm font-bold rounded-lg mt-2" style="background: ${pc}" onclick="document.getElementById('mobile-menu').classList.add('hidden')">${mainCtaText}</a>
    </div>
  </nav>

  <!-- SECTIONS -->
  ${sectionsHtml}

  <!-- FOOTER -->
  <footer class="bg-gray-950 text-white pt-14 pb-8 px-6">
    <div class="max-w-7xl mx-auto">
      <div class="grid md:grid-cols-4 gap-10 mb-10">
        <div class="md:col-span-2">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-base font-extrabold" style="background: linear-gradient(135deg, ${pc}, ${pc}BB)">${cName[0]}</div>
            <span class="text-[17px] font-extrabold">${esc(cName)}</span>
          </div>
          <div class="text-sm leading-relaxed opacity-50 max-w-sm mb-4">
            ${contactContent.address ? `<div class="mb-1">${esc(contactContent.address)}</div>` : ''}
            ${contactContent.phone ? `<div class="mb-1">${esc(contactContent.phone)}</div>` : ''}
            ${contactContent.email ? `<div class="mb-1">${esc(contactContent.email)}</div>` : ''}
            ${(!contactContent.address && !contactContent.phone && !contactContent.email) ? '<div>Votre partenaire de confiance</div>' : ''}
          </div>
        </div>
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider opacity-35 mb-4">Navigation</h4>
          <div class="flex flex-col gap-2.5">
            ${navLinks.map(l => `<a href="${l.href}" class="text-sm opacity-60 hover:opacity-100 transition">${l.label}</a>`).join('')}
          </div>
        </div>
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider opacity-35 mb-4">Acces rapide</h4>
          <div class="flex flex-col gap-2.5">
            ${bookingUrl ? `<a href="${bookingUrl}" target="_blank" rel="noreferrer" class="text-sm opacity-60 hover:opacity-100 transition flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Prendre RDV
            </a>` : ''}
            ${hasSection('contact') ? `<a href="#contact" class="text-sm opacity-60 hover:opacity-100 transition flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              Nous contacter
            </a>` : ''}
            ${hasSection('faq') ? `<a href="#faq" class="text-sm opacity-60 hover:opacity-100 transition flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              FAQ
            </a>` : ''}
          </div>
        </div>
      </div>
      <div class="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-3">
        <div class="text-xs opacity-35">&copy; ${new Date().getFullYear()} ${esc(cName)} — Tous droits reserves</div>
        <a href="https://calendar360.fr" target="_blank" rel="noreferrer" class="text-[10px] opacity-20 hover:opacity-40 transition">Propulse par Calendar360</a>
      </div>
    </div>
  </footer>

  <!-- STICKY MOBILE CTA -->
  <div id="sticky-cta" class="sticky-cta">
    <a href="${mainCta}"${ctaIsExternal ? ' target="_blank" rel="noreferrer"' : ''} class="flex items-center justify-center gap-2 w-full py-3.5 text-white font-bold rounded-xl text-[15px]" style="background: ${pc}">
      ${mainCtaText}
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
    </a>
  </div>

  <!-- SCRIPTS -->
  <script>
    // FAQ Accordion
    function toggleFaq(btn) {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    }

    // Scroll Reveal (IntersectionObserver)
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));

    // Nav scroll effect
    window.addEventListener('scroll', () => {
      const nav = document.getElementById('main-nav');
      const sticky = document.getElementById('sticky-cta');
      if (window.scrollY > 50) nav.classList.add('nav-scrolled');
      else nav.classList.remove('nav-scrolled');
      // Show sticky CTA after scrolling past hero
      if (window.scrollY > 500) sticky.classList.add('show');
      else sticky.classList.remove('show');
    });

    // Lead Form Submission
    async function submitLead() {
      const name = document.getElementById('lf-name')?.value || '';
      const email = document.getElementById('lf-email')?.value || '';
      const phone = document.getElementById('lf-phone')?.value || '';
      const message = document.getElementById('lf-message')?.value || '';
      if (!name && !email) return;
      const btn = document.getElementById('lf-btn');
      btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Envoi en cours...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/pages/${id}/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, message })
        });
        if (res.ok) {
          document.getElementById('lead-form').classList.add('hidden');
          document.getElementById('lead-done').classList.remove('hidden');
        } else { btn.innerHTML = 'Erreur — Reessayer'; btn.disabled = false; }
      } catch { btn.innerHTML = 'Erreur — Reessayer'; btn.disabled = false; }
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  </script>
</body>
</html>`;
}
