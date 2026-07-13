import { app, MenuItem } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { getCapacitorElectronConfig, setupElectronDeepLinking } from '@capacitor-community/electron';
import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import { spawn, exec } from 'child_process';
import { join, dirname } from 'path';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';

import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';

// Graceful handling of unhandled errors.
unhandled();

// Global variable to hold the backend child process
let backendProcess: any = null;

// Function to safely stop the backend process
function killBackend() {
  if (backendProcess) {
    console.log('Shutting down backend process (PID:', backendProcess.pid, ')...');
    if (process.platform === 'win32') {
      // Forcefully terminate the process tree on Windows
      exec(`taskkill /pid ${backendProcess.pid} /T /F`, (err) => {
        if (err) {
          console.error('Failed to taskkill backend:', err);
        } else {
          console.log('Backend killed successfully.');
        }
      });
    } else {
      backendProcess.kill();
    }
    backendProcess = null;
  }
}

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [new MenuItem({ label: 'Quit App', role: 'quit' })];
const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
  { role: 'viewMenu' },
];

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig, trayMenuTemplate, appMenuBarMenuTemplate);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol: capacitorFileConfig.electron.deepLinkingCustomProtocol ?? 'mycapacitorapp',
  });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

(async () => {
  await app.whenReady();

  try {
    let backendExe: string;
    if (electronIsDev) {
      // In development (resolves relative to the running build directory)
      backendExe = join(__dirname, '..', '..', 'backend', 'AccessToPostgres.exe');
    } else {
      // In production, looks inside the extraResources directory
      backendExe = join(process.resourcesPath, 'backend', 'AccessToPostgres.exe');
    }

    const backendDir = dirname(backendExe);
    console.log('Starting backend:', backendExe);

    // Spawn process with working directory context so backend configuration files load properly
    backendProcess = spawn(backendExe, [], {
      cwd: backendDir,
      detached: false,
      shell: false
    });

    backendProcess.on('spawn', () => {
      console.log('Backend started with PID:', backendProcess.pid);
    });

    backendProcess.on('error', (err: any) => {
      console.error('Backend failed to start:', err);
    });

    backendProcess.on('exit', (code: any) => {
      console.log('Backend exited with code:', code);
    });

  } catch (err) {
    console.error('Error starting backend:', err);
  }

  await new Promise(r => setTimeout(r, 3000));

  setupContentSecurityPolicy(
    myCapacitorApp.getCustomURLScheme()
  );

  await myCapacitorApp.init();
})();

// Handle when all of our windows are closed
app.on('window-all-closed', function () {
  killBackend();
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Extra event hooks to capture quit signals
app.on('before-quit', killBackend);
app.on('will-quit', killBackend);

// When the dock icon is clicked.
app.on('activate', async function () {
  // Safe handling of potentially null window reference
  const mainWindow = myCapacitorApp.getMainWindow();
  if (mainWindow && mainWindow.isDestroyed()) {
    await myCapacitorApp.init();
  }
});