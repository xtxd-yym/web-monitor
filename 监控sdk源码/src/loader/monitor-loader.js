(function attachWebMonitorLoader(global) {
  'use strict';

  var pendingLoads = {};

  function resolveUrl(value, baseUrl) {
    return new URL(value, baseUrl || global.location.href).href;
  }

  function getLoadedSdk(expectedVersion) {
    var DynamicWebMonitor = global.DynamicWebMonitor;
    if (!DynamicWebMonitor) {
      return null;
    }

    var actualVersion = DynamicWebMonitor.version || 'unknown';
    if (expectedVersion && actualVersion !== expectedVersion) {
      throw new Error(
        '[MonitorLoader] 页面已加载 SDK ' + actualVersion + '，不能再加载 ' + expectedVersion
      );
    }

    return {
      WebMonitor: global.WebMonitor,
      DynamicWebMonitor: DynamicWebMonitor,
      version: actualVersion
    };
  }

  function fetchManifest(manifestUrl) {
    if (typeof global.fetch !== 'function') {
      return Promise.reject(new Error('[MonitorLoader] 当前浏览器不支持 fetch'));
    }

    return global.fetch(manifestUrl, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit'
    }).then(function parseManifest(response) {
      if (!response.ok) {
        throw new Error('[MonitorLoader] Manifest 请求失败: HTTP ' + response.status);
      }
      return response.json();
    }).then(function validateManifest(manifest) {
      if (!manifest || typeof manifest.version !== 'string' || typeof manifest.sdkUrl !== 'string') {
        throw new Error('[MonitorLoader] Manifest 缺少 version 或 sdkUrl');
      }
      return manifest;
    });
  }

  function loadScript(sdkUrl, expectedVersion, timeoutMs) {
    var loadedSdk = getLoadedSdk(expectedVersion);
    if (loadedSdk) {
      return Promise.resolve(loadedSdk);
    }

    if (pendingLoads[sdkUrl]) {
      return pendingLoads[sdkUrl];
    }

    pendingLoads[sdkUrl] = new Promise(function createScript(resolve, reject) {
      var script = document.createElement('script');
      var timeoutId = global.setTimeout(function onTimeout() {
        script.remove();
        delete pendingLoads[sdkUrl];
        reject(new Error('[MonitorLoader] SDK 加载超时: ' + sdkUrl));
      }, timeoutMs);

      script.src = sdkUrl;
      script.async = true;
      script.dataset.webMonitorSdk = expectedVersion || 'unknown';
      script.onload = function onLoad() {
        global.clearTimeout(timeoutId);
        try {
          resolve(getLoadedSdk(expectedVersion));
        } catch (error) {
          delete pendingLoads[sdkUrl];
          reject(error);
        }
      };
      script.onerror = function onError() {
        global.clearTimeout(timeoutId);
        script.remove();
        delete pendingLoads[sdkUrl];
        reject(new Error('[MonitorLoader] SDK 加载失败: ' + sdkUrl));
      };

      document.head.appendChild(script);
    });

    return pendingLoads[sdkUrl];
  }

  function load(options) {
    var settings = options || {};
    var timeoutMs = Number.isFinite(settings.timeoutMs) && settings.timeoutMs > 0
      ? settings.timeoutMs
      : 8000;

    if (settings.sdkUrl) {
      var directUrl = resolveUrl(settings.sdkUrl);
      return loadScript(directUrl, settings.version, timeoutMs);
    }

    if (!settings.manifestUrl) {
      return Promise.reject(new Error('[MonitorLoader] 必须提供 manifestUrl 或 sdkUrl'));
    }

    var manifestUrl = resolveUrl(settings.manifestUrl);
    return fetchManifest(manifestUrl).then(function loadManifestSdk(manifest) {
      var sdkUrl = resolveUrl(manifest.sdkUrl, manifestUrl);
      return loadScript(sdkUrl, manifest.version, timeoutMs);
    });
  }

  global.WebMonitorLoader = Object.freeze({ load: load });
})(window);
