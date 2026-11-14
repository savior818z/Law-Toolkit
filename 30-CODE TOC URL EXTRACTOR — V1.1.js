/**
 * CALIFORNIA LEGISLATIVE INFORMATION
 * 30-CODE TOC URL EXTRACTOR — V1.1
 *
 * SOURCE:
 * https://leginfo.legislature.ca.gov/faces/codes.xhtml
 *
 * OUTPUT:
 * CA_30_CODES_TOC_URLS.txt
 */

(() => {

  // 1. Registry of supported California law codes.
  const LAW_CODES = new Set(
    `CONS BPC CIV CCP COM CORP EDC ELEC EVID FAM
     FIN FGC FAC GOV HNC HSC INS LAB MVC PEN
     PROB PCC PRC PUC RTC SHC UIC VEH WAT WIC`
      .trim()
      .split(/\s+/)
  );

  const records = [];
  const seen = new Set();

  // 2. Locate all hyperlinks.
  const anchors = document.querySelectorAll("a[href]");

  for (const anchor of anchors) {

    const href = anchor.getAttribute("href");

    if (!href) continue;

    let url;

    try {
      url = new URL(href, location.href);
    } catch {
      continue;
    }

    // 3. Restrict results to official TOC pages.
    if (url.protocol !== "https:") continue;

    if (
      url.hostname !== "leginfo.legislature.ca.gov"
    ) continue;

    if (
      url.pathname !== "/faces/codesTOCSelected.xhtml"
    ) continue;

    // 4. Extract law code from each individual URL.
    const lawCode = (
      url.searchParams.get("tocCode") || ""
    ).trim().toUpperCase();

    // 5. Validate law code.
    if (!LAW_CODES.has(lawCode)) continue;

    // 6. Remove fragments and duplicates.
    url.hash = "";

    if (seen.has(url.href)) continue;

    seen.add(url.href);

    // 7. Preserve metadata.
    records.push({
      order: records.length + 1,
      lawCode,
      heading: anchor.textContent.trim(),
      url: url.href,
      pageType: "codesTOCSelected.xhtml"
    });
  }

  // 8. Prepare plain-text URL export.
  const text = records
    .map(record => record.url)
    .join("\n");

  const blob = new Blob(
    [text],
    { type: "text/plain;charset=utf-8" }
  );

  const objectURL = URL.createObjectURL(blob);

  // 9. Download.
  const link = document.createElement("a");

  link.href = objectURL;
  link.download = "CA_30_CODES_TOC_URLS.txt";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(
    () => URL.revokeObjectURL(objectURL),
    1000
  );

  // 10. Report extraction statistics.
  console.table(records);

  console.log("Expected Codes:", LAW_CODES.size);
  console.log("Extracted Codes:", records.length);

  const found = new Set(
    records.map(record => record.lawCode)
  );

  const missing = [...LAW_CODES].filter(
    code => !found.has(code)
  );

  console.log("Missing Codes:", missing);

  // 11. Expose records to other crawler scripts.
  window.CA_TOC_RECORDS = records;

  return records;

})();
