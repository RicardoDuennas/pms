
document.addEventListener('DOMContentLoaded', () => {
  const FOLDER = 'imas/';
  const PLACEHOLDER = `${FOLDER}pms_base.jpg`;

  /* ---------- util: probe image (boolean) ---------- */
  const probeImage = (url, timeout = 4000) => new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const ok = () => { if (!done) { done = true; resolve(true); } };
    const no = () => { if (!done) { done = true; resolve(false); } };
    img.onload = ok;
    img.onerror = no;
    img.src = url;
    setTimeout(no, timeout);
  });

  /* ---------- 1) BANNER: buscar pms_header_imgXX.jpg y aplicar aleatoria ---------- */
  (async function bannerInit() {
    const el = document.getElementById('bannerImg');
    if (!el) return;

    const prefix = 'pms_header_img';
    const ext = '.jpg';
    const maxTry = 30; 

    const urls = Array.from({ length: maxTry }, (_, i) => `${FOLDER}${prefix}${String(i + 1).padStart(2, '0')}${ext}`);

    const results = await Promise.all(urls.map(u => probeImage(u).then(ok => ok ? u : null)));
    const found = results.filter(Boolean);
    if (!found.length) return;

    const pick = found[Math.floor(Math.random() * found.length)];
    el.style.backgroundImage = `url("${pick}")`;
    el.style.backgroundSize = 'auto 100%';
    el.style.backgroundRepeat = 'repeat-x';

    let x = 0;
    const speed = 0.02; // px per frame (very slow)
    let raf;
    const animate = () => {
      x -= speed;
      // use integer to avoid sub-pixel jitter on some browsers
      el.style.backgroundPosition = `${Math.round(x)}px 0`;
      raf = requestAnimationFrame(animate);
    };
    // kick off after paint
    requestAnimationFrame(animate);
    // cleanup on page unload
    window.addEventListener('beforeunload', () => cancelAnimationFrame(raf));
  })();

  /* ---------- 2) GALLERY TRACK (horizontal auto-scroll) ---------- */
  (function galleryTrackInit() {
    const track = document.getElementById('galleryTrack');
    if (!track) return;

    // Lista base de thumbs (mantener nombres tal como en tu proyecto)
    const thumbsBase = [
      { name: '01a', title: 'Monte Samai A' },
      { name: '01b', title: 'Monte Samai B' },
      { name: '01c', title: 'Monte Samai C' },
      { name: '02a', title: 'Colectivo Renacer, El Ocaso' },
      { name: '03a', title: 'La Esmeralda A' },
      { name: '03b', title: 'La Esmeralda B' },
      { name: '04a', title: 'CCSDS A' },
      { name: '04b', title: 'CCSDS B' },
      { name: '04c', title: 'CCSDS C' },
      { name: '05a', title: 'Apachin' },
      { name: '06a', title: 'IED Jose Hugo Encizo, Reventones' }
    ];

    // construir thumbs y comprobar existencia en paralelo (pero no bloquear UI)
    const thumbEntries = thumbsBase.map(it => ({
      thumb: `${FOLDER}${it.name}_th.jpg`,
      href: `${it.name}.html`,
      title: it.title
    }));

    // Probe thumbs in parallel (fast)
    Promise.all(thumbEntries.map(entry => probeImage(entry.thumb).then(ok => ok ? entry : { ...entry, missing: true })))
      .then(results => {
        // use available thumbs; if none available, create placeholders from list (will show placeholder image)
        const available = results.map(r => ({ ...r }));
        // shuffle and triplicar para seamless
        const shuffle = arr => arr.sort(() => Math.random() - 0.5);
        const chosen = shuffle(available.length ? available : thumbEntries);
        const display = [...chosen, ...chosen, ...chosen];

        track.innerHTML = display.map(it => `
          <a class="gallery-card" href="${it.href}">
            <img src="${it.thumb}" alt="${it.title}" loading="lazy"
                 onerror="this.onerror=null;this.src='${PLACEHOLDER}';">
            <div class="card-label">${it.title}</div>
          </a>
        `).join('');

        // auto-scroll logic
        const speed = 0.75; // px per frame-ish
        let hovering = false;
        let rafId = null;

        // set initial scroll to 1/3 after layout
        requestAnimationFrame(() => { track.scrollLeft = Math.round(track.scrollWidth / 3); });

        const step = () => {
          if (!hovering) {
            track.scrollLeft += speed;
            const third = track.scrollWidth / 3;
            if (track.scrollLeft >= third * 2) track.scrollLeft = third;
          }
          rafId = requestAnimationFrame(step);
        };
        rafId = requestAnimationFrame(step);

        // interactions
        track.addEventListener('mouseenter', () => hovering = true);
        track.addEventListener('mouseleave', () => hovering = false);
        track.addEventListener('touchstart', () => hovering = true, { passive: true });
        track.addEventListener('touchend', () => setTimeout(() => hovering = false, 700), { passive: true });

        window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
      });
  })();

  /* ---------- 3) MASONRY GALLERY (pms_info_ph*.jpg) ---------- */
  (async function masonryLoad() {
    const gal = document.getElementById('galeria');
    if (!gal) return;

    const candidates = new Set();

    // prefer named ones inferred from thumbsBase (if they exist)
    const named = [
      '01a','01b','01c','02a','03a','03b','04a','04b','04c','05a','06a'
    ];
    named.forEach(n => candidates.add(`${FOLDER}pms_info_ph${n}.jpg`));

    // también añadir variantes numéricas 01..50
    for (let i = 1; i <= 50; i++) candidates.add(`${FOLDER}pms_info_ph${String(i).padStart(2,'0')}.jpg`);

    const urls = Array.from(candidates);
    const concurrency = 10;
    const found = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency).map(u => probeImage(u).then(ok => ok ? u : null));
      const results = await Promise.all(batch);
      results.forEach(r => { if (r) found.push(r); });
    }

    if (!found.length) return;

    const shuffled = found.sort(() => Math.random() - 0.5);
    gal.innerHTML = shuffled.map(src => `<img src="${src}" alt="">`).join('');
  })();

  /* ---------- 4) NAV fixed on scroll (throttled via rAF) ---------- */
  (function navFixed() {
    const header = document.querySelector('.header-banner');
    const nav = document.querySelector('.nav-icons');
    if (!header || !nav) return;

    let ticking = false;
    const getHeaderBottom = () => header.getBoundingClientRect().bottom + window.scrollY;

    const update = () => {
      const threshold = getHeaderBottom() - 8;
      if (window.scrollY > threshold) nav.classList.add('is-fixed');
      else nav.classList.remove('is-fixed');
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });

    window.addEventListener('resize', () => { requestAnimationFrame(update); }, { passive: true });

    // initial
    requestAnimationFrame(update);
  })();

  /* ---------- 5) IntersectionObserver -> nav active per section ---------- */

  (function observeSections() {
    const sections = document.querySelectorAll('section.section');
    const navLinks = document.querySelectorAll('.nav-icons .nav-icon');
    if (!sections.length || !navLinks.length) return;

    const thresholds = [0, 0.25, 0.5, 0.75, 1];

    let getNavHeight = () => document.querySelector('.nav-icons')?.getBoundingClientRect().height || 0;

    function createObserver(navHeight) {
      const obs = new IntersectionObserver((entries) => {
        // elegir la sección con mayor intersectionRatio
        let best = null;
        entries.forEach(e => {
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        });

        if (best && best.isIntersecting) {
          navLinks.forEach(l => l.classList.remove('active'));
          const id = best.target.id;
          document.querySelector(`.nav-icons a[href="#${id}"]`)?.classList.add('active');
        }
      }, { threshold: thresholds, rootMargin: `-${Math.round(navHeight)}px 0px 0px 0px` });

      sections.forEach(s => obs.observe(s));
      return obs;
    }

    // crear observer inicial
    let observer = createObserver(getNavHeight());

    // on resize, rebuild observer with updated nav height
    window.addEventListener('resize', () => {
      if (observer) observer.disconnect();
      observer = createObserver(getNavHeight());
    }, { passive: true });
  })();

  /* ---------- 6) Smooth scroll (offset by nav height) ---------- */
  (function smoothScroll() {
    document.querySelectorAll('.nav-icon').forEach(a => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (!href || !href.startsWith('#')) return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();

        const nav = document.querySelector('.nav-icons');
        const navHeight = nav ? nav.getBoundingClientRect().height : 0;
        const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - navHeight - 8);
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  })();

});
