import { TEXT } from '../src/text.js';

const key = 'likelike.esoteric.textBrightness';
const template = document.getElementById('brightness-control');
const screen = document.getElementById('screen');

// Both system menus share one preference. The slider keeps its native pointer,
// keyboard and screen-reader behavior while the game's Escape key still closes it.
const controls = ['options', 'event-links'].map((id) => {
  const row = template.content.firstElementChild.cloneNode(true);
  const input = row.querySelector('input');
  const label = row.querySelector('.brightness-label');
  const value = row.querySelector('.brightness-value');
  label.textContent = TEXT.menu.textBrightness;
  row.addEventListener('pointerdown', (event) => event.stopPropagation());
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' && event.key !== 'Backspace') event.stopPropagation();
  });
  input.addEventListener('input', () => {
    apply(input.value);
    try {
      localStorage.setItem(key, input.value);
    } catch {
      // The setting still works for this session when storage is unavailable.
    }
  });
  document.getElementById(id).before(row);
  return { input, value };
});

function apply(level) {
  const percent = level + '%';
  screen.style.setProperty('--text-brightness', percent);
  for (const { input, value } of controls) {
    input.value = level;
    input.setAttribute('aria-valuetext', percent);
    value.textContent = percent;
  }
}

const first = controls[0].input;
try {
  const saved = Number(localStorage.getItem(key));
  if (Number.isInteger(saved) && saved >= Number(first.min) && saved <= Number(first.max)) first.value = saved;
} catch {
  // Start at full brightness.
}
apply(first.value);
