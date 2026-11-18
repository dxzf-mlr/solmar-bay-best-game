// Keyboard and mouse input for Solmar Bay.
// Tracks held keys by code, accumulates mouse look deltas while the pointer
// is locked, and turns single key presses into one-frame "just pressed" events
// that the game loop consumes (E to enter a car, F to fight, Esc to pause).

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    justPressed: new Set(),
    lookDeltaX: 0,
    lookDeltaY: 0,
    locked: false,
    anyKey: false,
  };

  function onKeyDown(event) {
    if (event.repeat) return;
    input.keys.add(event.code);
    input.justPressed.add(event.code);
    input.anyKey = true;
    // Keep the page from scrolling or tabbing away while we play.
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    input.keys.delete(event.code);
  }

  function onMouseMove(event) {
    if (!input.locked) return;
    input.lookDeltaX += event.movementX;
    input.lookDeltaY += event.movementY;
  }

  function onPointerLockChange() {
    input.locked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);

  // Ask the browser to lock the pointer to the canvas (mouse look).
  // A lock asked for without a user gesture is refused; that is fine,
  // the canvas click below asks again. Never let the refusal throw.
  input.requestLock = function requestPointerLock() {
    if (document.pointerLockElement === canvas) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (err) {
      // No pointer lock in this browser or without a gesture: mouse look
      // simply stays off until the player clicks the canvas.
    }
  };

  input.releaseLock = function releasePointerLock() {
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  // True while the named key is held down.
  input.isDown = function isKeyDown(code) {
    return input.keys.has(code);
  };

  // True only on the frame the key went down; the loop clears these.
  input.wasPressed = function wasKeyPressed(code) {
    return input.justPressed.has(code);
  };

  // Call once per frame, after the game has read the presses.
  input.endFrame = function endInputFrame() {
    input.justPressed.clear();
    input.lookDeltaX = 0;
    input.lookDeltaY = 0;
  };

  return input;
}
