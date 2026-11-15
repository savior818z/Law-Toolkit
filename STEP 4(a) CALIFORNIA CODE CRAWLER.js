/**
 * CALIFORNIA CODE CRAWLER — STEP 4A
 * Target hierarchy links on the CURRENT expanded-code page.
 * No database; no network requests; no automated navigation.
 * Output: CA_STEP04_<CODE>_LINK_TARGETS.txt
 * Preserves every anchor record, even if two anchors share a URL.
 * A separate fetch queue deduplicates URLs without losing provenance.
 */
(() => {
  "use strict";
  const root = document.querySelector("#expandedbranchcodesid");
  if (!root) throw Error("Expanded hierarchy container #expandedbranchcodesid not found");

  const page = new URL(location.href);
  const code = (page.searchParams.get("tocCode") || "").trim().toUpperCase();
  if (!code) throw Error("Missing tocCode on expanded hierarchy URL");

  const validDestinations = new Map([
    ["codes_displayText.xhtml", "display_text"],
    ["codes_displayexpandedbranch.xhtml", "expanded_branch"]
  ]);

  function xpath(el) {
    if (!el) return null;
    const parts = [];
    while (el && el.nodeType === 1) {
      if (el.id) {
        const literal = el.id.includes('"')
          ? "'" + el.id.replace(/'/g, "") + "'"
          : '"' + el.id + '"';
        parts.unshift(`//*[@id=${literal}]`);
        break;
      }
      const sameTag = [...el.parentElement?.children || []]
        .filter(n => n.tagName === el.tagName);
      parts.unshift(`${el.tagName.toLowerCase()}[${sameTag.indexOf(el) + 1}]`);
      el = el.parentElement;
    }
    return parts.join("/").replace(/\/\//g, "/");
  }

  // Preserve anchor source order, even when multiple anchors point to one URL.
  const records = [];
  const rejected = [];
  const selector = 'a[href*="codes_displayText.xhtml"], a[href*="codes_displayexpandedbranch.xhtml"]';
  const sourceAnchors = [...root.querySelectorAll(selector)];

  for (const [sourceIndex, a] of sourceAnchors.entries()) {
    const rawHref = a.getAttribute("href") || "";
    let url;
    try { url = new URL(rawHref, location.href); }
    catch { rejected.push({sourceIndex, rawHref, reason:"INVALID_URL"}); continue; }
    const destination = validDestinations.get(url.pathname.split("/").pop());
    const urlCode = url.searchParams.get(destination === "display_text" ? "lawCode" : "tocCode");
    if (url.origin !== location.origin || !destination || urlCode !== code) {
      rejected.push({sourceIndex, rawHref, url:url.href, reason:"OUT_OF_SCOPE_OR_CODE_MISMATCH"});
      continue;
    }
    const textContainer = a.querySelector("div") || a;
    const cssIndent = getComputedStyle(textContainer).marginLeft;
    const label = (textContainer.textContent || a.textContent || "").replace(/\s+/g, " ").trim();
    records.push({
      id:`${code}:target:${sourceIndex + 1}`,
      sourceIndex,
      code,
      label,
      destination,
      url:url.href,
      rawHref,
      parameters:Object.fromEntries(url.searchParams),
      indent_css:cssIndent,
      anchor_xpath:xpath(a),
      parent_xpath:xpath(a.parentElement),
      anchor_html:a.outerHTML
    });
  }

  const targetsByURL = new Map();
  for (const record of records) {
    if (!targetsByURL.has(record.url)) {
      targetsByURL.set(record.url, {
        url:record.url,
        destination:record.destination,
        code,
        first_source_index:record.sourceIndex,
        referenced_by:[]
      });
    }
    targetsByURL.get(record.url).referenced_by.push(record.id);
  }
  const fetchQueue = [...targetsByURL.values()];
  const summary = {
    code,
    source_page:location.href,
    anchors_inspected:sourceAnchors.length,
    records:records.length,
    display_text:records.filter(r => r.destination === "display_text").length,
    expanded_branch:records.filter(r => r.destination === "expanded_branch").length,
    unique_fetch_targets:fetchQueue.length,
    duplicate_url_occurrences:records.length - fetchQueue.length,
    rejected:rejected.length
  };

  const output = {
    schema_version:"4A.1",
    description:"URL target discovery only — no pages fetched",
    summary,
    records,
    fetch_queue:fetchQueue,
    rejected
  };
  window.CA_STEP04_TARGETS = output;
  console.log("STEP 4A — HIERARCHY LINK TARGETS", summary);
  console.table(fetchQueue.map(x => ({destination:x.destination, url:x.url, references:x.referenced_by.length})));

  const blob = new Blob([
    "CALIFORNIA LEGAL HIERARCHY — STEP 4A LINK TARGETS\n",
    JSON.stringify(output, null, 2)
  ], {type:"text/plain;charset=utf-8"});
  const objectURL = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectURL;
  anchor.download = `CA_STEP04_${code}_LINK_TARGETS.txt`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
  return output;
})();
