const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createLoaderContext(manifest) {
  const appendedScripts = [];
  const window = {
    location: { href: 'https://monitor.example.com/component/index.html' },
    fetch: async () => ({ ok: true, json: async () => manifest }),
    setTimeout,
    clearTimeout
  };
  const document = {
    createElement: () => ({ dataset: {}, remove() {} }),
    head: {
      appendChild(script) {
        appendedScripts.push(script);
        window.DynamicWebMonitor = { version: manifest.version };
        window.WebMonitor = function WebMonitor() {};
        script.onload();
      }
    }
  };
  const context = vm.createContext({ window, document, URL, Promise, Number, Error, Object });
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src/loader/monitor-loader.js'),
    'utf8'
  );
  vm.runInContext(source, context);
  return { window, appendedScripts };
}

test('Loader 根据 manifest 加载版本化 SDK 并返回实际版本', async () => {
  const { window, appendedScripts } = createLoaderContext({
    version: '1.0.1',
    sdkUrl: './1.0.1/monitor.min.js'
  });

  const loaded = await window.WebMonitorLoader.load({
    manifestUrl: 'https://monitor.example.com/monitor-sdk/sdk-manifest.json'
  });

  assert.equal(appendedScripts.length, 1);
  assert.equal(
    appendedScripts[0].src,
    'https://monitor.example.com/monitor-sdk/1.0.1/monitor.min.js'
  );
  assert.equal(loaded.version, '1.0.1');
});

test('Loader 避免重复加载同一 SDK', async () => {
  const { window, appendedScripts } = createLoaderContext({
    version: '1.0.1',
    sdkUrl: './1.0.1/monitor.min.js'
  });

  const options = {
    manifestUrl: 'https://monitor.example.com/monitor-sdk/sdk-manifest.json'
  };
  await window.WebMonitorLoader.load(options);
  await window.WebMonitorLoader.load(options);

  assert.equal(appendedScripts.length, 1);
});
