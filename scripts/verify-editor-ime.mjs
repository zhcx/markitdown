import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// 仅连接显式开启调试端口的本地测试实例，不读取用户配置或文档文件。
const [action = 'verify-csp', value = '', port = '9235'] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find(target => target.type === 'page' && /tauri.localhost|localhost|127\.0\.0\.1/.test(target.url));
if (!target) throw new Error('No local editor test page found');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const entry = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, {
      resolve: result => { clearTimeout(timer); resolve(result); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function rendered() {
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}
async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers, ...(key === 'Enter' ? { text: '\r' } : {}) });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
}
async function assertLines(expected, label) {
  await rendered();
  const state = await evaluate(`(() => {
    const viewport = document.querySelector('.overflow-guard').getBoundingClientRect();
    const lines = [...document.querySelectorAll('.view-line')].map(n => {
      const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
      return {text:n.textContent,top:r.top-viewport.top,height:r.height,styleTop:n.style.top,
        styleHeight:n.style.height,opacity:cs.opacity,visibility:cs.visibility};
    });
    return {lines,text:lines.map(n=>n.text).join('').replace(/\\u00a0/g,' '),
      styleViolations:window.__imeStyleViolations || [], engine:document.querySelector('.native-edit-context')?'editContext':'textarea'};
  })()`);
  assert.equal(state.text, expected, `${label}: previously entered text must remain rendered`);
  let lastBottom = 24;
  for (const line of state.lines) {
    assert.ok(line.height > 0, `${label}: new view-line has zero height`);
    assert.ok(line.styleTop && line.styleHeight, `${label}: inline row geometry was rejected`);
    assert.ok(line.top >= lastBottom - 1, `${label}: row has jumped above the first line or overlaps another row`);
    assert.equal(line.opacity, '1');
    assert.equal(line.visibility, 'visible');
    lastBottom = line.top + line.height;
  }
  assert.deepEqual(state.styleViolations, [], `${label}: no style CSP violations are allowed`);
  console.log(`PASS ${state.engine}: ${label} (${state.lines.length} visible rows)`);
  return state;
}
try {
  if (action === 'verify-input') {
    // 使用新建标签页，只向本脚本创建的测试文档输入；不覆盖原有文档。
    await evaluate(`(() => {
      const button=document.querySelector('button[title="新建标签页"]');
      if(!button) throw new Error('New tab button not found');
      button.click();
    })()`);
    await rendered();
    await evaluate(`(() => {
      const input=document.querySelector('.native-edit-context,textarea.inputarea');
      if(!input) throw new Error('Editor input not found'); input.focus();
      window.__imeStyleViolations=[];
      window.__imeViolationListener=e=>{if(e.effectiveDirective.startsWith('style-src')) window.__imeStyleViolations.push(e.effectiveDirective);};
      document.addEventListener('securitypolicyviolation',window.__imeViolationListener);
    })()`);
    let text = '飞行员技术还是非常';
    await cdp('Input.insertText', { text });
    await assertLines(text, 'committed short line');
    for (const candidate of ['b', 'bu', "bu'cuo", '不错']) {
      await cdp('Input.imeSetComposition', { text: candidate, selectionStart: candidate.length, selectionEnd: candidate.length });
      await assertLines(text + candidate, `short-line composition ${candidate}`);
    }
    await cdp('Input.insertText', { text: '不错' }); text += '不错';
    await assertLines(text, 'composition commit');
    const long = '，中文长段落折行后仍应完整显示'.repeat(5);
    await cdp('Input.insertText', { text: long }); text += long;
    const wrapped = await assertLines(text, 'wrapped committed paragraph');
    assert.ok(wrapped.lines.length > 1, 'Fixture must wrap to multiple rows');
    for (const candidate of ['j', 'ji', 'jiandan', '简单']) {
      await cdp('Input.imeSetComposition', { text: candidate, selectionStart: candidate.length, selectionEnd: candidate.length });
      await assertLines(text + candidate, `wrapped composition ${candidate}`);
    }
    if (value) {
      const {data}=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(value,Buffer.from(data,'base64'));
    }
    await cdp('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await assertLines(text, 'composition cancel');
    await key('Home', 'Home', 36, 2);
    await cdp('Input.imeSetComposition', { text: '开头', selectionStart: 2, selectionEnd: 2 });
    await assertLines('开头' + text, 'composition at first column');
    await cdp('Input.insertText', { text: '开头' }); text = '开头' + text;
    await key('z', 'KeyZ', 90, 2);
    text = text.slice(2);
    await assertLines(text, 'undo composition');
    await key('End', 'End', 35, 2);
    await key('Backspace', 'Backspace', 8);
    text = text.slice(0, -1);
    await assertLines(text, 'backspace');
    await cdp('Input.insertText', { text: 'ABC 123' }); text += 'ABC 123';
    await assertLines(text, 'mixed English and Chinese');
    await key('Enter', 'Enter', 13);
    await cdp('Input.insertText', { text: '第二行中文' });
    await assertLines(text + '第二行中文', 'new paragraph');
    assert.ok(await evaluate("[...document.querySelectorAll('.line-numbers')].some(n=>n.textContent==='2')"), 'Enter must create logical line 2');
    await evaluate('document.removeEventListener("securitypolicyviolation",window.__imeViolationListener);delete window.__imeViolationListener;delete window.__imeStyleViolations');
  } else if (action === 'probe' || action === 'verify-csp') {
    const result = await cdp('Runtime.evaluate', { expression: `(async () => {
      const violations = [];
      const listener = e => violations.push({ directive: e.effectiveDirective, blocked: e.blockedURI, policy: e.originalPolicy });
      document.addEventListener('securitypolicyviolation', listener);
      const host = document.createElement('div');
      host.style.position = 'fixed'; host.style.left = '-10000px';
      document.body.append(host);
      host.innerHTML = '<div style="position:absolute;top:24px;height:22px">IME layout probe</div>';
      const node = host.firstElementChild;
      const before = { attr: node.getAttribute('style'), style: node.style.cssText, top: getComputedStyle(node).top, height: node.getBoundingClientRect().height };
      const sheet = document.createElement('style');
      node.className = 'zeditor-ime-csp-probe';
      sheet.textContent = '.zeditor-ime-csp-probe { color: rgb(1, 2, 3); }';
      document.head.append(sheet);
      const dynamicStyleColor = getComputedStyle(node).color;
      const script = document.createElement('script');
      script.textContent = 'window.__imeUnexpectedInlineScript = true';
      document.head.append(script);
      const inlineScriptBlocked = window.__imeUnexpectedInlineScript !== true;
      script.remove(); delete window.__imeUnexpectedInlineScript;
      node.style.top = '24px'; node.style.height = '22px';
      const after = { style: node.style.cssText, top: getComputedStyle(node).top, height: node.getBoundingClientRect().height };
      await new Promise(resolve => setTimeout(resolve, 100));
      host.remove(); sheet.remove(); document.removeEventListener('securitypolicyviolation', listener);
      return { before, after, dynamicStyleColor, inlineScriptBlocked, violations: violations.map(v=>({ ...v, policy:v.policy.split(';').filter(s=>s.includes('style-src')).join(';') })) };
    })()`, awaitPromise: true, returnByValue: true });
    console.log(JSON.stringify(result.result.value, null, 2));
    if (action === 'verify-csp') {
      const probe = result.result.value;
      assert.equal(probe.before.top, '24px', 'Monaco generated row positioning is blocked by the packaged CSP');
      assert.equal(probe.before.height, 22, 'Monaco generated row height must be applied');
      assert.equal(probe.dynamicStyleColor, 'rgb(1, 2, 3)', 'Monaco runtime styles must be applied');
      assert.equal(probe.inlineScriptBlocked, true, 'Inline scripts must remain blocked');
      assert.equal(probe.violations.filter(v => v.directive.startsWith('style-src')).length, 0);
      console.log('PASS: packaged CSP permits editor styles and still blocks inline scripts');
    }
  } else if (action === 'compose') {
    await cdp('Input.imeSetComposition', { text: value, selectionStart: value.length, selectionEnd: value.length });
  } else if (action === 'commit') {
    await cdp('Input.insertText', { text: value });
  } else if (action === 'eval') {
    const result = await cdp('Runtime.evaluate', { expression: value, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    console.log(JSON.stringify(result.result.value, null, 2));
  } else if (action === 'screenshot') {
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(value, Buffer.from(data, 'base64'));
  } else {
    const result = await cdp('Runtime.evaluate', { expression: `(() => {
      const style = node => {
        const cs = getComputedStyle(node);
        return { html: node.outerHTML.slice(0, 2000), rect: node.getBoundingClientRect().toJSON(),
          color: cs.color, background: cs.backgroundColor, opacity: cs.opacity, visibility: cs.visibility,
          zIndex: cs.zIndex, transform: cs.transform, overflow: cs.overflow, font: cs.font, value: node.value };
      };
      return { active: document.activeElement?.className,
        lines: [...document.querySelectorAll('.view-line')].map(style),
        inputs: [...document.querySelectorAll('.inputarea,.native-edit-context,.ime-text-area')].map(style),
        layers: [...document.querySelectorAll('.lines-content,.view-lines,.view-overlays,.overflow-guard')].map(style) };
    })()`, returnByValue: true });
    console.log(JSON.stringify(result.result.value, null, 2));
  }
} finally {
  socket.close();
}
