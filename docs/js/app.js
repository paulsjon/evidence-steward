// Renders the steward's ledger on the page. Uses the same rules as the agents (ledger.js),
// so what a person reads here is what an agent receives. Builds elements with the DOM API,
// never from HTML strings.
import { CLAIMS, STEWARD } from "./claims-data.js";
import { Ledger } from "./ledger.js";

/**
 * The ledger page: a market selector and a card per claim.
 */
export class App {
  /**
   * Readable names for the label statuses.
   */
  static STATUS_LABELS = {
    in_label: "In label",
    not_in_label: "Not in label",
    not_verified: "Not verified",
    not_applicable: "Not applicable",
  };

  /**
   * Readable names for the claim types.
   */
  static TYPE_LABELS = {
    label: "Label",
    rct: "Randomised trial",
    observational: "Observational",
    trial_status: "Trial status",
    rwe_result: "RWE result",
  };

  /**
   * Render the ledger and listen for market changes.
   */
  static async start() {
    const select = document.querySelector("#jurisdiction");
    const state = document.querySelector("#approval-state");
    state.textContent = STEWARD.approval_state;
    const allApproved = CLAIMS.every((claim) => claim.approval.decision === "approved");
    state.classList.toggle("pill-pending", !allApproved);
    state.classList.toggle("pill-approved", allApproved);
    select.addEventListener("change", () => App.render(select.value));
    await App.render(select.value);
  }

