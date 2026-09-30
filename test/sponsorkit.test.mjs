import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeEach, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { FALLBACK_AVATAR, generateBadge, ProvidersMap, svgToPng } from 'sponsorkit'

const avatarBuffer = await FALLBACK_AVATAR

// All API responses are fixtures. An unexpected request fails before any network I/O.
beforeEach((t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected network request in offline test')
  })
})

function member(id, status = 'active_patron', cents = 1000) {
  return {
    id,
    type: 'member',
    attributes: { patron_status: status, currently_entitled_amount_cents: cents, pledge_relationship_start: '2026-01-01T00:00:00Z' },
    relationships: {
      user: { data: { type: 'user', id } },
      currently_entitled_tiers: { data: [{ type: 'tier', id: 'gift' }] },
    },
  }
}

function page(data) {
  return {
    data,
    included: [
      ...data.map(({ id }) => ({
        id,
        type: 'user',
        attributes: { first_name: id, full_name: `Name ${id}`, image_url: `https://example.com/${id}.png`, url: `https://example.com/${id}` },
      })),
      { id: 'gift', type: 'tier', attributes: { amount_cents: 1500 } },
    ],
  }
}

function mockResponses(t, responses) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: new URL(String(url)), options })
    assert.ok(responses.length, 'No fixture available for request')
    return Response.json(responses.shift())
  })
  return calls
}

for (const pagination of ['links', 'cursor', 'both']) {
  it(`installed provider uses v2 and retains mappings across ${pagination} pagination`, async (t) => {
    const nextLink = 'https://www.patreon.com/api/oauth2/v2/campaigns/123/members?page%5Bcursor%5D=next'
    const cursor = 'next:+/=?&'
    const calls = mockResponses(t, [
      { data: [{ type: 'campaign', id: '123' }, { type: 'campaign', id: '456' }] },
      {
        ...page([member('active', 'active_patron', 1099), member('free', null, 0)]),
        ...(pagination !== 'cursor' ? { links: { next: nextLink } } : {}),
        ...(pagination !== 'links' ? { meta: { pagination: { cursors: { next: cursor } } } } : {}),
      },
      { ...page([member('gifted', 'active_patron', 0), member('former', 'former_patron'), member('declined', 'declined_patron')]), meta: { pagination: { cursors: { next: null } } } },
    ])
    const sponsors = await ProvidersMap.patreon.fetchSponsors({ patreon: { token: 'fixture-token' } })
    assert.equal(calls.length, 3)
    assert.equal(calls[0].url.href, 'https://www.patreon.com/api/oauth2/v2/campaigns')
    assert.equal(calls[1].url.pathname, '/api/oauth2/v2/campaigns/123/members')
    assert.equal(calls[1].url.searchParams.get('page[count]'), '100')
    assert.equal(calls[1].url.searchParams.get('fields[user]'), 'image_url,url,first_name,full_name')
    if (pagination === 'cursor') {
      assert.equal(calls[2].url.searchParams.get('page[cursor]'), cursor)
      assert.equal(calls[2].url.searchParams.get('include'), calls[1].url.searchParams.get('include'))
      assert.equal(calls[2].url.searchParams.get('fields[member]'), calls[1].url.searchParams.get('fields[member]'))
    }
    else {
      assert.equal(calls[2].url.href, nextLink)
    }
    for (const { options } of calls) {
      assert.equal(options.method, 'GET')
      assert.equal(options.headers.get('authorization'), 'bearer fixture-token')
      assert.match(options.headers.get('user-agent'), /SponsorKit\/17\.1\.1/)
    }
    assert.deepEqual(sponsors.map(s => [s.sponsor.login, s.monthlyDollars]), [
      ['active', 10],
      ['gifted', 15],
      ['former', -1],
      ['declined', -1],
    ])
    assert.deepEqual(sponsors[0], {
      sponsor: { avatarUrl: 'https://example.com/active.png', login: 'active', name: 'Name active', type: 'User', linkUrl: 'https://example.com/active' },
      monthlyDollars: 10,
      isOneTime: false,
      privacyLevel: 'PUBLIC',
      tierName: 'Patreon',
      createdAt: '2026-01-01T00:00:00Z',
    })
  })
}

for (const value of [null, '', undefined]) {
  it(`installed provider retains masked identity fields (${String(value)})`, async (t) => {
    mockResponses(t, [
      { data: [{ id: '123' }] },
      { data: [member('masked')], included: [{ type: 'user', id: 'masked', attributes: { first_name: value, full_name: value, image_url: value, url: value } }] },
    ])
    const sponsors = await ProvidersMap.patreon.fetchSponsors({ patreon: { token: 'fixture-token' } })
    assert.equal(sponsors.length, 1)
    assert.equal(sponsors[0].monthlyDollars, 10)
    assert.deepEqual(sponsors[0].sponsor, { type: 'User', name: '', login: '', avatarUrl: '', linkUrl: undefined })
  })
}

