// Adds WyCut's Android foreground service + Capacitor plugin to the generated android/ project (run after `cap sync`).
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

async function exists(file) { try { await readFile(file); return true; } catch { return false; } }

export async function installBackgroundService({ root, androidDir, appId }) {
  const javaDir = path.join(androidDir, 'app', 'src', 'main', 'java', ...appId.split('.'));
  await mkdir(javaDir, { recursive: true });
  for (const name of ['WyCutForegroundService', 'WyCutBackgroundPlugin']) {
    const template = await readFile(path.join(root, 'scripts', 'native', `${name}.java.tpl`), 'utf8');
    await writeFile(path.join(javaDir, `${name}.java`), template.replaceAll('__PACKAGE__', appId));
  }

  // MainActivity: register the plugin before the bridge starts.
  const mainPath = path.join(javaDir, 'MainActivity.java');
  if (!await exists(mainPath)) throw new Error(`Expected ${mainPath} after "cap add android".`);
  let main = await readFile(mainPath, 'utf8');
  if (!main.includes('registerPlugin(WyCutBackgroundPlugin.class)')) {
    if (/onCreate\s*\(/.test(main)) {
      main = main.replace(/(\n\s*)super\.onCreate\(/, '$1registerPlugin(WyCutBackgroundPlugin.class);$1super.onCreate(');
    } else {
      if (!main.includes('import android.os.Bundle;')) main = main.replace(/(package [^;]+;)/, '$1\n\nimport android.os.Bundle;');
      main = main.replace(/extends BridgeActivity\s*\{\s*\}/, 'extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(WyCutBackgroundPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}');
    }
    if (!main.includes('registerPlugin(WyCutBackgroundPlugin.class)')) throw new Error('Could not register WyCutBackgroundPlugin in MainActivity.java; add registerPlugin(WyCutBackgroundPlugin.class) before super.onCreate manually.');
    await writeFile(mainPath, main);
  }

  // Manifest: permissions + service.
  const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  let manifest = await readFile(manifestPath, 'utf8');
  const permissions = ['android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_DATA_SYNC', 'android.permission.POST_NOTIFICATIONS', 'android.permission.WAKE_LOCK'];
  const missing = permissions.filter(permission => !manifest.includes(`android:name="${permission}"`));
  if (missing.length) manifest = manifest.replace(/<application/, `${missing.map(permission => `<uses-permission android:name="${permission}" />`).join('\n    ')}\n\n    <application`);
  if (!manifest.includes('WyCutForegroundService')) manifest = manifest.replace(/<\/application>/, '    <service android:name=".WyCutForegroundService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>');
  await writeFile(manifestPath, manifest);
  console.log('Android background service installed.');
}
