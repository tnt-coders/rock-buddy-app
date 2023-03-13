'use strict';

const pressed = [];
const secretCode = 'ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba';
const modal = document.getElementById('modal');
const closeBtn = document.querySelector('.close');

window.addEventListener('keyup', (e) => {
  pressed.push(e.key);
  pressed.splice(-secretCode.length - 1, pressed.length - secretCode.length);
  if (pressed.join('').includes(secretCode)) {
    modal.style.display = 'block';
  }
});

closeBtn.addEventListener('click', () => {
  modal.style.display = 'none';
});