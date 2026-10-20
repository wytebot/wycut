/* WyBuild Capacitor bridge. Bundled into the website build only for Capacitor builds. */
import { Camera } from '@capacitor/camera';
import { Clipboard } from '@capacitor/clipboard';
import { Device } from '@capacitor/device';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Preferences } from '@capacitor/preferences';
import { Keyboard } from '@capacitor/keyboard';
import { PushNotifications } from '@capacitor/push-notifications';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { ActionSheet } from '@capacitor/action-sheet';
import { Dialog } from '@capacitor/dialog';

const safe = async (fn) => { try { return await fn(); } catch (e) { return { ok: false, error: String(e?.message || e) }; } };
const native = {
  isNative: () => !!window.Capacitor?.isNativePlatform?.(),
  platform: () => window.Capacitor?.getPlatform?.() || 'web',
  camera: {
    permissions: () => safe(() => Camera.requestPermissions()),
    takePhoto: (options = {}) => safe(() => Camera.getPhoto({ quality: 90, allowEditing: false, resultType: 'uri', source: 'CAMERA', ...options })),
    pickPhoto: (options = {}) => safe(() => Camera.getPhoto({ quality: 90, resultType: 'uri', source: 'PHOTOS', ...options })),
    pickMedia: (options = {}) => safe(() => Camera.pickImages({ limit: 10, quality: 90, ...options })),
  },
  location: {
    permissions: () => safe(() => Geolocation.requestPermissions()),
    current: (options = {}) => safe(() => Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, ...options })),
    watch: (callback, options = {}) => Geolocation.watchPosition(options, callback),
    clearWatch: (id) => safe(() => Geolocation.clearWatch({ id })),
  },
  notifications: {
    permissions: () => safe(() => LocalNotifications.requestPermissions()),
    schedule: (title, body, id = Date.now(), at = new Date(Date.now() + 1000)) => safe(() => LocalNotifications.schedule({ notifications: [{ id: Number(id) || 1, title: String(title), body: String(body || ''), schedule: { at: new Date(at) } }] })),
    cancel: (ids) => safe(() => LocalNotifications.cancel({ notifications: (Array.isArray(ids) ? ids : [ids]).map(id => ({ id: Number(id) })) })),
    list: () => safe(() => LocalNotifications.getPending()),
  },
  push: {
    permissions: () => safe(() => PushNotifications.requestPermissions()),
    register: async () => safe(async () => { const p = await PushNotifications.requestPermissions(); if (p.receive !== 'granted') throw new Error('Notification permission was not granted'); await PushNotifications.register(); return p; }),
    onToken: (callback) => PushNotifications.addListener('registration', callback),
    onNotification: (callback) => PushNotifications.addListener('pushNotificationReceived', callback),
    onAction: (callback) => PushNotifications.addListener('pushNotificationActionPerformed', callback),
  },
  auth: {
    google: (options = {}) => safe(() => FirebaseAuthentication.signInWithGoogle(options)),
    apple: (options = {}) => safe(() => FirebaseAuthentication.signInWithApple(options)),
    signOut: () => safe(() => FirebaseAuthentication.signOut()),
    current: () => safe(() => FirebaseAuthentication.getCurrentUser()),
  },
  biometric: {
    available: () => safe(() => BiometricAuth.checkBiometry()),
    verify: (reason = 'Verify your identity') => safe(() => BiometricAuth.authenticate({ reason })),
  },
  clipboard: { read: () => safe(() => Clipboard.read()), write: (text) => safe(() => Clipboard.write({ string: String(text) })) },
  device: { info: () => safe(() => Device.getInfo()), id: () => safe(() => Device.getId()), battery: () => safe(() => Device.getBatteryInfo()) },
  files: {
    write: (path, data, options = {}) => safe(() => Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true, ...options })),
    read: (path, options = {}) => safe(() => Filesystem.readFile({ path, directory: Directory.Documents, ...options })),
    delete: (path) => safe(() => Filesystem.deleteFile({ path, directory: Directory.Documents })),
    list: (path = '') => safe(() => Filesystem.readdir({ path, directory: Directory.Documents })),
    download: async (url, filename) => safe(async () => { const r = await fetch(url); if (!r.ok) throw new Error(`Download failed (${r.status})`); const blob = await r.blob(); const data = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(',')[1]); fr.onerror = reject; fr.readAsDataURL(blob); }); return Filesystem.writeFile({ path: filename || new URL(url).pathname.split('/').pop() || 'download.bin', data, directory: Directory.Documents, recursive: true }); }),
  },
  haptics: { impact: (style = 'medium') => safe(() => Haptics.impact({ style: ({ light: ImpactStyle.Light, heavy: ImpactStyle.Heavy, medium: ImpactStyle.Medium })[style] || ImpactStyle.Medium })), success: () => safe(() => Haptics.notification({ type: NotificationType.Success })), vibrate: (duration = 300) => safe(() => Haptics.vibrate({ duration })) },
  network: { status: () => safe(() => Network.getStatus()), watch: (callback) => Network.addListener('networkStatusChange', callback) },
  app: {
    info: () => safe(() => App.getInfo()), exit: () => safe(() => App.exitApp()),
    onBack: (callback) => App.addListener('backButton', callback),
    onStateChange: (callback) => App.addListener('appStateChange', callback),
  },
  // Opt-in swipe detector for app-specific navigation. It observes gestures but never prevents
  // native scrolling; callbacks run only for clear horizontal swipes that dominate vertical movement.
  gestures: {
    onSwipe: (callback, options = {}) => {
      const threshold = Math.max(35, Number(options.threshold || 65));
      let start = null;
      const down = (event) => { const t = event.touches?.[0]; if (t) start = { x: t.clientX, y: t.clientY, at: Date.now() }; };
      const up = (event) => {
        const t = event.changedTouches?.[0];
        if (!start || !t) { start = null; return; }
        const dx = t.clientX - start.x, dy = t.clientY - start.y, elapsed = Date.now() - start.at;
        if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.35 && elapsed < 800) {
          try { callback({ direction: dx > 0 ? 'right' : 'left', distance: Math.round(Math.abs(dx)), durationMs: elapsed, startX: start.x, endX: t.clientX }); } catch {}
        }
        start = null;
      };
      document.addEventListener('touchstart', down, { passive: true });
      document.addEventListener('touchend', up, { passive: true });
      return { remove: async () => { document.removeEventListener('touchstart', down); document.removeEventListener('touchend', up); } };
    },
  },
  share: (title, text, url) => safe(() => Share.share({ title, text, url })),
  openBrowser: (url) => safe(() => Browser.open({ url: String(url) })),
  statusBar: { show: () => safe(() => StatusBar.show()), hide: () => safe(() => StatusBar.hide()), dark: () => safe(() => StatusBar.setStyle({ style: Style.Dark })), light: () => safe(() => StatusBar.setStyle({ style: Style.Light })) },
  orientation: { lock: (orientation = 'portrait') => safe(() => ScreenOrientation.lock({ orientation })), unlock: () => safe(() => ScreenOrientation.unlock()) },
  storage: { get: (key) => safe(() => Preferences.get({ key: String(key) })), set: (key, value) => safe(() => Preferences.set({ key: String(key), value: String(value) })), remove: (key) => safe(() => Preferences.remove({ key: String(key) })) },
  keyboard: { hide: () => safe(() => Keyboard.hide()) },
  actionSheet: (title, options = []) => safe(() => ActionSheet.showActions({ title, options: options.map((title, i) => ({ title: String(title), style: 'DEFAULT' })) })),
  alert: (title, message) => safe(() => Dialog.alert({ title: String(title), message: String(message || '') })),
};
window.WyBuildNative = Object.freeze(native);
setTimeout(() => window.dispatchEvent(new CustomEvent('wybuild-native-ready', { detail: { platform: native.platform() } })), 0);
