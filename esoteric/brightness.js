import { TEXT } from '../src/text.js';

// The sliders of the settings: text brightness, and the size of all the text ("there should
// be an option to make ALL the text smaller, this should be in the options menu", November
// 23). Each is kept between visits. Smaller text is set in a thinner cut of Crooked Hand ("the
// text should also get skinnier as you shrink it, otherwise it could be hard to read").
const template = document.getElementById('brightness-control');
const screen = document.getElementById('screen');

// The cut for a size, in percent: the regular one down to 93%, then thinner a step at a time
// (esoteric/font/make_thin.py: strokes 13, 11 and 9 fifteenths of the regular).
const weightFor = (size) => (size >= 93 ? 400 : size >= 80 ? 300 : size >= 67 ? 200 : 100);

const SLIDERS = [
  {
    key: 'likelike.esoteric.textBrightness',
    label: TEXT.menu.textBrightness,
    min: 40,
    apply: (level) => screen.style.setProperty('--text-brightness', level + '%'),
  },
  {
    key: 'likelike.esoteric.textSize',
    label: TEXT.menu.textSize,
    min: 60,
    apply: (level) => {
      screen.style.setProperty('--text-scale', String(level / 100));
      screen.style.setProperty('--text-weight', String(weightFor(level)));
    },
  },
];

// Both system menus share one preference: the menu over the controls (the studies' pages) and
// the options page. The slider keeps its native pointer, keyboard and screen-reader behavior
// while the game's Escape key still closes it.
const places = ['options', 'event-links'].filter((id) => document.getElementById(id));

for (const slider of SLIDERS) {
  const controls = places.map((id) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const input = row.querySelector('input');
    input.min = String(slider.min);
    row.querySelector('.brightness-label').textContent = slider.label;
    row.addEventListener('pointerdown', (event) => event.stopPropagation());
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' && event.key !== 'Backspace') event.stopPropagation();
    });
    input.addEventListener('input', () => {
      set(input.value);
      try {
        localStorage.setItem(slider.key, input.value);
      } catch {
        // The setting still works for this session when storage is unavailable.
      }
    });
    document.getElementById(id).before(row);
    return { input, value: row.querySelector('.brightness-value') };
  });

  function set(level) {
    const percent = level + '%';
    slider.apply(level);
    for (const { input, value } of controls) {
      input.value = level;
      input.setAttribute('aria-valuetext', percent);
      value.textContent = percent;
    }
  }

  let level = 100;
  try {
    const saved = Number(localStorage.getItem(slider.key));
    if (Number.isInteger(saved) && saved >= slider.min && saved <= 100) level = saved;
  } catch {
    // Start at 100%.
  }
  set(level);
}
