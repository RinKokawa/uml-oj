import type { Page } from '@playwright/test'

const fixture = `<!doctype html><html><body>
<textarea aria-label="画布 XML" id="xml"></textarea><input aria-label="未提交的画布文字" id="pending" />
<button id="autosave">画布修改</button><button id="fail">快照失败</button>
<script>
let fail = false; window.setSnapshotFailure = value => { fail = value }; const send = value => parent.postMessage(JSON.stringify(value), '*');
addEventListener('message', event => {
  let m; try { m = JSON.parse(event.data) } catch { return }
  if (m.action === 'load') { document.querySelector('#xml').value = m.xml; send({event:'load'}) }
  if (m.action === 'resetEditor' && document.querySelector('#pending').value) {
    document.querySelector('#xml').value = document.querySelector('#xml').value.replace('value="Student"', 'value="' + document.querySelector('#pending').value + '"');
    document.querySelector('#pending').value = '';
  }
  if (m.action === 'export') setTimeout(() => send({event:'export',format:'xml',xml:fail ? '' : document.querySelector('#xml').value,message:m}), 30)
});
document.querySelector('#autosave').onclick = () => send({event:'autosave',xml:document.querySelector('#xml').value});
document.querySelector('#fail').onclick = () => { fail = true }; send({event:'init'});
</script></body></html>`


export async function installDrawio(page: Page) {
  await page.context().route('https://embed.diagrams.net/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture }))
}
