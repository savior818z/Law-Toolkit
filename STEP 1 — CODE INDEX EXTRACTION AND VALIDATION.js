
/**
 * ============================================================
 * CALIFORNIA LEGAL HIERARCHY CRAWLER
 * STEP 1 — CODE INDEX EXTRACTION AND VALIDATION
 * ============================================================
 *
 * SOURCE:
 * https://leginfo.legislature.ca.gov/faces/codes.xhtml
 *
 * DESCRIPTION:
 * Extracts California Code links from the official
 * California Legislative Information index page.
 *
 * For each Code, the script:
 *
 * 1. Extracts its identifier (CIV, CCP, PEN, etc.).
 * 2. Extracts the displayed Code title.
 * 3. Identifies the containing DOM column.
 * 4. Generates a CSS selector.
 * 5. Validates the CSS selector against the original element.
 * 6. Generates an XPath expression.
 * 7. Validates the XPath against the original element.
 * 8. Preserves the Code's Table of Contents URL.
 * 9. Records validation results.
 * 10. Exports the records to a TXT file.
 *
 * EXPECTED RESULT:
 * 30 California Code records.
 *
 * OUTPUT:
 * CA_PAGE01_MATCH_ALL.txt
 *
 * BROWSER OBJECT:
 * window.CA_MATCH_ALL
 *
 * SCOPE:
 * Page 1 only.
 *
 * This script does not navigate to other pages,
 * extract statutory sections, or modify page content.
 * ============================================================
 */

