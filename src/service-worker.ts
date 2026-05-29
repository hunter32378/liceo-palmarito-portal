// Import the generated service worker
import { default as serviceWorker } from "./service-worker";

// Register the service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(registration => {
      console.log('Service worker registered with scope:', registration.scope);
    }, (error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}

export default serviceWorker;