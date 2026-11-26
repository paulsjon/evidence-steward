// The reads the Evidence Steward shares with other agent sites, through its action bridge.
// The build names this file in bridge/agent-manifest.json. When another site's assistant
// calls the steward, the bridge loads it in a hidden frame on this site's origin.
// The three reads return only what the public page and claims.json already show, so they
// are shared with every site ("*"): any HCP-facing assistant may check its answers here.
import { StewardActions } from "../site-actions.js";

/**
 * Shares the steward's three reads, with the same names and input as the page's own.
 */
class BridgeActions {
  /**
   * Every site on the web: these reads return only public facts.
   */
  static EVERY_SITE = ["*"];

  /**
   * Register the shared reads with the bridge's registry.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    for (const definition of StewardActions.definitions()) {
      actions.register({
        ...definition,
        availability: "bridge",
        callerOrigins: BridgeActions.EVERY_SITE,
      });
    }
  }
}

// The bridge calls the module's registerActions export.
export const registerActions = BridgeActions.registerActions;
