// The reads the Question Desk shares with other agent sites, through its action bridge.
// The build names this file in bridge/agent-manifest.json. The four reads return only
// public data from openFDA, ClinicalTrials.gov and PubMed, so they are shared with every
// site ("*").
import { DeskActions } from "../site-actions.js";

/**
 * Shares the desk's four reads, with the same names and input as the page's own.
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
    for (const definition of DeskActions.definitions()) {
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
