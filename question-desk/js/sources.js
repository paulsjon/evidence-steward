// Reads live public sources about metformin for the Question Desk: the US label (openFDA),
// the trial registry (ClinicalTrials.gov) and the literature (PubMed). Every read is
// public, keyless and changes nothing. A source that cannot be reached returns
// {ok: false, reason}, so the assistant can say so instead of guessing (fail closed).

/**
 * Queries the three public sources and trims their answers to what an assistant needs.
 */
export class Sources {
  /**
   * The label sections the desk can read, mapped to openFDA field names.
   */
  static LABEL_SECTIONS = {
    indications: "indications_and_usage",
    boxed_warning: "boxed_warning",
    contraindications: "contraindications",
    warnings: "warnings_and_cautions",
    dosage: "dosage_and_administration",
  };

  /**
   * The most characters of one label section passed to the model.
   */
  static MAX_SECTION_CHARS = 1800;

  /**
   * How many trials or articles one read returns.
   */
  static MAX_RESULTS = 5;

  /**
   * Milliseconds before a source counts as unreachable.
   */
  static TIMEOUT_MS = 12000;

  /**
   * The fetch function. Tests replace it with a stub.
   */
  static fetcher = (...args) => globalThis.fetch(...args);

  /**
   * The desk's own facts, for the assistant and for partners.
   */
  static DESK = {
    name: "Evidence Question Desk",
    operator: "Jon Pauls (individual demonstration entry)",
    status: "Illustrative only. Not affiliated with any manufacturer. Not medical advice.",
    what_it_does: "Drafts answers to clinicians' questions about metformin from live public sources, then has an evidence steward check each draft for lost context before it is shown.",
    live_sources: [
      { name: "openFDA drug labels (US)", link: "https://open.fda.gov/apis/drug/label/" },
      { name: "ClinicalTrials.gov", link: "https://clinicaltrials.gov/" },
      { name: "PubMed", link: "https://pubmed.ncbi.nlm.nih.gov/" },
    ],
    steward: {
      name: "Metformin Evidence Steward",
      page: "https://paulsjon.github.io/evidence-steward/",
      network: "https://paulsjon.github.io/evidence-steward/metformin_evidence_steward",
      role: "Holds approved, qualified claims about metformin and checks drafts against them.",
    },
    fail_closed: "If the steward cannot check a draft, the desk does not give the draft as an answer.",
  };

  /**
   * Return the desk's facts with today's date.
   *
   * :return: The facts.
   */
  static deskInfo() {
    return { ok: true, ...Sources.DESK, today: new Date().toISOString().slice(0, 10) };
  }

