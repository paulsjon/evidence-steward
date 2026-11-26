// The steward's business rules: finding claims, resolving their status for a jurisdiction,
// checking freshness and digests, and checking a draft answer for lost context.
// Pure functions over claims-data.js, so the page, the site's actions, the bridge frame and
// the Node tests all use the same rules. No DOM access here.
import { CLAIMS, STEWARD } from "./claims-data.js";

/**
 * Rules over the steward's ledger.
 */
export class Ledger {
  /**
   * The jurisdictions the steward covers, plus "unknown" for a visitor who gave none.
   */
  static JURISDICTIONS = ["US", "UK", "DE", "unknown"];

  /**
   * Today's date as YYYY-MM-DD. Tests replace this to pin the date.
   *
   * :return: Today's date in UTC.
   */
  static today() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Format a YYYY-MM-DD date with its weekday, such as "Thu, Nov 26, 2026".
   *
   * :param iso: The date.
   * :return: The readable date.
   */
  static readableDate(iso) {
    const date = new Date(`${iso}T12:00:00Z`);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }

  /**
   * Serialise a value as JSON with object keys sorted, so the same claim always gives the
   * same text and the same digest.
   *
   * :param value: Any JSON value.
   * :return: The canonical JSON text.
   */
  static canonicalJson(value) {
    if (Array.isArray(value)) {
      return `[${value.map(Ledger.canonicalJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
      const keys = Object.keys(value).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${Ledger.canonicalJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  /**
   * Work out a claim's SHA-256 digest over its canonical JSON.
   *
   * :param claim: The claim as published.
   * :return: A promise of "sha256:<hex>".
   */
  static async digest(claim) {
    const bytes = new TextEncoder().encode(Ledger.canonicalJson(claim));
    const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `sha256:${hex}`;
  }

  /**
   * Find a claim by its id.
   *
   * :param id: The claim id, such as "M-09".
   * :return: The claim, or undefined.
   */
  static claim(id) {
    return CLAIMS.find((claim) => claim.claim_id === id);
  }

  /**
   * List every claim id, superseded ones included.
   *
   * :return: The ids.
   */
  static ids() {
    return CLAIMS.map((claim) => claim.claim_id);
  }

  /**
   * Days between two YYYY-MM-DD dates.
   *
   * :param from: The earlier date.
   * :param to: The later date.
   * :return: Whole days.
   */
  static daysBetween(from, to) {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
  }

  /**
   * Say whether a claim is still within its shelf life.
   *
   * :param claim: The claim.
   * :param today: Today's date.
   * :return: The freshness: status (current, recheck_due or superseded), dates and days left.
   */
  static freshness(claim, today) {
    if (claim.superseded_by) {
      return { status: "superseded", superseded_by: claim.superseded_by, superseded_on: claim.superseded_on };
    }
    const age = Ledger.daysBetween(claim.verified_as_of, today);
    const left = claim.shelf_life_days - age;
    return {
      status: left >= 0 ? "current" : "recheck_due",
      verified_as_of: claim.verified_as_of,
      verified_as_of_readable: Ledger.readableDate(claim.verified_as_of),
      shelf_life_days: claim.shelf_life_days,
      days_left: left,
    };
  }

  /**
   * Resolve a claim's label status for the asker's jurisdiction. With "unknown", give every
   * covered market, and say that no recommendation follows.
   *
   * :param claim: The claim.
   * :param jurisdiction: US, UK, DE or unknown.
   * :return: The status for that market, or the status in each market.
   */
  static statusFor(claim, jurisdiction) {
    if (jurisdiction === "unknown") {
      return {
        jurisdiction: "unknown",
        note: "No practice location given: status shown for every covered market, and no recommendation is made.",
        by_market: claim.jurisdictions,
      };
    }
    const entry = claim.jurisdictions[jurisdiction];
    return {
      jurisdiction: jurisdiction,
      declared_not_verified: true,
      status: entry.status,
      label_source: entry.label_source,
      adverse_event_route: STEWARD.jurisdictions[jurisdiction].adverse_event_route,
    };
  }

  /**
   * Build the envelope a caller receives for one claim: the claim with its status for the
   * jurisdiction, its freshness and its digest.
   *
   * :param claim: The claim.
   * :param jurisdiction: US, UK, DE or unknown.
   * :param today: Today's date.
   * :return: A promise of the envelope.
   */
  static async envelope(claim, jurisdiction, today) {
    const result = {
      claim_id: claim.claim_id,
      version: claim.version,
      claim_type: claim.claim_type,
      statement: claim.statement,
      population: claim.population,
      intervention: claim.intervention,
      comparator: claim.comparator,
      outcome: claim.outcome,
      outcome_role: claim.outcome_role,
      study_design: claim.study_design,
      certainty: claim.certainty,
      must_travel_with: claim.qualifiers.map((qualifier) => qualifier.text),
      status: Ledger.statusFor(claim, jurisdiction),
      freshness: Ledger.freshness(claim, today),
      sources: claim.sources,
      approval: claim.approval,
      digest: await Ledger.digest(claim),
    };
    if (claim.supersedes) {
      result.supersedes = claim.supersedes;
    }
    if (claim.shown_only_with) {
      result.shown_only_with = claim.shown_only_with;
    }
    if (claim.rwe) {
      result.rwe = claim.rwe;
    }
    if (claim.verification_notes.length) {
      result.open_verification = claim.verification_notes;
    }
    return result;
  }

  /**
   * Split text into lowercase words for matching.
   *
   * :param text: Any text.
   * :return: The text in lowercase with runs of whitespace collapsed.
   */
  static normalise(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, " ");
  }

  /**
   * Find the claims whose topics appear in a piece of text.
   *
   * :param text: A question, a topic or a draft answer.
   * :param includeSuperseded: Whether to include superseded claims.
   * :return: The matching claims, in ledger order.
   */
  static matchTopics(text, includeSuperseded) {
    const haystack = Ledger.normalise(text);
    const found = [];
    for (const claim of CLAIMS) {
      if (claim.superseded_by && !includeSuperseded) {
        continue;
      }
      if (claim.topics.some((topic) => haystack.includes(topic))) {
        found.push(claim);
      }
    }
    return found;
  }

  /**
   * Add the claim a result must be shown with, such as M-09 for RWE-01.
   *
   * :param claims: The claims found so far.
   * :return: The claims with each companion added once, in ledger order.
   */
  static withCompanions(claims) {
    const ids = new Set(claims.map((claim) => claim.claim_id));
    for (const claim of claims) {
      if (claim.shown_only_with) {
        ids.add(claim.shown_only_with);
      }
    }
    return CLAIMS.filter((claim) => ids.has(claim.claim_id));
  }

  /**
   * Check a jurisdiction value.
   *
   * :param jurisdiction: The value given.
   * :return: A refusal, or null when it is valid.
   */
  static refuseJurisdiction(jurisdiction) {
    if (!Ledger.JURISDICTIONS.includes(jurisdiction)) {
      return { ok: false, reason: `Jurisdiction must be one of ${Ledger.JURISDICTIONS.join(", ")}.`, field: "jurisdiction" };
    }
    return null;
  }

  /**
   * Describe the steward: who runs it, its scope, principles, markets and routes, today's
   * date and a one-line list of the claims.
   *
   * :return: The steward's facts.
   */
  static stewardInfo() {
    const today = Ledger.today();
    return {
      ...STEWARD,
      today: today,
      today_readable: Ledger.readableDate(today),
      claims: CLAIMS.map((claim) => ({
        claim_id: claim.claim_id,
        claim_type: claim.claim_type,
        topics: claim.topics,
        superseded_by: claim.superseded_by || null,
        approval: claim.approval.decision,
      })),
    };
  }

  /**
   * Find claims by topic words or by id, with their status for the asker's jurisdiction.
   *
   * :param args: query (text) and/or claim_ids, jurisdiction, include_superseded.
   * :return: A promise of {ok, jurisdiction, claims, note} or a refusal.
   */
  static async findClaims(args) {
    const jurisdiction = args.jurisdiction || "unknown";
    const refusal = Ledger.refuseJurisdiction(jurisdiction);
    if (refusal) {
      return refusal;
    }
    const includeSuperseded = Boolean(args.include_superseded);
    let claims = [];
    if (args.claim_ids && args.claim_ids.length) {
      const unknown = args.claim_ids.filter((id) => !Ledger.claim(id));
      if (unknown.length) {
        return { ok: false, reason: `Unknown claim id: ${unknown.join(", ")}.`, field: "claim_ids" };
      }
      claims = CLAIMS.filter((claim) => args.claim_ids.includes(claim.claim_id));
    } else if (args.query) {
      claims = Ledger.matchTopics(args.query, includeSuperseded);
    } else {
      return { ok: false, reason: "Give a query or claim_ids.", field: "query" };
    }
    claims = Ledger.withCompanions(claims);
    const today = Ledger.today();
    const envelopes = [];
    for (const claim of claims) {
      envelopes.push(await Ledger.envelope(claim, jurisdiction, today));
    }
    return {
      ok: true,
      jurisdiction: jurisdiction,
      today: today,
      approval_state: STEWARD.approval_state,
      claims: envelopes,
      note: envelopes.length
        ? "Each claim must be passed on with every item in must_travel_with."
        : "The steward has no claim on this topic. Say so; do not answer from elsewhere in the steward's name.",
    };
  }

  /**
   * Check a draft answer, written by another assistant, against the steward's claims: which
   * qualifiers it dropped, which superseded claims it relies on, each claim's status in the
   * asker's jurisdiction and freshness, and whether digests a caller holds still match.
   * These checks are plain text matching in code, not a model's judgement.
   *
   * :param args: draft, jurisdiction, optional claim_ids and digests.
   * :return: A promise of the check result or a refusal.
   */
  static async checkDraft(args) {
    const jurisdiction = args.jurisdiction || "unknown";
    const refusal = Ledger.refuseJurisdiction(jurisdiction);
    if (refusal) {
      return refusal;
    }
    const draft = String(args.draft || "").trim();
    if (!draft) {
      return { ok: false, reason: "Give the draft answer to check.", field: "draft" };
    }
    const text = Ledger.normalise(draft);
    let claims;
    if (args.claim_ids && args.claim_ids.length) {
      const unknown = args.claim_ids.filter((id) => !Ledger.claim(id));
      if (unknown.length) {
        return { ok: false, reason: `Unknown claim id: ${unknown.join(", ")}.`, field: "claim_ids" };
      }
      claims = CLAIMS.filter((claim) => args.claim_ids.includes(claim.claim_id) && !claim.superseded_by);
    } else {
      claims = Ledger.matchTopics(draft, false);
    }
    claims = Ledger.withCompanions(claims);
    const today = Ledger.today();
    const checked = [];
    for (const claim of claims) {
      const missing = claim.qualifiers
        .filter((qualifier) => !qualifier.any_of.some((term) => text.includes(term.toLowerCase())))
        .map((qualifier) => qualifier.text);
      checked.push({
        claim_id: claim.claim_id,
        statement: claim.statement,
        status: Ledger.statusFor(claim, jurisdiction),
        freshness: Ledger.freshness(claim, today),
        approval: claim.approval.decision,
        dropped_qualifiers: missing,
        kept_all_qualifiers: missing.length === 0,
        shown_only_with: claim.shown_only_with || null,
        digest: await Ledger.digest(claim),
      });
    }
    const stale = [];
    for (const claim of CLAIMS) {
      if (!claim.superseded_by) {
        continue;
      }
      const markers = claim.stale_markers.filter((marker) => text.includes(marker.toLowerCase()));
      if (markers.length) {
        const replacement = Ledger.claim(claim.superseded_by);
        stale.push({
          superseded_claim: claim.claim_id,
          superseded_on: claim.superseded_on,
          matched_text: markers,
          replaced_by: replacement.claim_id,
          current_statement: replacement.statement,
        });
      }
    }
    const digestChecks = [];
    for (const held of args.digests || []) {
      const claim = Ledger.claim(held.claim_id);
      if (!claim) {
        digestChecks.push({ claim_id: held.claim_id, result: "unknown_claim" });
        continue;
      }
      const current = await Ledger.digest(claim);
      digestChecks.push({
        claim_id: held.claim_id,
        result: claim.superseded_by ? "superseded" : (current === held.digest ? "match" : "mismatch"),
        current_digest: current,
      });
    }
    return {
      ok: true,
      jurisdiction: jurisdiction,
      today: today,
      approval_state: STEWARD.approval_state,
      claims_checked: checked,
      stale_claims_used: stale,
      digest_checks: digestChecks,
      summary: {
        claims_matched: checked.length,
        claims_with_dropped_qualifiers: checked.filter((item) => !item.kept_all_qualifiers).length,
        stale_claims_used: stale.length,
        no_matching_claim: checked.length === 0 && stale.length === 0,
      },
    };
  }
}
