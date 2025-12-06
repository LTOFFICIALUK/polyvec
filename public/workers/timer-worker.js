// Timer worker that runs without background throttling
// This worker sends tick messages at a consistent interval even when the tab is in the background

let timerId = null;
let interval = 1000; // Default 1 second

self.onmessage = function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'START':
      if (payload?.interval) {
        interval = payload.interval;
      }
      // Clear any existing timer
      if (timerId) {
        clearInterval(timerId);
      }
      // Start the timer
      timerId = setInterval(() => {
        self.postMessage({ type: 'TICK', timestamp: Date.now() });
      }, interval);
      // Send initial tick immediately
      self.postMessage({ type: 'TICK', timestamp: Date.now() });
      break;

    case 'STOP':
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      break;

    case 'SET_INTERVAL':
      interval = payload?.interval || 1000;
      // If already running, restart with new interval
      if (timerId) {
        clearInterval(timerId);
        timerId = setInterval(() => {
          self.postMessage({ type: 'TICK', timestamp: Date.now() });
        }, interval);
      }
      break;

    default:
      break;
  }
};
