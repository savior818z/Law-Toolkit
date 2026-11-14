(() => {
  /**
   * CALIFORNIA LEGISLATIVE SECTION URL EXTRACTOR
   *
   * Source: leginfo.legislature.ca.gov
   * Page: codes_displayText.xhtml
   *
   * Supports 30 law codes.
   *
   * Functions:
   * 1. Identify the current law code.
   * 2. Validate it against the supported code list.
   * 3. Extract section navigation arguments.
   * 4. Construct direct section URLs.
   * 5. Preserve navigation metadata.
   * 6. Replace JavaScript links with direct URLs.
   * 7. Remove duplicate URLs from the export.
   * 8. Download a TXT file.
   * 9. Display extraction results in the console.
   */

  // ==========================================================
  // 1. SUPPORTED CALIFORNIA LAW CODES
  // ==========================================================

  const LAW_CODES = [
    "CONS", "BPC", "CIV", "CCP", "COM",
    "CORP", "EDC", "ELEC", "EVID", "FAM",
    "FIN", "FGC", "FAC", "GOV", "HNC",
    "HSC", "INS", "LAB", "MVC", "PEN",
    "PROB", "PCC", "PRC", "PUC", "RTC",
    "SHC", "UIC", "VEH", "WAT", "WIC"
  ];

  // Exact-match validation.
  const LAW_CODE_REGEX = new RegExp(
    `^(?:${LAW_CODES.join("|")})$`,
    "i"
  );

  // ==========================================================
  // 2. IDENTIFY CURRENT LAW CODE
  // ==========================================================

  const code = document
    .getElementById("codesdistxtnavfrm:codeParam")
    ?.textContent
    .trim()
    .toUpperCase();

  if (!code) {
    throw new Error("Code identifier not found");
  }

  if (!LAW_CODE_REGEX.test(code)) {
    throw new Error(`Unsupported law code: ${code}`);
  }

  // ==========================================================
  // 3. INITIALIZE RECORD STORAGE
  // ==========================================================

  const records = [];
  const seen = new Set();

  // ==========================================================
  // 4. EXTRACT SECTION NAVIGATION LINKS
  // ==========================================================

  const anchors = document.querySelectorAll(
    'a[href^="javascript:submitCodesValues("]'
  );

  anchors.forEach(a => {

    // Read the original JavaScript navigation expression.
    const href = a.getAttribute("href") || "";

    // Extract all six single-quoted arguments.
    const args = [
      ...href.matchAll(/'([^']*)'/g)
    ].map(match => match[1]);

    // Skip unrecognized argument structures.
    if (args.length !== 6) return;

    const [
      section,
      path,
      year,
      chapter,
      billSection,
      uid
    ] = args;

    // Skip missing section identifiers.
    if (!section.trim()) return;

    // ========================================================
    // 5. CONSTRUCT DIRECT SECTION URL
    // ========================================================

    const url = new URL(
      "/faces/codes_displaySection.xhtml",
      location.origin
    );

    url.searchParams.set("lawCode", code);
    url.searchParams.set("sectionNum", section);

    // California Constitution requires article handling.
    if (code === "CONS") {

      const article = document
        .getElementById("codesdistxtnavfrm:articleParam")
        ?.textContent
        .trim() || "";

      url.searchParams.set("article", article);
    }

    // ========================================================
    // 6. DEDUPLICATE SECTION URLS
    // ========================================================

    if (seen.has(url.href)) return;

    seen.add(url.href);

    // ========================================================
    // 7. PRESERVE EXTRACTED METADATA
    // ========================================================

    records.push({
      lawCode: code,
      section,
      url: url.href,
      path,
      year,
      chapter,
      billSection,
      uid
    });

    // ========================================================
    // 8. REPLACE JAVASCRIPT LINK
    // ========================================================

    // Converts the navigation anchor to a direct URL.
    a.href = url.href;

  });

  // ==========================================================
  // 9. EXPORT SECTION URLS AS TXT
  // ==========================================================

  const text = records
    .map(record => record.url)
    .join("\n");

  const blob = new Blob(
    [text],
    { type: "text/plain;charset=utf-8" }
  );

  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = `${code}_SECTION_URLS.txt`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Release temporary memory.
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);

  // ==========================================================
  // 10. REPORT RESULTS
  // ==========================================================

  console.log("California Legislative URL Extraction");

  console.log("Law Code:", code);
  console.log("Supported Codes:", LAW_CODES.length);
  console.log("Navigation Links Found:", anchors.length);
  console.log("Unique Section URLs:", records.length);

  console.table(records);

})();
