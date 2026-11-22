// The log study's way of drawing the log, on top of the game's own (render.js, unchanged).
//
// render.js already marks every line the latest action said `.now` and the rest `.old`, and
// makes a new element for every line it hasn't drawn before, a count going up included. So:
//   - lit: the game lights every `.now` line; the study can light them in inverse, and set
//     how dim older lines are (study.css);
//   - blink: a watcher sees each new element as it goes in, before it is painted, and
//     blinks it in hard frames, off and on, then leaves it lit.
// Settings come from the panel and go on #screen as data attributes and CSS variables.

const COUNT = /^(.*) (×(?:\d+|\?))$/s;

export function createLogLayer(screen, logLines) {
  let settings = null;
  const seen = new WeakSet(); // elements already taken in, so a line moved up isn't new
  let job = null; // the blink under way: { targets, t0, total, timer }
  let listener = () => {};

  // A line's words in spans, so inverse hugs the type and a count can blink alone.
  function split(el) {
    const text = el.textContent;
    const m = COUNT.exec(text);
    const msg = document.createElement('span');
    msg.className = 'lg-msg';
    msg.textContent = m ? m[1] : text;
    el.textContent = '';
    el.append(msg);
    if (!m) return { msg, count: null };
    const count = document.createElement('span');
    count.className = 'lg-count';
    count.textContent = m[2];
    el.append(' ', count);
    return { msg, count };
  }

  // One line's frames from its start: true is on, false is off. The last state stays.
  function frames(s) {
    const out = [];
    const on = () => { for (let i = 0; i < s.on; i++) out.push(true); };
    const off = () => { for (let i = 0; i < s.off; i++) out.push(false); };
    const forever = s.blinks > 8;
    const n = forever ? 1 : s.blinks;
    if (s.starts === 'on') on();
    for (let i = 0; i < n; i++) {
      off();
      on();
    }
    return { list: out, loop: forever ? (s.starts === 'on' ? s.on : 0) : -1 };
  }

  function apply(spans, state) {
    for (const sp of spans) {
      sp.classList.toggle('lg-off', state === false);
    }
  }

  function finish() {
    if (!job) return;
    clearTimeout(job.timer);
    for (const t of job.targets) apply(t.spans, true);
    job = null;
    listener(null);
  }

  // Start blinking the lines that just went in, all together (decision 382).
  function start(els) {
    finish();
    if (!settings || !els.length) return;
    const f = frames(settings);
    const targets = els.map((el) => {
      const parts = el._lg;
      const repeat = parts.count && settings.repeat === 'count';
      return { el, spans: repeat ? [parts.count] : [parts.msg, parts.count].filter(Boolean) };
    });
    if (!f.list.length) return;
    const total = f.loop >= 0 ? Infinity : f.list.length;
    job = { targets, t0: performance.now(), total, f, timer: null };
    tick();
  }

  function stateAt(local, f) {
    if (local < f.list.length) return f.list[local];
    if (f.loop < 0) return true;
    // keeps blinking until the next action: the off-and-on part over and over
    const cycle = f.list.slice(f.loop);
    return cycle[(local - f.list.length) % cycle.length];
  }

  function tick() {
    if (!job) return;
    if (!job.targets.length) return finish();
    const ms = settings.frame;
    const k = Math.floor((performance.now() - job.t0) / ms);
    for (const t of job.targets) apply(t.spans, stateAt(k, job.f));
    listener({ frame: Math.min(k + 1, job.total), total: job.total, lines: job.targets.length });
    if (k + 1 >= job.total) {
      job = null;
      listener(null);
      return;
    }
    job.timer = setTimeout(tick, Math.max(0, job.t0 + (k + 1) * ms - performance.now()));
  }

  // Elements going in are new lines (or a line whose count went up). Microtask timing:
  // after render.js has drawn, before the browser paints, so nothing shows unblinked.
  const watcher = new MutationObserver((records) => {
    const fresh = [];
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1 || seen.has(node) || !node.isConnected) continue;
        seen.add(node);
        node._lg = split(node);
        if (node.classList.contains('now')) fresh.push(node);
      }
    }
    // a line that dropped out of the latest action stops blinking, and is left on
    if (job) {
      job.targets = job.targets.filter((t) => {
        const still = t.el.isConnected && t.el.classList.contains('now');
        if (!still) apply(t.spans, true);
        return still;
      });
      if (!job.targets.length) finish();
    }
    if (fresh.length) start(fresh);
  });
  watcher.observe(logLines, { childList: true });

  return {
    set(next) {
      settings = { ...next };
      screen.dataset.lgLit = settings.lit;
      screen.dataset.lgOff = settings.offIs;
      screen.style.setProperty('--lg-old', `${settings.older}%`);
    },
    // Blink the latest action's lines again, as if they had just come.
    replay() {
      start([...logLines.querySelectorAll(':scope > .line.now')]);
    },
    onBlink(fn) {
      listener = fn;
    },
  };
}
