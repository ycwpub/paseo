import { TraeACPAgentClient } from "./trae-acp-agent.js";
import { TRAE_MODES } from "./trae-acp-modes.js";

/**
 * Adds the permission modes that some Trae CLI versions omit from ACP
 * session/new responses without widening the generic or upstream Trae adapter.
 */
export class TraeACPModeFallbackAgentClient extends TraeACPAgentClient {
  protected override readonly defaultModes = TRAE_MODES;
}
