/**
 * CALIFORNIA LEGISLATIVE CRAWLER
 * EXPANDED BRANCH EXTRACTOR — V1.2
 *
 * INPUT:
 * codesTOCSelected.xhtml?tocCode=CIV
 *
 * OUTPUT:
 * CIV_EXPANDED_BRANCH_URLS.txt
 *
 * FEATURES:
 * - Detects law code
 * - Extracts expanded branch URLs
 * - Preserves heading and navigation parameters
 * - Preserves original link order
 * - Identifies branch type
 * - Removes duplicate URLs
 * - Downloads TXT
 * - Exposes structured records for the crawler
 */

(() => {

  // ==========================================================
  // 1. DETECT LAW CODE
  // ==========================================================

  const pageURL = new URL(location.href);

  const lawCode = (
    pageURL.searchParams.get("tocCode") || ""
  ).trim().toUpperCase();

  const VALID_CODES = new Set(
    `CONS BPC CIV CCP COM CORP EDC ELEC EVID FAM
     FIN FGC FAC GOV HNC HSC INS LAB MVC PEN
     PROB PCC PRC PUC RTC SHC UIC VEH WAT WIC`
      .trim()
      .split(/\s+/)
  );

  if (!VALID_CODES.has(lawCode)) {
    throw new Error("Invalid or missing law code");
  }

  // ==========================================================
  // 2. INITIALIZE RECORD COLLECTION
  // ==========================================================

  const records = [];
  const seen = new Set();

  // ==========================================================
  // 3. IDENTIFY EXPANDED BRANCH LINKS
  // ==========================================================

  const links = document.querySelectorAll(
    'a[href*="codes_displayexpandedbranch.xhtml"]'
  );

  // ==========================================================
  // 4. EXTRACT LINK METADATA
  // ==========================================================

  links.forEach((anchor) => {

    const rawHref = anchor.getAttribute("href");

    if (!rawHref) return;

    let url;

    try {
      url = new URL(rawHref, location.href);
    } catch {
      return;
    }

    // Restrict extraction to the intended endpoint.
    if (
      url.hostname !== "leginfo.legislature.ca.gov" ||
      url.pathname !== "/faces/codes_displayexpandedbranch.xhtml"
    ) {
      return;
    }

    if (url.protocol !== "https:") return;

    // Read code from each link independently.
    const code = (
      url.searchParams.get("tocCode") || ""
    ).trim().toUpperCase();

    if (code !== lawCode) return;

    // Preserve navigation parameters.
    const params = url.searchParams;

    const heading2 = params.get("heading2");

    const division = params.get("division");
    const title = params.get("title");
    const part = params.get("part");
    const chapter = params.get("chapter");
    const article = params.get("article");

    const nodeTreePath = params.get("nodetreepath");

    // Classify the type of branch.
    let branchType = "OTHER";

    if (heading2 !== null) {
      branchType = "HEADING";
    } else if (division !== null && division !== "") {
      branchType = "DIVISION";
    } else if (title !== null && title !== "") {
      branchType = "TITLE";
    } else if (part !== null && part !== "") {
      branchType = "PART";
    } else if (chapter !== null && chapter !== "") {
      branchType = "CHAPTER";
    } else if (article !== null && article !== "") {
      branchType = "ARTICLE";
    }

    // Remove URL fragments without altering query parameters.
    url.hash = "";

    // Prevent duplicate URLs.
    if (seen.has(url.href)) return;

    seen.add(url.href);

    records.push({
      order: records.length + 1,
      lawCode: code,
      branchType,
      heading: anchor.textContent.trim(),
      heading2,
      division,
      title,
      part,
      chapter,
      article,
      nodeTreePath,
      url: url.href
    });

  });

  // ==========================================================
  // 5. EXPORT URL LIST
  // ==========================================================

  const output = records
    .map(record => record.url)
    .join("\n");

  const blob = new Blob(
    [output],
    { type: "text/plain;charset=utf-8" }
  );

  const objectURL = URL.createObjectURL(blob);

  const download = document.createElement("a");

  download.href = objectURL;

  download.download =
    `${lawCode}_EXPANDED_BRANCH_URLS.txt`;

  document.body.appendChild(download);
  download.click();
  download.remove();

  setTimeout(() => {
    URL.revokeObjectURL(objectURL);
  }, 1000);

  // ==========================================================
  // 6. REPORT RESULTS
  // ==========================================================

  console.table(records);

  console.log("Law Code:", lawCode);
  console.log("Expanded Branches:", records.length);

  // Store records for additional crawler stages.
  window.CA_EXPANDED_BRANCH_RECORDS = records;

  return records;

})();
