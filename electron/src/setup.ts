import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import {
  CapElectronEventEmitter,
  CapacitorSplashScreen,
  setupCapacitorElectronPlugins,
} from '@capacitor-community/electron';
import chokidar from 'chokidar';
import type { MenuItemConstructorOptions } from 'electron';
import { app, BrowserWindow, Menu, MenuItem, nativeImage, Tray, session } from 'electron';
import electronIsDev from 'electron-is-dev';
import electronServe from 'electron-serve';
import windowStateKeeper from 'electron-window-state';
import { join } from 'path';

// Define components for a watcher to detect when the webapp is changed so we can reload in Dev mode.
const reloadWatcher: {
  debouncer: any;
  ready: boolean;
  watcher: any;
} = {
  debouncer: null,
  ready: false,
  watcher: null,
};

export function setupReloadWatcher(electronCapacitorApp: ElectronCapacitorApp): void {
  reloadWatcher.watcher = chokidar
    .watch(join(app.getAppPath(), 'app'), {
      ignored: /[/\\]\./,
      persistent: true,
    })
    .on('ready', () => {
      reloadWatcher.ready = true;
    })
    .on('all', (_event, _path) => {
      if (reloadWatcher.ready) {
        if (reloadWatcher.debouncer) {
          clearTimeout(reloadWatcher.debouncer);
        }
        reloadWatcher.debouncer = setTimeout(async () => {
          electronCapacitorApp.getMainWindow()?.webContents.reload();
          reloadWatcher.ready = false;
          if (reloadWatcher.debouncer) {
            clearTimeout(reloadWatcher.debouncer);
          }
          reloadWatcher.debouncer = null;
          reloadWatcher.watcher = null;
          setupReloadWatcher(electronCapacitorApp);
        }, 1500);
      }
    });
}

