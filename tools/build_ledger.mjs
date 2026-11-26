// Writes docs/claims.json: the published ledger, with each claim's SHA-256 digest, for
// readers and tools that do not run the site's agents. Run from the repo root:
//   node tools/build_ledger.mjs
import { writeFile } from "node:fs/promises";
import { CLAIMS, STEWARD } from "../docs/js/claims-data.js";
import { Ledger } from "../docs/js/ledger.js";

const claims = [];
for (const claim of CLAIMS) {
  claims.push({ ...claim, digest: await Ledger.digest(claim) });
}
const ledger = {
  profile: "evidence-envelope/0.1",
  steward: STEWARD,
  digest_method: "SHA-256 over the claim's canonical JSON (keys sorted, no whitespace), without the digest field",
  claims: claims,
};
await writeFile(new URL("../docs/claims.json", import.meta.url), `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`Wrote docs/claims.json with ${claims.length} claims.`);