  /**
   * Make an element with a class and text.
   *
   * :param tag: The tag name.
   * :param className: The class, or "".
   * :param text: The text, or "".
   * :return: The element.
   */
  static el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text) {
      node.textContent = text;
    }
    return node;
  }

  /**
   * Render every claim for a market.
   *
   * :param jurisdiction: US, UK, DE or unknown.
   */
  static async render(jurisdiction) {
    const current = document.querySelector("#claims");
    const superseded = document.querySelector("#superseded");
    const today = Ledger.today();
    const currentCards = [];
    const oldCards = [];
    for (const claim of CLAIMS) {
      const card = await App.card(claim, jurisdiction, today);
      (claim.superseded_by ? oldCards : currentCards).push(card);
    }
    current.replaceChildren(...currentCards);
    superseded.replaceChildren(...oldCards);
    const market = jurisdiction === "unknown" ? "all covered markets" : STEWARD.jurisdictions[jurisdiction].label;
    document.querySelector("#ledger-status").textContent = `${currentCards.length} current claims and ${oldCards.length} superseded, with label status for ${market}. Today is ${Ledger.readableDate(today)}.`;
  }

  /**
   * Build one claim's card.
   *
   * :param claim: The claim.
   * :param jurisdiction: US, UK, DE or unknown.
   * :param today: Today's date.
   * :return: A promise of the card element.
   */
  static async card(claim, jurisdiction, today) {
    const card = App.el("article", `claim claim-${claim.claim_type}`);
    card.id = `claim-${claim.claim_id}`;
    const head = App.el("div", "claim-head");
    head.append(App.el("span", "claim-id", claim.claim_id), App.el("span", "badge", App.TYPE_LABELS[claim.claim_type]));
    head.append(...App.statusChips(claim, jurisdiction));
    card.append(head, App.el("p", "statement", claim.statement));

    if (claim.qualifiers.length) {
      card.append(App.el("h4", "", "Must travel with it"));
      const list = App.el("ul", "qualifiers");
      for (const qualifier of claim.qualifiers) {
        list.append(App.el("li", "", qualifier.text));
      }
      card.append(list);
    }
    if (claim.superseded_by) {
      card.append(App.el("p", "superseded-note", `Superseded on ${claim.superseded_on} by ${claim.superseded_by}.`));
    }
    if (claim.shown_only_with) {
      card.append(App.el("p", "companion-note", `Shown only together with ${claim.shown_only_with}, as supporting evidence.`));
    }
    if (claim.rwe) {
      card.append(App.rweDetails(claim.rwe));
    }

    const facts = App.el("dl", "claim-facts");
    App.fact(facts, "Population", claim.population);
    App.fact(facts, "Design", claim.outcome_role ? `${claim.study_design} (${claim.outcome_role} outcome)` : claim.study_design);
    if (claim.certainty.rating !== "not_applicable") {
      App.fact(facts, "Certainty", `${claim.certainty.rating.replaceAll("_", " ")}: ${claim.certainty.reason}`);
    }
    const fresh = Ledger.freshness(claim, today);
    if (fresh.status !== "superseded") {
      App.fact(facts, "Verified", `${fresh.verified_as_of_readable}; recheck within ${claim.shelf_life_days} days${fresh.status === "recheck_due" ? " (overdue)" : ""}`);
    }
    const who = claim.approval.name ? ` (${claim.approval.name}, ${Ledger.readableDate(claim.approval.date)})` : "";
    App.fact(facts, "Approval", `${claim.approval.role}: ${claim.approval.decision}${who}`);
    App.fact(facts, "Digest", (await Ledger.digest(claim)).slice(0, 23) + "…");
    card.append(facts);

    const sources = App.el("p", "sources");
    sources.append("Sources: ");
    claim.sources.forEach((source, index) => {
      const link = App.el("a", "", source.title);
      link.href = source.url;
      sources.append(link);
      if (index < claim.sources.length - 1) {
        sources.append(" · ");
      }
    });
    card.append(sources);

    if (claim.verification_notes.length) {
      const notes = App.el("p", "verify-note", `Open check: ${claim.verification_notes.join(" ")}`);
      card.append(notes);
    }
    return card;
  }

  /**
   * Add a term and its description to a list.
   *
   * :param list: The dl element.
   * :param label: The term.
   * :param value: The description.
   */
  static fact(list, label, value) {
    list.append(App.el("dt", "", label), App.el("dd", "", value));
  }

  /**
   * Build the label status chips for a market, or for every market.
   *
   * :param claim: The claim.
   * :param jurisdiction: US, UK, DE or unknown.
   * :return: The chip elements.
   */
  static statusChips(claim, jurisdiction) {
    const markets = jurisdiction === "unknown" ? Object.keys(claim.jurisdictions) : [jurisdiction];
    return markets.map((market) => {
      const entry = claim.jurisdictions[market];
      const chip = App.el("span", `chip chip-${entry.status}`, `${market}: ${App.STATUS_LABELS[entry.status]}`);
      if (entry.label_source) {
        chip.title = entry.label_source;
      }
      return chip;
    });
  }

  /**
   * Build the real-world evidence details: protocol, diagnostics, discrepancies and the
   * release gate.
   *
   * :param rwe: The claim's rwe block.
   * :return: A details element.
   */
  static rweDetails(rwe) {
    const details = App.el("details", "rwe");
    details.append(App.el("summary", "", "Protocol, diagnostics and release gate"));
    const facts = App.el("dl", "claim-facts");
    App.fact(facts, "Protocol", rwe.protocol);
    App.fact(facts, "Data", `${rwe.data_source}, ${rwe.data_window}`);
    App.fact(facts, "Diagnostics", rwe.diagnostics);
    App.fact(facts, "Sensitivity", rwe.sensitivity);
    App.fact(facts, "Independence", rwe.independence);
    details.append(facts);
    details.append(App.el("h4", "", "Discrepancies to query with the authors"));
    const list = App.el("ul", "");
    for (const item of rwe.discrepancies) {
      list.append(App.el("li", "", item));
    }
    details.append(list);
    details.append(App.el("h4", "", "Release gate"));
    const gate = App.el("dl", "claim-facts");
    for (const [key, value] of Object.entries(rwe.release_gate)) {
      App.fact(gate, key.replaceAll("_", " "), value.replaceAll("_", " "));
    }
    details.append(gate);
    return details;
  }
}

// Render only in a browser; Node tests import the ledger directly.
if (typeof window !== "undefined") {
  App.start().catch((error) => {
    document.querySelector("#ledger-status").textContent = "The ledger could not be shown. claims.json has the same claims.";
    console.error(error);
  });
}
