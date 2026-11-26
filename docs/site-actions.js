// Registers the Evidence Steward's reads with the agent runtime, for the assistant on this
// page. agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
// bridge/bridge-actions.js shares the same three reads, with the same names and input,
// with other agent sites. Both wrap js/ledger.js, so the rules live in one place.
import { Ledger } from "./js/ledger.js";

/**
 * The steward's three reads: who it is, its claims on a topic, and a check of a draft
 * answer. None of them changes the page.
 */
export class StewardActions {
  /**
   * The shared input field for the asker's declared jurisdiction.
   */
  static JURISDICTION_FIELD = {
    type: "string",
    enum: Ledger.JURISDICTIONS,
    description: "The practice location the visitor declared: US, UK or DE. Use unknown if they gave none. It is not verified.",
  };

  /**
   * Register every action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    for (const definition of StewardActions.definitions()) {
      actions.register(definition);
    }
  }

  /**
   * Describe the three reads. bridge-actions.js reuses these with bridge availability.
   *
   * :return: The action definitions.
   */
  static definitions() {
    return [
      {
        name: "get_steward_info",
        description: "Read who runs the Metformin Evidence Steward, its scope and principles, the markets it covers with their adverse event reporting routes, the correction route, today's date, and the list of claim ids and topics. Changes nothing. Call it when asked what the steward is or covers, or for a reporting or correction route.",
        effect: "read",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: StewardActions.stewardInfo,
      },
      {
        name: "find_claims",
        description: "Find the steward's claims on a topic (query) or by id (claim_ids), each with its statement, the qualifiers that must travel with it, its label status for the asker's jurisdiction, freshness, sources, approval and digest. Changes nothing. Call it before answering any question about metformin evidence, and pass on every qualifier in must_travel_with.",
        effect: "read",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["jurisdiction"],
          properties: {
            query: { type: "string", minLength: 2, maxLength: 300, description: "Topic words or the question, such as 'long covid' or 'kidney function'." },
            claim_ids: { type: "array", maxItems: 12, items: { type: "string", enum: Ledger.ids() }, description: "Exact claim ids, when known." },
            jurisdiction: StewardActions.JURISDICTION_FIELD,
            include_superseded: { type: "boolean", description: "Include superseded claims. Default false." },
          },
        },
        execute: StewardActions.findClaims,
      },
      {
        name: "check_draft",
        description: "Check a draft answer about metformin, such as one another assistant wrote, against the steward's claims. Returns, worked out in code: the qualifiers the draft dropped, superseded claims it relies on with their current replacement, each claim's status for the jurisdiction, its freshness and approval, and whether digests the caller holds still match. Changes nothing. Call it whenever you are given a draft to check.",
        effect: "read",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["draft", "jurisdiction"],
          properties: {
            draft: { type: "string", minLength: 1, maxLength: 2000, description: "The draft answer, word for word." },
            jurisdiction: StewardActions.JURISDICTION_FIELD,
            claim_ids: { type: "array", maxItems: 12, items: { type: "string", enum: Ledger.ids() }, description: "Limit the check to these claims. Leave out to match by topic." },
            digests: {
              type: "array",
              maxItems: 12,
              description: "Digests the caller already holds, to check they still match.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["claim_id", "digest"],
                properties: {
                  claim_id: { type: "string", maxLength: 20, description: "The claim id." },
                  digest: { type: "string", maxLength: 80, description: "The digest the caller holds, sha256:<hex>." },
                },
              },
            },
          },
        },
        execute: StewardActions.checkDraft,
      },
    ];
  }

  /**
   * Return the steward's facts.
   *
   * :return: The facts from Ledger.stewardInfo().
   */
  static stewardInfo() {
    return Ledger.stewardInfo();
  }

  /**
   * Find claims through the ledger's own rules.
   *
   * :param args: The validated arguments.
   * :return: A promise of the claims, or {ok: false, reason}.
   */
  static findClaims(args) {
    return Ledger.findClaims(args);
  }

  /**
   * Check a draft through the ledger's own rules.
   *
   * :param args: The validated arguments.
   * :return: A promise of the check, or {ok: false, reason}.
   */
  static checkDraft(args) {
    return Ledger.checkDraft(args);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = StewardActions.registerActions;
