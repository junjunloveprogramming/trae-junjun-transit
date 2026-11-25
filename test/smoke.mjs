/**
 * trae-junjun-transit · 本地冒烟测试
 *
 * 覆盖：
 *   1. MCP 握手（initialize / initialize 通知 / ping）
 *   2. tools/list 返回三个工具
 *   3. 启动时自动安装技能与 Stop Hook（保留已有 Hook）
 *   4. junjun_transit_status 能生成模板并读出配置
 *   5. junjun_transit_setup 一键写入通道且不重复装 Hook
 *   6. 未配置通道时 send 返回明确指引且标记失败
 *   7. 未知工具返回 JSON-RPC 错误
 *   8. 纯函数：MeoW URL 编码、密钥脱敏、限流窗口、摘要压缩
 *
 * 运行：node test/smoke.mjs
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const traeHome = mkdtempSync(join(tmpdir(), 'trae-junjun-transit-home-'))
const configFile = join(traeHome, 'trae-junjun-transit', 'config.json')
const hooksFile = join(traeHome, 'hooks.json')
const skillFile = join(traeHome, 'skills', 'trae-junjun-transit', 'SKILL.md')

// 预置一个「别人的」Hook，验证自动配置只追加、不覆盖
writeFileSync(
  hooksFile,
  JSON.stringify({ version: 1, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo other' }] }] } }),
  'utf8',
)

const child = spawn(process.execPath, [join(root, 'server', 'index.mjs')], {
  cwd: root,
  env: { ...process.env, JUNJUN_TRANSIT_CONFIG: configFile, JUNJUN_TRAE_HOME: traeHome },
  stdio: ['pipe', 'pipe', 'pipe'],
})

let buffer = ''
let nextId = 1
const pending = new Map()

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buffer += chunk
  let index = buffer.indexOf('\n')
  while (index >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (line !== '') {
      const message = JSON.parse(line)
      if (message.id !== undefined && pending.has(message.id)) {
        const waiter = pending.get(message.id)
        pending.delete(message.id)
        waiter.resolve(message)
      }
    }
    index = buffer.indexOf('\n')
  }
})

// 服务端日志（stderr）统一丢弃，保持测试输出干净
child.stderr.setEncoding('utf8')
child.stderr.on('data', () => {})

function request(method, params) {
  const id = nextId++
  const payload = { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }
  child.stdin.write(`${JSON.stringify(payload)}\n`)
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve })
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`请求超时：${method}`))
      }
    }, 5_000)
    timer.unref()
  })
}

function notify(method) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`)
}

function step(name) {
  console.log(`✓ ${name}`)
}

async function run() {
  // ── 1. 握手 ────────────────────────────────────────────────────
  const init = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '0' },
  })
  assert.equal(init.result.protocolVersion, '2024-11-05')
  assert.equal(init.result.serverInfo.name, 'trae-junjun-transit')
  assert.ok(init.result.capabilities.tools !== undefined)
  notify('notifications/initialized')
  step('initialize 握手')

  const ping = await request('ping')
  assert.deepEqual(ping.result, {})
  step('ping')

  // ── 2. 工具列表 ────────────────────────────────────────────────
  const list = await request('tools/list')
  const names = list.result.tools.map((tool) => tool.name).sort()
  assert.deepEqual(names, [
    'junjun_transit_open_settings',
    'junjun_transit_send',
    'junjun_transit_setup',
    'junjun_transit_status',
  ])
  const sendTool = list.result.tools.find((tool) => tool.name === 'junjun_transit_send')
  assert.deepEqual(sendTool.inputSchema.required, ['message'])
  step('tools/list 返回四个工具')

  // ── 3. status：生成模板 ────────────────────────────────────────
  const status = await request('tools/call', { name: 'junjun_transit_status', arguments: {} })
  const statusText = status.result.content[0].text
  assert.match(statusText, /配置文件/)
  assert.match(statusText, /MeoW/)
  assert.equal(status.result.isError, undefined)
  assert.ok(existsSync(configFile), '应自动生成配置文件')
  const template = JSON.parse(readFileSync(configFile, 'utf8'))
  assert.equal(template.meow.apiBase, 'https://api.chuckfang.com')
  assert.equal(template.theme.category, 'Trae插件')
  assert.equal(template.options.autoPushTitle, '骏骏消息中转')
  assert.equal('autoPush' in template.options, false, '自动推送不应再有开关字段')
  assert.match(statusText, /宿主 Hook✅ 已安装/)
  step('status 生成并读取配置模板')

  // ── 3.1 启动时自动装技能与 Hook，且不覆盖已有 Hook ────────────
  assert.ok(existsSync(skillFile), '应自动安装技能')
  const mergedHooks = JSON.parse(readFileSync(hooksFile, 'utf8'))
  assert.equal(mergedHooks.hooks.Stop.length, 2, '应在保留已有 Hook 的前提下追加')
  const mergedText = JSON.stringify(mergedHooks)
  assert.match(mergedText, /echo other/)
  assert.match(mergedText, /trae-junjun-transit\/server\/hook\.mjs/)
  assert.ok(existsSync(`${hooksFile}.bak`), '改动前应备份 hooks.json')
  step('自动安装技能与 Stop Hook（保留已有配置）')

  // ── 4. 未配置通道时 send 给出指引 ──────────────────────────────
  const send = await request('tools/call', {
    name: 'junjun_transit_send',
    arguments: { message: '冒烟测试' },
  })
  assert.equal(send.result.isError, true)
  assert.match(send.result.content[0].text, /还没有可用的推送通道/)
  step('未配置通道时 send 返回指引')

  // ── 5. 一键配置 ────────────────────────────────────────────────
  const emptySetup = await request('tools/call', { name: 'junjun_transit_setup', arguments: {} })
  assert.equal(emptySetup.result.isError, true)

  const setup = await request('tools/call', {
    name: 'junjun_transit_setup',
    arguments: { meowNickname: 'tester' },
  })
  assert.equal(setup.result.isError, undefined)
  const setupText = setup.result.content[0].text
  assert.match(setupText, /MeoW：✅ 已配置/)
  assert.match(setupText, /自动推送已强制开启/)

  const saved = JSON.parse(readFileSync(configFile, 'utf8'))
  assert.equal(saved.meow.nickname, 'tester')
  assert.equal(JSON.parse(readFileSync(hooksFile, 'utf8')).hooks.Stop.length, 2, '不应重复追加 Hook')

  const statusAgain = await request('tools/call', { name: 'junjun_transit_status', arguments: {} })
  assert.match(statusAgain.result.content[0].text, /可用通道：1 个（meow）/)
  step('setup 一键写入配置且不重复装 Hook')

  // ── 6. 未知工具 ────────────────────────────────────────────────
  const unknown = await request('tools/call', { name: 'not_exists', arguments: {} })
  assert.ok(unknown.error !== undefined)
  assert.equal(unknown.error.code, -32602)
  step('未知工具返回 JSON-RPC 错误')

  // ── 7. 纯函数 ──────────────────────────────────────────────────
  const { buildMeowPostUrl } = await import('../server/meow.mjs')
  const meowUrl = buildMeowPostUrl(
    { nickname: '骏骏/测试', title: '72 通过 / 0 失败', message: '正文含 / 与 #' },
    'https://api.chuckfang.com',
  )
  assert.ok(!meowUrl.includes('%2F'), '路径段不应出现 %2F')
  assert.match(decodeURIComponent(meowUrl), /／/, '斜杠应替换为全角')
  assert.match(meowUrl, /msgType=text/)

  const { maskSecret } = await import('../server/config.mjs')
  assert.equal(maskSecret('abcdefghijklmn'), 'abcd…klmn')
  assert.equal(maskSecret('token'), 'to…')
  assert.equal(maskSecret(''), '')

  const { remainingGlobalWindow } = await import('../server/push.mjs')
  assert.equal(remainingGlobalWindow(1_000, 3_000, 2_000), 2_000)
  assert.equal(remainingGlobalWindow(1_000, 3_000, 5_000), 0)
  assert.equal(remainingGlobalWindow(0, 3_000, 2_000), 0)

  const { summarize } = await import('../server/summarize.mjs')
  const summary = summarize('## 完成\n\n```js\nconsole.log(1)\n```\n登录模块已修复，12 项测试通过。\n\n- 详情略\n')
  assert.ok(!summary.includes('```'), '摘要不应包含代码块')
  assert.match(summary, /登录模块已修复/)
  assert.ok(summarize('长'.repeat(400), 100).length <= 101, '摘要应截断')
  step('MeoW 编码 / 脱敏 / 限流窗口 / 摘要压缩')

  // ── 8. 配置页 API ──────────────────────────────────────────────
  process.env.JUNJUN_TRAE_HOME = traeHome
  process.env.JUNJUN_TRANSIT_CONFIG = configFile
  const { startSettingsServer } = await import('../server/settings.mjs')
  const handle = await startSettingsServer({ open: false })
  try {
    const page = await fetch(handle.url)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /骏骏通知中转/)

    const denied = await fetch(handle.url.replace('?k=', '?k=wrong'))
    assert.equal(denied.status, 403)

    const saveRes = await fetch(handle.url.replace('/?k=', '/api/save?k='), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meowNickname: 'tester2' }),
    })
    const saved = await saveRes.json()
    assert.equal(saved.ok, true)
    assert.equal(saved.status.meow.nickname, 'tester2')

    const statusRes = await fetch(handle.url.replace('/?k=', '/api/status?k='))
    const statusJson = await statusRes.json()
    assert.equal(statusJson.ok, true)
    assert.equal(statusJson.status.bark.token, '', '未配置时不返回 token')
  } finally {
    handle.close()
  }
  step('配置页：页面 / token 校验 / 保存 / 脱敏状态')

  // ── 9. Stop Hook 空回复直接退出 ────────────────────────────────
  const hook = spawnSync(process.execPath, [join(root, 'server', 'hook.mjs')], {
    input: JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: '   ' }),
    env: { ...process.env, JUNJUN_TRANSIT_CONFIG: configFile },
    timeout: 5_000,
  })
  assert.equal(hook.status, 0)
  step('Stop Hook 空回复快速退出')

  console.log('\n全部通过 ✅')
}

try {
  await run()
} catch (error) {
  console.error('\n测试失败 ❌')
  console.error(error)
  process.exitCode = 1
} finally {
  child.stdin.end()
  child.kill()
}