  /**
   * Fetch JSON from a public source, with a timeout.
   *
   * :param url: The full request URL.
   * :param source: The source's name, for the error message.
   * :return: A promise of {ok: true, data} or {ok: false, reason}.
   */
  static async getJson(url, source) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Sources.TIMEOUT_MS);
    try {
      const response = await Sources.fetcher(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (response.status === 404) {
        return { ok: true, data: null };
      }
      if (!response.ok) {
        return { ok: false, reason: `${source} answered with HTTP ${response.status}. Nothing was read from it.` };
      }
      return { ok: true, data: await response.json() };
    } catch (error) {
      const why = error?.name === "AbortError" ? "it did not answer in time" : "it could not be reached from this browser";
      return { ok: false, reason: `${source} could not be read: ${why}. Nothing was read from it.` };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Shorten text to a limit, at a word boundary, and say that it was cut.
   *
   * :param text: The text.
   * :param limit: The most characters to keep.
   * :return: The text, cut if needed.
   */
  static clip(text, limit) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= limit) {
      return clean;
    }
    const cut = clean.slice(0, limit);
    return `${cut.slice(0, cut.lastIndexOf(" "))} […]`;
  }

  /**
   * Turn openFDA's effective_time (YYYYMMDD) into an ISO date.
   *
   * :param value: The effective_time string.
   * :return: The ISO date, or null.
   */
  static isoFromCompact(value) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value || ""));
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }

  /**
   * Read one section of the most recently revised US label for single-ingredient
   * metformin hydrochloride tablets.
   *
   * :param args: {section} with a key of LABEL_SECTIONS.
   * :return: A promise of the section text, its label date and links, or {ok: false, reason}.
   */
  static async readLabel({ section }) {
    const field = Sources.LABEL_SECTIONS[section];
    if (!field) {
      return { ok: false, reason: `Unknown label section "${section}". Use one of: ${Object.keys(Sources.LABEL_SECTIONS).join(", ")}.` };
    }
    const search = 'openfda.generic_name:"metformin hydrochloride" AND openfda.route:"ORAL"';
    const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(search)}&limit=25`;
    const answer = await Sources.getJson(url, "openFDA");
    if (!answer.ok) {
      return answer;
    }
    const labels = (answer.data?.results || []).filter((label) => {
      const names = label.openfda?.generic_name || [];
      return names.length === 1 && /^metformin hydrochloride$/i.test(names[0]) && label[field];
    }).sort((a, b) => String(b.effective_time || "").localeCompare(String(a.effective_time || "")));
    if (labels.length === 0) {
      return { ok: true, source: "openFDA drug label", found: false, note: `No single-ingredient metformin label with a "${section}" section was found.` };
    }
    const label = labels[0];
    const setId = label.set_id;
    return {
      ok: true,
      source: "openFDA drug label (US)",
      market: "US",
      found: true,
      section,
      product: (label.openfda?.brand_name || ["metformin hydrochloride"])[0],
      manufacturer: (label.openfda?.manufacturer_name || [null])[0],
      label_effective_date: Sources.isoFromCompact(label.effective_time),
      text: Sources.clip([].concat(label[field]).join(" "), Sources.MAX_SECTION_CHARS),
      recent_major_changes: label.recent_major_changes ? Sources.clip([].concat(label.recent_major_changes).join(" "), 300) : null,
      link: setId ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${setId}` : null,
      note: "This is one US label. UK and German labels are not in openFDA.",
    };
  }

  /**
   * Search ClinicalTrials.gov for metformin trials on a condition.
   *
   * :param args: {condition} such as "long covid".
   * :return: A promise of up to MAX_RESULTS trials with status and links, or {ok: false, reason}.
   */
  static async searchTrials({ condition }) {
    const fields = [
      "NCTId", "BriefTitle", "OverallStatus", "Phase", "EnrollmentCount", "StartDate",
      "PrimaryCompletionDate", "HasResults", "LeadSponsorName",
    ].join(",");
    const url = "https://clinicaltrials.gov/api/v2/studies"
      + `?query.intr=metformin&query.cond=${encodeURIComponent(condition)}`
      + `&fields=${fields}&pageSize=${Sources.MAX_RESULTS}&countTotal=true&sort=LastUpdatePostDate:desc`;
    const answer = await Sources.getJson(url, "ClinicalTrials.gov");
    if (!answer.ok) {
      return answer;
    }
    const studies = answer.data?.studies || [];
    return {
      ok: true,
      source: "ClinicalTrials.gov",
      condition,
      total_matching: answer.data?.totalCount ?? studies.length,
      shown: studies.length,
      trials: studies.map(Sources.trialSummary),
      note: "Registry entries describe what a trial planned or reported; a registered trial is not evidence of benefit.",
    };
  }

  /**
   * Flatten one ClinicalTrials.gov study record.
   *
   * :param study: The study record from the v2 API.
   * :return: The summary.
   */
  static trialSummary(study) {
    const p = study.protocolSection || {};
    const id = p.identificationModule?.nctId;
    const status = p.statusModule || {};
    return {
      nct_id: id,
      title: p.identificationModule?.briefTitle,
      status: status.overallStatus,
      phase: (p.designModule?.phases || []).join(", ") || null,
      enrollment: p.designModule?.enrollmentInfo?.count ?? null,
      start: status.startDateStruct?.date ?? null,
      primary_completion: status.primaryCompletionDateStruct?.date ?? null,
      has_results: Boolean(study.hasResults),
      sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
      link: id ? `https://clinicaltrials.gov/study/${id}` : null,
    };
  }

  /**
   * Search PubMed for articles on metformin and a topic, most relevant first.
   *
   * :param args: {topic} such as "long covid randomized".
   * :return: A promise of up to MAX_RESULTS articles with journal, date and links, or {ok: false, reason}.
   */
  static async searchPubmed({ topic }) {
    const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
    const term = `metformin AND (${topic})`;
    const search = await Sources.getJson(
      `${base}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${Sources.MAX_RESULTS}&tool=evidence-question-desk&term=${encodeURIComponent(term)}`,
      "PubMed",
    );
    if (!search.ok) {
      return search;
    }
    const ids = search.data?.esearchresult?.idlist || [];
    const total = Number(search.data?.esearchresult?.count || 0);
    if (ids.length === 0) {
      return { ok: true, source: "PubMed", topic, total_matching: total, articles: [] };
    }
    const summary = await Sources.getJson(
      `${base}/esummary.fcgi?db=pubmed&retmode=json&tool=evidence-question-desk&id=${ids.join(",")}`,
      "PubMed",
    );
    if (!summary.ok) {
      return summary;
    }
    const result = summary.data?.result || {};
    return {
      ok: true,
      source: "PubMed",
      topic,
      total_matching: total,
      articles: ids.filter((id) => result[id]).map((id) => ({
        pmid: id,
        title: result[id].title,
        journal: result[id].fulljournalname || result[id].source,
        published: result[id].pubdate,
        publication_types: result[id].pubtype || [],
        link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      })),
      note: "Titles and journals only. The desk has not read these articles; the steward's claims carry the checked findings.",
    };
  }
}