(() => {
  "use strict";

  // ==========================================================
  // 1. LOCATE THE CALIFORNIA CODE INDEX CONTAINER
  // ==========================================================

  /**
   * The HTML element with ID "codestocheader" contains
   * the California Code index links.
   *
   * querySelector() returns the first matching element.
   */

  const root = document.querySelector("#codestocheader");

  /**
   * Stop execution if the expected container is absent.
   *
   * This prevents accidentally processing another page.
   */

  if (!root) {
    throw new Error(
      "Page 1 code container not found."
    );
  }

  // ==========================================================
  // 2. COLLECT CALIFORNIA CODE LINKS
  // ==========================================================

  /**
   * Locate anchor elements whose href contains:
   *
   * codesTOCSelected.xhtml
   *
   * These anchors represent links to individual
   * California Code Tables of Contents.
   *
   * Example:
   *
   * /faces/codesTOCSelected.xhtml?tocCode=CIV
   *
   * querySelectorAll() returns a NodeList.
   *
   * The spread operator converts it into an array.
   */

  const anchors = [
    ...root.querySelectorAll(
      'a[href*="codesTOCSelected.xhtml"]'
    )
  ];

  // ==========================================================
  // 3. PROCESS EVERY CODE LINK
  // ==========================================================

  /**
   * map() transforms each anchor into a structured record.
   *
   * anchor:
   *   Current HTML anchor element.
   *
   * index:
   *   Zero-based position in the anchors array.
   *
   * The output is stored in the records array.
   */

  const records = anchors.map((anchor, index) => {

    // --------------------------------------------------------
    // 3.1 NORMALIZE THE ANCHOR URL
    // --------------------------------------------------------

    /**
     * Convert the anchor's URL into a URL object.
     *
     * This provides access to:
     *
     * - protocol
     * - hostname
     * - pathname
     * - search parameters
     * - complete URL
     */

    const url = new URL(
      anchor.href,
      location.href
    );

    // --------------------------------------------------------
    // 3.2 EXTRACT THE CODE IDENTIFIER
    // --------------------------------------------------------

    /**
     * Read the tocCode query parameter.
     *
     * Example:
     *
     * ?tocCode=CIV
     *
     * Result:
     *
     * code = "CIV"
     */

    const code = url.searchParams.get("tocCode");

    // --------------------------------------------------------
    // 3.3 GENERATE THE CSS SELECTOR
    // --------------------------------------------------------

    /**
     * Construct a selector targeting anchors under
     * the California Code index container.
     *
     * Example:
     *
     * #codestocheader a[href*="tocCode=CIV"]
     *
     * IMPORTANT:
     * The CSS selector uses substring matching.
     *
     * Exact code identity is verified separately
     * by comparing the parsed tocCode parameter.
     */

    const cssSelector =
      `#codestocheader a[href*="tocCode=${code}"]`;

    // --------------------------------------------------------
    // 3.4 EXECUTE AND VALIDATE CSS MATCHING
    // --------------------------------------------------------

    /**
     * Step A:
     * Find elements matching the generated CSS selector.
     *
     * Step B:
     * Parse each candidate's URL.
     *
     * Step C:
     * Retain only candidates with an exact tocCode match.
     *
     * This avoids relying exclusively on substring matching.
     */

    const cssMatches = [
      ...document.querySelectorAll(cssSelector)
    ].filter(candidateAnchor => {

      const candidate = new URL(
        candidateAnchor.href,
        location.href
      );

      return (
        candidate.searchParams.get("tocCode") === code
      );

    });

    // --------------------------------------------------------
    // 3.5 DEFINE THE XPATH EXPRESSION
    // --------------------------------------------------------

    /**
     * This XPath selects Table of Contents anchors
     * beneath the California Code index container.
     *
     * It is a general XPath expression.
     *
     * Exact Code matching occurs in the next operation.
     */

    const xpath =
      '//*[@id="codestocheader"]' +
      '//a[contains(@href,"codesTOCSelected.xhtml")]';

    // --------------------------------------------------------
    // 3.6 EXECUTE THE XPATH QUERY
    // --------------------------------------------------------

    /**
     * document.evaluate() executes XPath expressions.
     *
     * ORDERED_NODE_SNAPSHOT_TYPE:
     *
     * Returns a snapshot of matching nodes
     * in document order.
     */

    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    // Store Code-specific XPath matches.

    const xpathMatches = [];

    // --------------------------------------------------------
    // 3.7 FILTER XPATH RESULTS BY EXACT CODE
    // --------------------------------------------------------

    /**
     * Loop through the XPath result snapshot.
     *
     * Extract the tocCode from each matching anchor.
     *
     * Retain only anchors whose tocCode exactly
     * equals the current Code identifier.
     */

    for (
      let i = 0;
      i < result.snapshotLength;
      i++
    ) {

      const candidate = result.snapshotItem(i);

      const candidateURL = new URL(
        candidate.href,
        location.href
      );

      if (
        candidateURL.searchParams.get("tocCode") === code
      ) {
        xpathMatches.push(candidate);
      }
    }

    // --------------------------------------------------------
    // 3.8 IDENTIFY THE DOM COLUMN
    // --------------------------------------------------------

    /**
     * California Codes are displayed in four groups:
     *
     * 1. Constitution
     * 2. Left column
     * 3. Middle column
     * 4. Right column
     *
     * closest() traverses the current anchor's ancestors
     * until it finds a matching container.
     */

    const column = anchor.closest(
      ".codes_const, " +
      ".codesIndexTblLeftdiv, " +
      ".codesIndexTblMiddiv, " +
      ".codesIndexTblRightdiv"
    );

    // --------------------------------------------------------
    // 3.9 BUILD THE STRUCTURED CODE RECORD
    // --------------------------------------------------------

    /**
     * Each record contains:
     *
     * id:
     *   Sequential record number.
     *
     * code:
     *   California Code identifier.
     *
     * title:
     *   Visible anchor text with whitespace normalized.
     *
     * containerClass:
     *   CSS class of the containing column.
     *
     * cssSelector:
     *   Generated CSS selector.
     *
     * xpath:
     *   General XPath expression.
     *
     * cssMatches:
     *   Number of exact-Code CSS matches.
     *
     * xpathMatches:
     *   Number of exact-Code XPath matches.
     *
     * cssValid:
     *   True if exactly one CSS match identifies
     *   the original anchor.
     *
     * xpathValid:
     *   True if exactly one XPath-filtered match identifies
     *   the original anchor.
     *
     * tocURL:
     *   Original Code Table of Contents URL.
     */

    return {

      id: index + 1,

      code: code,

      title: anchor.textContent
        .replace(/\s+/g, " ")
        .trim(),

      containerClass: column?.className || "",

      cssSelector: cssSelector,

      xpath: xpath,

      cssMatches: cssMatches.length,

      xpathMatches: xpathMatches.length,

      cssValid:
        cssMatches.length === 1 &&
        cssMatches[0] === anchor,

      xpathValid:
        xpathMatches.length === 1 &&
        xpathMatches[0] === anchor,

      tocURL: url.href

    };

  });

  // ==========================================================
  // 4. CALCULATE VALIDATION STATISTICS
  // ==========================================================

  /**
   * Generate a summary describing:
   *
   * - Total Code records
   * - Number passing CSS validation
   * - Number passing XPath validation
   * - Code identifiers failing either validation
   */

  const summary = {

    total: records.length,

    cssPassed: records.filter(
      record => record.cssValid
    ).length,

    xpathPassed: records.filter(
      record => record.xpathValid
    ).length,

    failed: records.filter(
      record =>
        !record.cssValid ||
        !record.xpathValid
    ).map(
      record => record.code
    )

  };

  // ==========================================================
  // 5. DISPLAY RESULTS IN THE BROWSER CONSOLE
  // ==========================================================

  /**
   * console.table():
   *   Displays the records in tabular form.
   *
   * console.log():
   *   Displays the validation summary.
   */

  console.table(records);

  console.log(
    "MATCH ALL SUMMARY:",
    summary
  );

  // ==========================================================
  // 6. EXPOSE RESULTS FOR ADDITIONAL PROCESSING
  // ==========================================================

  /**
   * Save results on window.CA_MATCH_ALL.
   *
   * This enables subsequent scripts to access
   * the records without repeating extraction.
   *
   * Example:
   *
   * window.CA_MATCH_ALL.records
   *
   * window.CA_MATCH_ALL.summary
   */

  window.CA_MATCH_ALL = {
    summary,
    records
  };

  // ==========================================================
  // 7. GENERATE THE TXT REPORT
  // ==========================================================

  /**
   * Build a text report containing:
   *
   * - Report heading
   * - Source page URL
   * - Validation summary
   * - All Code records
   *
   * JSON.stringify(..., null, 2):
   *
   * Formats objects with two-space indentation
   * while retaining a plain-text output format.
   */

  const report = [

    "CALIFORNIA CODES — PAGE 1 MATCH ALL",

    `PAGE: ${location.href}`,

    "",

    JSON.stringify(summary, null, 2),

    "",

    JSON.stringify(records, null, 2)

  ].join("\n");

  // ==========================================================
  // 8. CREATE A DOWNLOADABLE TXT FILE
  // ==========================================================

  /**
   * Blob:
   *   Represents the report as a file-like object.
   *
   * text/plain:
   *   Specifies plain-text content.
   *
   * charset=utf-8:
   *   Supports Unicode characters.
   */

  const blob = new Blob(
    [report],
    {
      type: "text/plain;charset=utf-8"
    }
  );

  // ----------------------------------------------------------
  // 8.1 CREATE A TEMPORARY DOWNLOAD LINK
  // ----------------------------------------------------------

  const link = document.createElement("a");

  /**
   * URL.createObjectURL():
   *
   * Creates a temporary browser URL
   * referencing the Blob.
   */

  const objectURL = URL.createObjectURL(blob);

  // ----------------------------------------------------------
  // 8.2 CONFIGURE THE DOWNLOAD
  // ----------------------------------------------------------

  link.href = objectURL;

  link.download = "CA_PAGE01_MATCH_ALL.txt";

  // ----------------------------------------------------------
  // 8.3 START THE DOWNLOAD
  // ----------------------------------------------------------

  link.click();

  // ----------------------------------------------------------
  // 8.4 RELEASE THE TEMPORARY OBJECT URL
  // ----------------------------------------------------------

  /**
   * Revoke the temporary URL after one second.
   *
   * This prevents the temporary URL from remaining
   * allocated indefinitely.
   */

  setTimeout(
    () => URL.revokeObjectURL(objectURL),
    1000
  );

})();
