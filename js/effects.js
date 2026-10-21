(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDesktop = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isTouch = !isDesktop && matchMedia('(pointer: coarse)').matches;
  const hasFireflies = !reducedMotion;
  if (!isDesktop && !isTouch && !hasFireflies) return;

  const INTERACTIVE = 'a, button, .card, .menu-item';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
  const pick = (list) => list[(Math.random() * list.length) | 0];

  function make(cls, tag = 'div') {
    const node = document.createElement(tag);
    node.className = cls;
    return node;
  }

  function makeLayer(cls) {
    const layer = make(cls);
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }

  const written = {};
  function setVar(name, value) {
    if (written[name] === value) return;
    written[name] = value;
    root.style.setProperty(name, value);
  }

  // mouse (desktop) or tilt (mobile) writes `target`; the loop eases `current` toward it.
  // --px / --py (range -1..1) drive every parallax layer in the CSS.
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let screenName = '';

  // last pointer/finger position + velocity (px/s); fast swipes scatter the fireflies
  const stir = { x: -9999, y: -9999, vx: 0, vy: 0, t: 0 };
  function trackStir(x, y, timeStamp) {
    if (stir.t) {
      const sdt = Math.max(1, timeStamp - stir.t) / 1000;
      stir.vx = clamp(lerp(stir.vx, (x - stir.x) / sdt, 0.5), -3000, 3000);
      stir.vy = clamp(lerp(stir.vy, (y - stir.y) / sdt, 0.5), -3000, 3000);
    }
    stir.x = x;
    stir.y = y;
    stir.t = timeStamp;
  }

  /* ---------------- DESKTOP: mouse ---------------- */

  function initDesktop() {
    root.classList.add('fx-desktop');
    const trailLayer = makeLayer('fx-trail');
    const frame = make('cursor-frame');
    const star = make('cursor-star');
    frame.setAttribute('aria-hidden', 'true');
    star.setAttribute('aria-hidden', 'true');
    document.body.append(frame, star);

    const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    const follow = { ...pointer };
    let prev = { ...pointer };
    let lastMove = { ...pointer };
    let spin = 0;
    let travelled = 0;
    let trailAlive = 0;

    const TRAIL_ON_DARK = ['var(--accent)', 'var(--accent-2)', 'var(--lavender)', 'var(--mint)'];
    const TRAIL_ON_LIGHT = ['var(--ink)', 'var(--accent-2)'];

    function spawnTrail(x, y) {
      if (trailAlive > 40) return;
      const s = make('trail-star', 'span');
      const size = 6 + Math.random() * 10;
      s.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;`
        + `background:${pick(screenName === 'boot' ? TRAIL_ON_LIGHT : TRAIL_ON_DARK)}`;
      s.style.setProperty('--dx', `${(Math.random() - 0.5) * 50}px`);
      s.style.setProperty('--dy', `${12 + Math.random() * 36}px`);
      s.style.setProperty('--rot', `${(Math.random() - 0.5) * 300}deg`);
      trailLayer.appendChild(s);
      trailAlive++;
      s.addEventListener('animationend', () => { s.remove(); trailAlive--; }, { once: true });
    }

    addEventListener('mousemove', (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      trackStir(e.clientX, e.clientY, e.timeStamp);
      target.x = (e.clientX / innerWidth) * 2 - 1;
      target.y = (e.clientY / innerHeight) * 2 - 1;
      root.classList.add('cursor-visible');

      if (!reducedMotion) {
        travelled += Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y);
        if (travelled > 26) {
          travelled = 0;
          spawnTrail(e.clientX, e.clientY);
        }
      }
      lastMove = { x: e.clientX, y: e.clientY };
    }, { passive: true });

    document.addEventListener('mouseover', (e) => {
      // an iframe (Sketchfab viewer) swallows mouse events, so hand back to its own cursor
      if (e.target.tagName === 'IFRAME') {
        root.classList.remove('cursor-visible');
        return;
      }
      root.classList.toggle('cursor-hover', !!e.target.closest?.(INTERACTIVE));
    });
    root.addEventListener('mouseleave', () => root.classList.remove('cursor-visible'));
    addEventListener('mousedown', () => root.classList.add('cursor-down'));
    addEventListener('mouseup', () => root.classList.remove('cursor-down'));

    document.querySelectorAll('.menu-item').forEach((item) => {
      item.addEventListener('mousemove', (e) => {
        const r = item.getBoundingClientRect();
        item.style.setProperty('--sx', `${((e.clientX - r.left) / r.width) * 100}%`);
        item.style.setProperty('--sy', `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    });

    return (dt) => {
      const a = ease(16, dt);
      follow.x = lerp(follow.x, pointer.x, a);
      follow.y = lerp(follow.y, pointer.y, a);
      spin = (spin + Math.hypot(pointer.x - prev.x, pointer.y - prev.y) * 1.2) % 360;
      prev = { x: pointer.x, y: pointer.y };

      star.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) rotate(${spin}deg)`;
      frame.style.transform = `translate3d(${follow.x}px, ${follow.y}px, 0)`;
      setVar('--cx', `${follow.x.toFixed(1)}px`);
      setVar('--cy', `${follow.y.toFixed(1)}px`);
    };
  }

  /* ---------------- MOBILE: tilt / gravity ---------------- */

  function createStars(layer, count) {
    return Array.from({ length: count }, () => {
      const node = make('g-star', 'span');
      const size = 8 + Math.random() * 14;
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      layer.appendChild(node);
      const hx = Math.random();
      const hy = Math.random();
      return {
        node, size, hx, hy,
        x: hx * innerWidth,
        y: hy * innerHeight,
        vx: 0,
        vy: 0,
        rot: Math.random() * 360,
        mass: 0.6 + Math.random() * 0.8,
      };
    });
  }

  // each star sits on a spring at its home spot; tilt pushes it, damping settles it
  function stepStars(stars, force, dt) {
    const W = innerWidth;
    const H = innerHeight;
    const SPRING = 4;
    const TILT = 1400;
    const damp = Math.exp(-2.2 * dt);

    for (const s of stars) {
      const ax = (force.x * TILT) / s.mass + (s.hx * W - s.x) * SPRING;
      const ay = (force.y * TILT) / s.mass + (s.hy * H - s.y) * SPRING;
      s.vx = (s.vx + ax * dt) * damp;
      s.vy = (s.vy + ay * dt) * damp;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      const r = s.size / 2;
      if (s.x < r) { s.x = r; s.vx = Math.abs(s.vx) * 0.5; }
      if (s.x > W - r) { s.x = W - r; s.vx = -Math.abs(s.vx) * 0.5; }
      if (s.y < r) { s.y = r; s.vy = Math.abs(s.vy) * 0.5; }
      if (s.y > H - r) { s.y = H - r; s.vy = -Math.abs(s.vy) * 0.5; }

      s.rot += s.vx * dt * 0.8;
      s.node.style.transform = `translate3d(${s.x - r}px, ${s.y - r}px, 0) rotate(${s.rot}deg)`;
    }
  }

  // from = a point to burst away from; null = random scatter (shake)
  function kick(stars, from, power) {
    for (const s of stars) {
      if (from) {
        const dx = s.x - from.x;
        const dy = s.y - from.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 260) continue;
        const f = (1 - d / 260) * power;
        s.vx += (dx / d) * f;
        s.vy += (dy / d) * f;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const f = power * (0.5 + Math.random());
        s.vx += Math.cos(angle) * f;
        s.vy += Math.sin(angle) * f;
      }
    }
  }

  function initMobile() {
    root.classList.add('fx-mobile');
    const prompt = document.querySelector('.boot-prompt');
    if (prompt) prompt.textContent = 'TAP ANYWHERE TO ENTER';

    const layer = makeLayer('fx-gravity');
    const stars = reducedMotion ? [] : createStars(layer, innerWidth < 500 ? 18 : 24);

    const gravity = { x: 0, y: 0 };
    let base = null;
    let lastReading = -Infinity;
    let lastShake = 0;

    function onOrientation(e) {
      if (e.beta == null || e.gamma == null) return;
      const b = (e.beta * Math.PI) / 180;
      const g = (e.gamma * Math.PI) / 180;
      // gravity projected onto the screen plane in portrait coords...
      const px = Math.sin(g) * Math.cos(b);
      const py = Math.sin(b);
      // ...then rotated into the current screen orientation (landscape etc.)
      const angle = ((screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI) / 180;
      gravity.x = px * Math.cos(angle) + py * Math.sin(angle);
      gravity.y = -px * Math.sin(angle) + py * Math.cos(angle);
      if (!base) base = { ...gravity };
      lastReading = performance.now();
      root.classList.add('sensor-active');
    }

    function onMotion(e) {
      const a = e.acceleration;
      if (!a || a.x == null) return;
      const now = performance.now();
      if (Math.hypot(a.x, a.y, a.z) > 14 && now - lastShake > 400) {
        lastShake = now;
        kick(stars, null, 700);
      }
    }

    // listeners stay silent until the browser grants access, so register them up front
    addEventListener('deviceorientation', onOrientation);
    addEventListener('devicemotion', onMotion);

    // iOS (and some newer browsers) only grant motion access from inside a tap —
    // the boot screen tap is that gesture
    if (typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function') {
      document.getElementById('boot-screen')?.addEventListener('click', () => {
        DeviceOrientationEvent.requestPermission().catch(() => {});
      }, { once: true });
    }

    addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (!t) return;
      kick(stars, { x: t.clientX, y: t.clientY }, 650);
      stir.t = 0;
      trackStir(t.clientX, t.clientY, e.timeStamp);
    }, { passive: true });

    addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (t) trackStir(t.clientX, t.clientY, e.timeStamp);
    }, { passive: true });

    const force = { x: 0, y: 0 };

    return (dt, now) => {
      if (now - lastReading < 1500) {
        // tilt is measured against how the phone is being held; the baseline re-centres slowly
        base.x = lerp(base.x, gravity.x, ease(0.25, dt));
        base.y = lerp(base.y, gravity.y, ease(0.25, dt));
        force.x = gravity.x - base.x;
        force.y = gravity.y - base.y;
        target.x = clamp(force.x * 2.5, -1, 1);
        target.y = clamp(force.y * 2.5, -1, 1);
      } else {
        // no sensor data (denied, unsupported): slow ambient sway so the page isn't static
        const t = now / 1000;
        target.x = Math.sin(t * 0.5) * 0.3;
        target.y = Math.cos(t * 0.37) * 0.25;
        force.x = target.x * 0.15;
        force.y = target.y * 0.15;
      }
      // like the fireflies, the stars stay off the project detail view so the artwork reads cleanly
      if (screenName !== 'detail') stepStars(stars, force, dt);

      if (reducedMotion) return;
      const hx = `${(50 + current.x * 45).toFixed(1)}%`;
      const hy = `${(50 + current.y * 45).toFixed(1)}%`;
      setVar('--mx', hx);
      setVar('--my', hy);
      setVar('--sx', hx);
      setVar('--sy', hy);
      setVar('--rx', `${(-current.x * 10).toFixed(2)}deg`);
      setVar('--ry', `${(-current.y * 10).toFixed(2)}deg`);
    };
  }

  /* ---------------- FIREFLIES: glowing shapes that wander, blink and drift on a breeze ---------------- */

  // the five shapes from the Pucker & Bloat reference, traced at unit radius around (0, 0)
  const FIREFLY_SHAPES = {
    orb(g) {
      g.arc(0, 0, 0.62, 0, Math.PI * 2);
    },
    // pucker -80%: four sharp tips joined by concave curves
    star(g) {
      g.moveTo(0, -1);
      g.quadraticCurveTo(0.14, -0.14, 1, 0);
      g.quadraticCurveTo(0.14, 0.14, 0, 1);
      g.quadraticCurveTo(-0.14, 0.14, -1, 0);
      g.quadraticCurveTo(-0.14, -0.14, 0, -1);
    },
    // pucker -150%: needle-thin rays
    needle(g) {
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i - Math.PI / 2;
        const r = i % 2 ? 0.12 : 1;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    },
    // bloat +50%: four round lobes in an X
    petals(g) {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (Math.PI / 2) * i;
        const cx = Math.cos(a) * 0.48;
        const cy = Math.sin(a) * 0.48;
        g.moveTo(cx + Math.cos(a) * 0.5, cy + Math.sin(a) * 0.5);
        g.ellipse(cx, cy, 0.5, 0.3, a, 0, Math.PI * 2);
      }
    },
    // bloat +180%: long diagonal spikes over a short eight-point body
    burst(g) {
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI / 8) * i - Math.PI / 2;
        const r = i % 2 ? 0.16 : i % 4 === 2 ? 1 : 0.5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    },
  };
  const SHAPE_POOL = ['orb', 'star', 'star', 'needle', 'petals', 'burst'];

  // pre-rendered glow: soft halo + the shape lit from inside. shape = null gives a plain bokeh orb
  function makeFireflySprite(shape, look) {
    const size = 128;
    const mid = size / 2;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');

    const halo = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
    halo.addColorStop(0, `rgba(${look.halo}, 0.38)`);
    halo.addColorStop(0.4, `rgba(${look.halo}, 0.12)`);
    halo.addColorStop(1, `rgba(${look.halo}, 0)`);
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);

    if (shape) {
      g.translate(mid, mid);
      g.scale(size * 0.22, size * 0.22);
      g.beginPath();
      FIREFLY_SHAPES[shape](g);
      g.closePath();
      g.shadowColor = `rgba(${look.halo}, 0.95)`;
      g.shadowBlur = 16; // in canvas pixels, so the scale above doesn't shrink the glow
      g.fillStyle = `rgb(${look.core})`;
      g.fill();
    }
    return c;
  }

  function initFireflies() {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-fireflies';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // additive night glow on the dark screens; darker beads that still read on the light boot screen
    const looks = {
      dark: { core: '255, 255, 225', halo: '212, 244, 42', blend: 'lighter' },
      light: { core: '58, 74, 0', halo: '160, 200, 15', blend: 'source-over' },
    };
    for (const look of Object.values(looks)) {
      look.sprites = {};
      for (const shape of Object.keys(FIREFLY_SHAPES)) look.sprites[shape] = makeFireflySprite(shape, look);
      look.bokeh = makeFireflySprite(null, look);
    }

    let W = 0;
    let H = 0;
    const flies = [];

    function spawn(f, anywhere) {
      f.z = Math.random(); // depth: 0 = far away, 1 = right in front of the camera
      f.bokeh = f.z > 0.9; // the nearest few are out of focus
      f.shape = pick(SHAPE_POOL);
      f.size = f.bokeh ? 60 + Math.random() * 40 : 18 + f.z * 24 + Math.random() * 6;
      f.alpha = f.bokeh ? 0.45 + Math.random() * 0.3 : 0.6 + f.z * 0.4;
      f.x = anywhere ? Math.random() * W : -f.size;
      f.y = Math.random() * H;
      f.heading = Math.random() * Math.PI * 2;
      f.speed = (f.bokeh ? 6 : 10) + Math.random() * 18;
      f.turn = 0.6 + Math.random() * 1.2; // how restlessly it changes direction
      f.n1 = Math.random() * 10;
      f.n2 = Math.random() * 10;
      f.bob = 4 + Math.random() * 10;
      f.bobFreq = 0.4 + Math.random() * 0.8;
      f.rot = Math.random() * Math.PI * 2;
      f.spin = (Math.random() - 0.5) * 1.2;
      f.cycle = Math.random(); // position in its blink cycle
      f.period = 1.8 + Math.random() * 2.8;
      f.ox = 0;
      f.oy = 0;
      return f;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || innerWidth;
      H = canvas.clientHeight || innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = clamp(Math.round((W * H) / 36000), 12, 48);
      while (flies.length < count) flies.push(spawn({}, true));
      flies.length = count;
    }
    resize();

    // quick flash, short glow, slow fade, then a long dim rest — like a real firefly's signal
    function brightness(c) {
      let b = 0;
      if (c < 0.12) b = c / 0.12;
      else if (c < 0.3) b = 1;
      else if (c < 0.55) b = 1 - (c - 0.3) / 0.25;
      b = b * b * (3 - 2 * b);
      return 0.1 + 0.9 * b;
    }

    let time = 0;

    return (dt) => {
      // polling the size also catches mobile URL-bar collapses that skip resize events
      if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();

      // no fireflies over the project detail view — keeps the full-bleed artwork clean
      if (screenName === 'detail') {
        ctx.clearRect(0, 0, W, H);
        return;
      }

      time += dt;
      const look = screenName === 'boot' ? looks.light : looks.dark;
      // a gentle breeze carries them left to right; tilting the phone leans the breeze
      const breezeX = 12 + (isTouch ? current.x * 30 : 0);
      const breezeY = isTouch ? current.y * 20 : 0;

      const stirDecay = Math.exp(-8 * dt);
      stir.vx *= stirDecay;
      stir.vy *= stirDecay;
      const stirSpeed = Math.hypot(stir.vx, stir.vy);
      const cursorHere = isDesktop && root.classList.contains('cursor-visible');
      const settle = Math.exp(-1.8 * dt);

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = look.blend;

      for (const f of flies) {
        // heading drifts along two out-of-step sines, so paths curve instead of jittering
        f.heading += (Math.sin(time * 0.7 * f.turn + f.n1)
          + 0.5 * Math.sin(time * 1.9 * f.turn + f.n2)) * f.turn * dt;
        let vx = Math.cos(f.heading) * f.speed + breezeX;
        let vy = Math.sin(f.heading) * f.speed + Math.sin(time * f.bobFreq + f.n1) * f.bob + breezeY;

        f.ox *= settle;
        f.oy *= settle;
        const dx = stir.x - f.x;
        const dy = stir.y - f.y;
        const d = Math.hypot(dx, dy);
        if (stirSpeed > 220 && d < 170) {
          // a fast swipe scatters them
          const k = (1 - d / 170) * dt * 3;
          f.ox = clamp(f.ox + stir.vx * k, -500, 500);
          f.oy = clamp(f.oy + stir.vy * k, -500, 500);
        } else if (cursorHere && d > 30 && d < 240) {
          // a slow cursor draws curious fireflies toward it
          const pull = (1 - d / 240) * 40;
          vx += (dx / d) * pull;
          vy += (dy / d) * pull;
        }

        f.x += (vx + f.ox) * dt;
        f.y += (vy + f.oy) * dt;
        f.rot += f.spin * dt;

        if (f.x > W + f.size) spawn(f, false);
        else if (f.x < -f.size * 2) f.x = W + f.size;
        if (f.y < -f.size) f.y = H + f.size;
        else if (f.y > H + f.size) f.y = -f.size;

        f.cycle += dt / f.period;
        if (f.cycle >= 1) {
          f.cycle -= 1;
          f.period = 1.8 + Math.random() * 2.8;
        }
        const b = brightness(f.cycle);
        const s = f.size * (0.85 + 0.25 * b);

        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.globalAlpha = f.alpha * b;
        ctx.drawImage(f.bokeh ? look.bokeh : look.sprites[f.shape], -s / 2, -s / 2, s, s);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };
  }

  /* ---------------- shared loop ---------------- */

  const desktopStep = isDesktop ? initDesktop() : null;
  const mobileStep = isTouch ? initMobile() : null;
  const fireflyStep = hasFireflies ? initFireflies() : null;
  let last = performance.now();

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const name = currentScreen();
    if (name !== screenName) {
      screenName = name;
      root.dataset.screen = name;
    }

    mobileStep?.(dt, now);

    const a = ease(7, dt);
    current.x = lerp(current.x, target.x, a);
    current.y = lerp(current.y, target.y, a);
    if (!reducedMotion) {
      setVar('--px', current.x.toFixed(3));
      setVar('--py', current.y.toFixed(3));
    }

    desktopStep?.(dt);
    fireflyStep?.(dt);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
