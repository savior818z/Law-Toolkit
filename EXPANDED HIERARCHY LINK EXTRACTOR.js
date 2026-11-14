/**
 * ============================================================
 * CALIFORNIA LEGISLATIVE INFORMATION
 * EXPANDED HIERARCHY LINK EXTRACTOR
 * ============================================================
 *
 * SOURCE:
 * https://leginfo.legislature.ca.gov
 *
 * TARGET CONTAINER:
 * #expandedbranchcodesid
 *
 * PURPOSE:
 * Extract navigation links from the expanded statutory
 * hierarchy displayed on the current page.
 *
 * FEATURES:
 * 1. Locate the expanded hierarchy container.
 * 2. Validate container existence.
 * 3. Select all anchor elements containing href attributes.
 * 4. Preserve original document order.
 * 5. Extract visible heading text.
 * 6. Convert relative URLs into absolute URLs.
 * 7. Store results as structured JavaScript objects.
 * 8. Display records in a console table.
 * 9. Report the total number of extracted links.
 * 10. Return the records array.
 *
 * OUTPUT FIELDS:
 * order   = Sequential position in document order.
 * heading = Anchor text.
 * url     = Absolute URL.
 *
 * LIMITATIONS:
 * - Extracts links only from the current DOM.
 * - Does not click collapsed branches.
 * - Does not automatically traverse linked pages.
 * - Does not export a TXT file.
 * - Does not identify hierarchy levels automatically.
 * - Does not remove duplicate links.
 * ============================================================
 */

(() => {

  // ==========================================================
  // STEP 1 — LOCATE THE EXPANDED HIERARCHY CONTAINER
  // ==========================================================

  /**
   * Find the HTML element containing the expanded
   * statutory hierarchy.
   *
   * Target element ID:
   * expandedbranchcodesid
   */

  const root = document.querySelector(
    "#expandedbranchcodesid"
  );


  // ==========================================================
  // STEP 2 — VALIDATE CONTAINER EXISTENCE
  // ==========================================================

  /**
   * Stop execution if the hierarchy container
   * cannot be found.
   *
   * Possible reasons:
   * - The current page does not contain the hierarchy.
   * - The hierarchy has not been expanded.
   * - The website uses a different element ID.
   */

  if (!root) {

    console.error(
      "Expand All container not found."
    );

    return;
  }


  // ==========================================================
  // STEP 3 — COLLECT HIERARCHY LINKS
  // ==========================================================

  /**
   * Select all anchor elements inside the container
   * that contain an href attribute.
   *
   * querySelectorAll returns links in document order.
   *
   * The spread operator converts the NodeList
   * into a standard JavaScript array.
   */

  const links = [
    ...root.querySelectorAll("a[href]")
  ];


  // ==========================================================
  // STEP 4 — EXTRACT LINK RECORDS
  // ==========================================================

  /**
   * Convert each anchor into a structured record.
   *
   * Each record contains:
   *
   * order:
   *   Sequential link position, starting at 1.
   *
   * heading:
   *   Anchor text with surrounding whitespace removed.
   *
   * url:
   *   Absolute URL resolved against the current page.
   */

  const records = links.map((a, index) => ({

    // Preserve the link's original sequence.
    order: index + 1,

    // Extract the visible anchor text.
    heading: a.textContent.trim(),

    /**
     * Resolve the original href against the current URL.
     *
     * Supports:
     * - Relative paths
     * - Root-relative paths
     * - Absolute URLs
     *
     * Note:
     * JavaScript href values are not converted into
     * normal destination URLs by this operation.
     */

    url: new URL(
      a.getAttribute("href"),
      location.href
    ).href

  }));


  // ==========================================================
  // STEP 5 — DISPLAY EXTRACTED RECORDS
  // ==========================================================

  /**
   * Display the extracted hierarchy links
   * as a structured table in Developer Tools.
   */

  console.table(records);


  // ==========================================================
  // STEP 6 — REPORT EXTRACTION COUNT
  // ==========================================================

  /**
   * Report the total number of hierarchy links
   * found within the container.
   */

  console.log(
    "Total hierarchy links:",
    records.length
  );


  // ==========================================================
  // STEP 7 — RETURN STRUCTURED RECORDS
  // ==========================================================

  /**
   * Return the array for inspection or reuse
   * through the browser console.
   *
   * This does not automatically save the results.
   */

  return records;

})();