it('installed provider retains members when optional included resources are absent', async (t) => {
  mockResponses(t, [{ data: [{ id: '123' }] }, { data: [{ ...member('masked'), relationships: {} }] }])
  const sponsors = await ProvidersMap.patreon.fetchSponsors({ token: 'fixture-token' })
  assert.equal(sponsors.length, 1)
  assert.equal(sponsors[0].monthlyDollars, 10)
  assert.equal(sponsors[0].sponsor.name, '')
})

it('installed provider reports an empty campaign list before requesting members', async (t) => {
  const calls = mockResponses(t, [{ data: [] }])
  await assert.rejects(ProvidersMap.patreon.fetchSponsors({ token: 'fixture-token' }), /No Patreon campaign found/)
  assert.equal(calls.length, 1)
})

it('installed provider requires a token before requests', async () => {
  await assert.rejects(ProvidersMap.patreon.fetchSponsors({}), /Patreon token is required/)
})

const namedPreset = { avatar: { size: 80 }, boxWidth: 100, boxHeight: 120, name: {} }
for (const [name, login, expected] of [
  [undefined, undefined, 'Anonymous'],
  [null, null, 'Anonymous'],
  ['', '', 'Anonymous'],
  [' \t ', '\n ', 'Anonymous'],
  ['  ', ' login ', 'login'],
  [undefined, ' login ', 'login'],
  [' Name ', 'login', 'Name'],
  ['A<&"', 'login', 'A&lt;&amp;&quot;'],
]) {
  it(`installed badge renders name=${String(name)}, login=${String(login)} as ${expected}`, async () => {
    const svg = await generateBadge(0, 0, { type: 'User', name, login, avatarBuffer }, namedPreset, 0.5, 'webp')
    assert.ok(svg.includes(`>${expected}</text>`))
    assert.ok(svg.includes('<image '))
  })
}

it('installed badge tolerates absent names with labels disabled', async () => {
  const svg = await generateBadge(0, 0, { type: 'User', avatarBuffer }, { ...namedPreset, name: false }, 0.5, 'webp')
  assert.ok(!svg.includes('<text '))
  assert.ok(svg.includes('<image '))
})

it('installed badge retains truncation and produces a real PNG offline', async () => {
  const badge = await generateBadge(0, 0, { type: 'User', name: 'LongUsername', avatarBuffer }, { ...namedPreset, name: { maxLength: 8 } }, 0.5, 'png')
  assert.ok(badge.includes('>LongU...</text>'))
  const png = await svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="120">${badge}</svg>`)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
})

it('installed CLI sorts tied missing names and writes standard, wide, and simple outputs offline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sponsors-patch-regression-'))
  const packageDir = dirname(dirname(fileURLToPath(import.meta.resolve('sponsorkit'))))
  const entries = [undefined, null, '', '  '].map(value => ({
    sponsor: { type: 'User', name: value, login: value, avatarBuffer: avatarBuffer.toString('base64') },
    monthlyDollars: 10,
    createdAt: '2026-01-01T00:00:00Z',
  }))
  try {
    await writeFile(join(dir, '.cache.json'), JSON.stringify(entries))
    await writeFile(join(dir, 'network-guard.mjs'), 'globalThis.fetch = async () => { throw new Error("Network forbidden in offline CLI test") }\n')
    for (const [name, width, labels] of [['standard', 800, true], ['wide', 1000, true], ['simple', 1000, false]]) {
      const config = { providers: [], formats: ['svg', 'png', 'json'], tiers: [{ preset: { ...namedPreset, name: labels ? {} : false } }] }
      await writeFile(join(dir, 'sponsorkit.config.mjs'), `export default ${JSON.stringify(config)}\n`)
      const result = spawnSync(process.execPath, ['--import', join(dir, 'network-guard.mjs'), join(packageDir, 'bin/sponsorkit.mjs'), '--dir', dir, '--name', name, '-w', String(width)], {
        cwd: dir,
        env: { PATH: process.env.PATH, NO_COLOR: '1' },
        encoding: 'utf8',
        timeout: 30000,
      })
      assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message)
      const svg = await readFile(join(dir, `${name}.svg`), 'utf8')
      assert.equal((svg.match(/<image /g) || []).length, entries.length)
      assert.equal((svg.match(/>Anonymous<\/text>/g) || []).length, labels ? entries.length : 0)
      assert.equal(JSON.parse(await readFile(join(dir, `${name}.json`), 'utf8')).length, entries.length)
      assert.equal((await readFile(join(dir, `${name}.png`))).subarray(1, 4).toString(), 'PNG')
    }
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})
