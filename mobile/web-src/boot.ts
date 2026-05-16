// Bundle entrypoint. Mirrors public/renderer.js order (login then main),
// then fires the shim lifecycle once every listener is registered.
import './login';
import './main';
import { __pixelBoot } from './electron-shim';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __pixelBoot);
} else {
  __pixelBoot();
}
