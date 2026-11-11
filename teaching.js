// A labeled, offline example only. It is not the gated live teaching feature.
const mode = document.querySelector('#simulation-mode');
const lesson = document.querySelector('#simulation-lesson');
const note = document.querySelector('#simulation-coach');
function updateMode() {
  note.hidden = mode.value !== 'coach';
  document.querySelector('#simulation-reaction').textContent = mode.value === 'companion' ? 'Let’s follow the trail together.' : '';
}
mode.addEventListener('change', updateMode);
document.querySelector('#simulation-explain').addEventListener('click', () => { lesson.hidden = false; });
document.querySelector('#simulation-dismiss').addEventListener('click', () => { note.hidden = true; });
updateMode();
