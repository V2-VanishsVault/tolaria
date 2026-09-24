import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMcpToolService } from './tool-service.js'
import { createRelayAdapter } from './relay-adapter.js'

describe('createRelayAdapter', () => {
  it('reads, creates, and reads back through the existing tool service', async () => {
    const vaultPath = await createTestVault()
    const service = createMcpToolService({ resolveVaultPaths: () => [vaultPath] })
    const relay = createRelayAdapter({
      toolService: service,
      authenticateSession: ({ credential }) => credential === 'test-credential',
    })

    try {
      assert.deepEqual(
        await relay.connect({ sessionId: 'session-1', credential: 'test-credential', capabilities: ['read', 'write'] }),
        { version: 1, sessionId: 'session-1', connected: true },
      )

      const read = await relay.handleRequest({
        id: 'read-1',
        sessionId: 'session-1',
        tool: 'read_note',
        args: { path: 'note/existing.md' },
      })
      assert.equal(read.id, 'read-1')
      assert.equal(read.result.content, '# Existing\n\nExisting content.')

      const created = await relay.handleRequest({
        id: 'create-1',
        sessionId: 'session-1',
        tool: 'create_note',
        args: { path: 'note/created.md', content: '# Created through relay\n' },
      })
      assert.equal(created.result.path, 'note/created.md')
      assert.equal(await readFile(path.join(vaultPath, 'note/created.md'), 'utf8'), '# Created through relay\n')

      const readBack = await relay.handleRequest({
        id: 'read-2',
        sessionId: 'session-1',
        tool: 'read_note',
        args: { path: 'note/created.md' },
      })
      assert.equal(readBack.result.content, '# Created through relay')
    } finally {
      await rm(vaultPath, { recursive: true, force: true })
    }
  })

  it('rejects invalid credentials before a session can invoke tools', async () => {
    let invoked = false
    const relay = createRelayAdapter({
      toolService: { readNote: async () => { invoked = true } },
      authenticateSession: () => false,
    })

    assert.deepEqual(
      await relay.connect({ sessionId: 'session-1', credential: 'wrong' }),
      { id: null, error: { code: 'UNAUTHORIZED', message: 'Relay session is not authorized' } },
    )
    assert.deepEqual(
      await relay.handleRequest({ id: 'read-1', sessionId: 'session-1', tool: 'read_note', args: {} }),
      { id: 'read-1', error: { code: 'SESSION_DISCONNECTED', message: 'Relay session is not connected' } },
    )
    assert.equal(invoked, false)
  })

  it('rejects disconnected sessions, missing capabilities, and unknown tools', async () => {
    const relay = createRelayAdapter({
      toolService: { readNote: async () => ({ content: 'unreachable' }) },
      authenticateSession: () => true,
    })

    assert.deepEqual(
      await relay.handleRequest({ id: 'missing-1', sessionId: 'missing', tool: 'read_note' }),
      { id: 'missing-1', error: { code: 'SESSION_DISCONNECTED', message: 'Relay session is not connected' } },
    )
    await relay.connect({ sessionId: 'read-only', credential: 'ok', capabilities: ['read'] })
    assert.deepEqual(
      await relay.handleRequest({ id: 'write-1', sessionId: 'read-only', tool: 'create_note' }),
      { id: 'write-1', error: { code: 'FORBIDDEN', message: 'Relay session lacks the write capability' } },
    )
    assert.deepEqual(
      await relay.handleRequest({ id: 'unknown-1', sessionId: 'read-only', tool: 'delete_note' }),
      { id: 'unknown-1', error: { code: 'UNKNOWN_TOOL', message: 'Relay tool is not available: delete_note' } },
    )
    relay.disconnect('read-only')
    assert.deepEqual(
      await relay.handleRequest({ id: 'read-1', sessionId: 'read-only', tool: 'read_note' }),
      { id: 'read-1', error: { code: 'SESSION_DISCONNECTED', message: 'Relay session is not connected' } },
    )
  })
})

async function createTestVault() {
  const vaultPath = await mkdtemp(path.join(os.tmpdir(), 'tolaria-relay-test-'))
  await mkdir(path.join(vaultPath, 'note'), { recursive: true })
  await writeFile(
    path.join(vaultPath, 'note/existing.md'),
    '---\ntype: Note\n---\n\n# Existing\n\nExisting content.\n',
    'utf8',
  )
  return vaultPath
}
