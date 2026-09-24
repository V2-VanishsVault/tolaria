const RELAY_PROTOCOL_VERSION = 1

const TOOL_DEFINITIONS = Object.freeze({
  read_note: Object.freeze({ capability: 'read', invoke: (service, args) => service.readNote(args) }),
  create_note: Object.freeze({ capability: 'write', invoke: (service, args) => service.createNote(args) }),
})

/**
 * Create the transport-neutral desktop side of the Stage 1 relay seam.
 *
 * This adapter deliberately has no filesystem or network behavior. It only
 * authenticates a session, checks its capabilities, and delegates approved
 * operations to the existing MCP tool service.
 */
export function createRelayAdapter({ toolService, authenticateSession }) {
  if (!toolService) throw new Error('toolService is required')
  if (typeof authenticateSession !== 'function') {
    throw new Error('authenticateSession is required')
  }

  const sessions = new Map()

  return {
    async connect({ sessionId, credential, capabilities = ['read'] } = {}) {
      if (!validSessionId(sessionId)) return errorResponse(null, 'INVALID_SESSION', 'sessionId is required')

      const authenticated = await authenticateSession({ sessionId, credential })
      if (!authenticated) return errorResponse(null, 'UNAUTHORIZED', 'Relay session is not authorized')

      sessions.set(sessionId, {
        capabilities: new Set(normalizeCapabilities(capabilities)),
      })
      return {
        version: RELAY_PROTOCOL_VERSION,
        sessionId,
        connected: true,
      }
    },

    disconnect(sessionId) {
      sessions.delete(sessionId)
    },

    async handleRequest(request = {}) {
      const { id = null, sessionId, tool, args = {} } = request
      const session = sessions.get(sessionId)
      if (!session) return errorResponse(id, 'SESSION_DISCONNECTED', 'Relay session is not connected')

      const definition = TOOL_DEFINITIONS[tool]
      if (!definition) return errorResponse(id, 'UNKNOWN_TOOL', `Relay tool is not available: ${tool}`)
      if (!session.capabilities.has(definition.capability)) {
        return errorResponse(id, 'FORBIDDEN', `Relay session lacks the ${definition.capability} capability`)
      }

      try {
        return { id, result: await definition.invoke(toolService, args) }
      } catch (error) {
        return errorResponse(id, 'TOOL_ERROR', error.message)
      }
    },
  }
}

function validSessionId(sessionId) {
  return typeof sessionId === 'string' && sessionId.trim().length > 0
}

function normalizeCapabilities(capabilities) {
  if (!Array.isArray(capabilities)) return []
  return capabilities.filter(capability => capability === 'read' || capability === 'write')
}

function errorResponse(id, code, message) {
  return { id, error: { code, message } }
}
