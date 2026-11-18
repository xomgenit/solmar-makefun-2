// Keyboard + mouse state for SOLMAR. Tracks held keys, edge-triggered
// "just pressed" keys (cleared once per frame by the game loop), and the
// mouse position/buttons in canvas coordinates.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(), // codes pressed since the last endFrame()
    mouse: { x: 640, y: 360, down: false, clicked: false },
    anyKey: false,

    down(code) { return this.keys.has(code); },
    justPressed(code) { return this.pressed.has(code); },

    // Movement vector from WASD/arrows, normalised.
    moveVector() {
      let x = 0, y = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },

    endFrame() {
      this.pressed.clear();
      this.mouse.clicked = false;
    },

    attach() {
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
        if (!e.repeat) this.pressed.add(e.code);
        this.keys.add(e.code);
        this.anyKey = true;
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
        this.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
      });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.down = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },
  };
  return input;
}
