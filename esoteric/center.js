// The room is centred in the page. In Chrome on an Android phone the page sits below the
// status bar and the address bar, so a room centred in the page is below the middle of the
// phone. This finds how far to lift it so it is centred on the whole screen.

// screenH, pageH: the screen's and the page's heights in CSS pixels. bottomInset: the page's
// safe-area inset at the bottom; above 0, the page runs under the navigation bar, so all of
// what is missing is above it. Otherwise a navigation bar of `navBar` is assumed below it.
export function chromeLift({ android, touch, standalone, screenH, pageH, bottomInset, navBar = 48 }) {
  if (!android || !touch || standalone) return 0;
  const missing = screenH - pageH;
  if (!(missing > 0)) return 0;
  const below = bottomInset > 0 ? 0 : Math.min(navBar, missing);
  const above = missing - below;
  // the middle of the screen is (above - below) / 2 above the middle of the page
  return Math.max(0, Math.round((above - below) / 2));
}

function measure() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;height:env(safe-area-inset-bottom, 0px)';
  document.body.appendChild(probe);
  const bottomInset = probe.getBoundingClientRect().height;
  probe.remove();
  const portrait = innerHeight >= innerWidth;
  // Android reports the screen in the current orientation; take the side that matches.
  const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  return chromeLift({
    android: /Android/i.test(navigator.userAgent),
    touch: matchMedia('(pointer: coarse)').matches,
    standalone: matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches,
    screenH,
    pageH: window.visualViewport?.height ?? innerHeight,
    bottomInset,
  });
}

if (typeof document !== 'undefined') {
  const apply = () => document.documentElement.style.setProperty('--chrome-lift', measure() + 'px');
  apply();
  addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
}
