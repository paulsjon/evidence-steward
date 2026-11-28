// Registers the Question Desk's reads with the agent runtime, for the assistant on this
// page. agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
// bridge/bridge-actions.js shares the same four reads with other agent sites. Both wrap
// js/sources.js, so the source rules live in one place.
import { Sources } from "./js/sources.js";

/**
 * The desk's four reads of live public sources. None of them changes the page.
 */
export class DeskActions {
  /**
   * Register every action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    for (const definition of DeskActions.definitions()) {
      actions.register(definition);
    }
  }

  /**
   * Describe the four reads. bridge-actions.js reuses these with bridge availability.
   *
   * :return: The action definitions.
   */
  static definitions() {
    return [
      {
        name: "get_desk_info",
        description: "Read what the Question Desk is, which live sources it reads, the evidence steward that checks its answers (with the steward's page link), and today's date. Changes nothing. Call it when asked what the desk is, or for the steward's link.",
        effect: "read",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: DeskActions.deskInfo,
      },
      {
        name: "read_us_label",
        description: "Read one section of the current US label for metformin hydrochloride from openFDA, with the label date and a DailyMed link. Changes nothing. Call it for questions about approved uses, warnings, contraindications or dosing in the label. It covers the US only.",
        effect: "read",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["section"],
          properties: {
            section: { type: "string", enum: Object.keys(Sources.LABEL_SECTIONS), description: "The label section to read." },
          },
        },
        execute: DeskActions.readLabel,
      },
      {
        name: "search_trials",
        description: "Search ClinicalTrials.gov for registered metformin trials on a condition, with status, phase, size, dates, whether results are posted, and links. Changes nothing. Call it for questions about evidence on a use, such as long COVID or cancer.",
        effect: "read",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["condition"],
          properties: {
            condition: { type: "string", minLength: 2, maxLength: 80, description: "The condition, such as 'long covid' or 'breast cancer'." },
          },
        },
        execute: DeskActions.searchTrials,
      },
      {
        name: "search_pubmed",
        description: "Search PubMed for articles on metformin and a topic, most relevant first: title, journal, date, publication types and link. Titles only, not findings. Changes nothing. Call it for questions about evidence on a use.",
        effect: "read",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["topic"],
          properties: {
            topic: { type: "string", minLength: 2, maxLength: 120, description: "Topic words, such as 'long covid randomized'. Do not include 'metformin'." },
          },
        },
        execute: DeskActions.searchPubmed,
      },
    ];
  }

  /**
   * Return the desk's own facts.
   *
   * :return: The facts.
   */
  static deskInfo() {
    return Sources.deskInfo();
  }

  /**
   * Read a US label section.
   *
   * :param args: The validated arguments.
   * :return: A promise of the section, or {ok: false, reason}.
   */
  static readLabel(args) {
    return Sources.readLabel(args);
  }

  /**
   * Search the trial registry.
   *
   * :param args: The validated arguments.
   * :return: A promise of the trials, or {ok: false, reason}.
   */
  static searchTrials(args) {
    return Sources.searchTrials(args);
  }

  /**
   * Search PubMed.
   *
   * :param args: The validated arguments.
   * :return: A promise of the articles, or {ok: false, reason}.
   */
  static searchPubmed(args) {
    return Sources.searchPubmed(args);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = DeskActions.registerActions;