// Define our class to manage our app.
export class ElectronCapacitorApp {
  private MainWindow: BrowserWindow | null = null;
  private SplashScreen: CapacitorSplashScreen | null = null;
  private TrayIcon: Tray | null = null;
  private CapacitorFileConfig: CapacitorElectronConfig;
  private TrayMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    new MenuItem({ label: 'Quit App', role: 'quit' }),
  ];
  private AppMenuBarMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
    { role: 'viewMenu' },
  ];
  private mainWindowState: any;
  private loadWebApp: any;
  private customScheme: string;

  constructor(
    capacitorFileConfig: CapacitorElectronConfig,
    trayMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[],
    appMenuBarMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[]
  ) {
    this.CapacitorFileConfig = capacitorFileConfig;

    this.customScheme = this.CapacitorFileConfig.electron?.customUrlScheme ?? 'capacitor-electron';

    if (trayMenuTemplate) {
      this.TrayMenuTemplate = trayMenuTemplate;
    }

    if (appMenuBarMenuTemplate) {
      this.AppMenuBarMenuTemplate = appMenuBarMenuTemplate;
    }

    // Setup our web app loader, this lets us load apps like react, vue, and angular without changing their build chains.
    this.loadWebApp = electronServe({
      directory: join(app.getAppPath(), 'app'),
      scheme: this.customScheme,
    });
  }

  // Helper function to load in the app.
  private async loadMainWindow(thisRef: any) {
    await thisRef.loadWebApp(thisRef.MainWindow);
  }

  // Expose the mainWindow ref for use outside of the class.
  getMainWindow(): BrowserWindow | null {
    return this.MainWindow;
  }

  getCustomURLScheme(): string {
    return this.customScheme;
  }

  async init(): Promise<void> {
    const icon = nativeImage.createFromPath(
      join(app.getAppPath(), 'assets', process.platform === 'win32' ? 'appIcon.ico' : 'appIcon.png')
    );
    this.mainWindowState = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 800,
    });
    // Setup preload script path and construct our main window.
    const preloadPath = join(app.getAppPath(), 'build', 'src', 'preload.js');
    this.MainWindow = new BrowserWindow({
      icon,
      show: false,
      x: this.mainWindowState.x,
      y: this.mainWindowState.y,
      width: this.mainWindowState.width,
      height: this.mainWindowState.height,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: preloadPath,
      },
    });
    this.mainWindowState.manage(this.MainWindow);

    // Explicitly check properties to completely bypass the compiler null-warnings
    if (this.MainWindow && this.CapacitorFileConfig.electron && typeof this.CapacitorFileConfig.electron.backgroundColor === 'string') {
      this.MainWindow.setBackgroundColor(this.CapacitorFileConfig.electron.backgroundColor);
    }

    // If we close the main window with the splashscreen enabled we need to destroy the ref.
    this.MainWindow?.on('closed', () => {
      const splashWin = this.SplashScreen?.getSplashWindow();
      if (splashWin && !splashWin.isDestroyed()) {
        splashWin.close();
      }
    });

    // When the tray icon is enabled, setup the options.
    if (this.CapacitorFileConfig.electron?.trayIconAndMenuEnabled) {
      this.TrayIcon = new Tray(icon);
      this.TrayIcon?.on('double-click', () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon?.on('click', () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon?.setToolTip(app.getName());
      this.TrayIcon?.setContextMenu(Menu.buildFromTemplate(this.TrayMenuTemplate));
    }

    // Setup the main manu bar at the top of our window.
    Menu.setApplicationMenu(Menu.buildFromTemplate(this.AppMenuBarMenuTemplate));

    // If the splashscreen is enabled, show it first while the main window loads then switch it out for the main window, or just load the main window from the start.
    const config = this.CapacitorFileConfig;
    if (config.electron?.splashScreenEnabled) {
      let splashScreenImageName: string = 'splash.png';
      if (config.electron && typeof config.electron.splashScreenImageName === 'string') {
        splashScreenImageName = config.electron.splashScreenImageName;
      }

      this.SplashScreen = new CapacitorSplashScreen({
        imageFilePath: join(
          app.getAppPath(),
          'assets',
          splashScreenImageName
        ),
        windowWidth: 400,
        windowHeight: 400,
      });
      this.SplashScreen.init(this.loadMainWindow, this);
    } else {
      this.loadMainWindow(this);
    }

    // Security
    this.MainWindow?.webContents.setWindowOpenHandler((details) => {
      if (!details.url.includes(this.customScheme)) {
        return { action: 'deny' };
      } else {
        return { action: 'allow' };
      }
    });
    this.MainWindow?.webContents.on('will-navigate', (event, _newURL) => {
      if (this.MainWindow && !this.MainWindow.webContents.getURL().includes(this.customScheme)) {
        event.preventDefault();
      }
    });

    // Link electron plugins into the system.
    setupCapacitorElectronPlugins();

    // When the web app is loaded we hide the splashscreen if needed and show the mainwindow.
    this.MainWindow?.webContents.on('dom-ready', () => {
      const splashWin = this.SplashScreen?.getSplashWindow();
      if (this.CapacitorFileConfig.electron?.splashScreenEnabled && splashWin) {
        splashWin.hide();
      }
      if (!this.CapacitorFileConfig.electron?.hideMainWindowOnLaunch && this.MainWindow) {
        this.MainWindow.show();
      }
      setTimeout(() => {
        if (electronIsDev && this.MainWindow) {
          this.MainWindow.webContents.openDevTools();
        }
        CapElectronEventEmitter.emit('CAPELECTRON_DeeplinkListenerInitialized', '');
      }, 400);
    });
  }
}

// Set a CSP up for our application based on the custom scheme
export function setupContentSecurityPolicy(customScheme: string): void {
  // 1. Intercept relative /api requests and route them dynamically
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: [`${customScheme}://*/api/*`] },
    (details, callback) => {
      let redirectURL = details.url;

      if (details.url.includes('/api/access/')) {
        // Local database operations go to your local C# background service
        redirectURL = details.url.replace(`${customScheme}://-/`, 'https://localhost:7267/');
      } else {
        // Cloud operations (like login, master upload) go to your remote server on port 2002
        redirectURL = details.url.replace(`${customScheme}://-/`, 'http://103.102.144.180:2002/');
      }

      console.log(`[Proxy] Redirecting: ${details.url} -> ${redirectURL}`);
      callback({ redirectURL });
    }
  );

  // 2. Set up CSP headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          [
            `default-src ${customScheme}://* 'unsafe-inline' 'unsafe-eval' data: blob:`,
            "connect-src * http: https: ws: wss:",
            "img-src * data: blob:",
            "style-src * 'unsafe-inline'",
            "font-src * data:"
          ].join("; ")
        ]
      }
    });
  });
}