/**
 * CALIFORNIA LEGAL HIERARCHY CRAWLER — STEP 2 (REFINED)
 * Page: /faces/codesTOCSelected.xhtml?tocCode=CIV
 *
 * Read-only DOM inspector; does not click links or crawl pages.
 * Output: CA_STEP02_<CODE>_TOC_REFINED.txt (plain text containing JSON).
 * Console object: window.CA_STEP02_TOC
 *
 * Improvements over Step 2 v1:
 * - Restricts extraction to the selected Code's TOC form.
 * - Validates link pathname and exact tocCode, not substring alone.
 * - Separates branch URLs from JSF actions and unrelated navigation.
 * - Preserves raw href, query parameters, DOM ancestry, original HTML.
 * - Records source ordering and the site's opaque nodetreepath token.
 * - Checks duplicates, missing labels, cross-Code links and URL errors.
 * - Emits audit/validation warnings; never infers hierarchy from index.
 */
(() => {
  'use strict';

  const VERSION = '2.1';
  const ORIGIN = 'https://leginfo.legislature.ca.gov';
  const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
  const warnings = [];
  const errors = [];

  // -------- 1. Ensure we are inspecting the selected Code TOC page. --------
  const pageURL = new URL(location.href);
  if (pageURL.origin !== ORIGIN ||
      !pageURL.pathname.endsWith('/codesTOCSelected.xhtml')) {
    throw new Error('STEP 2 requires an official codesTOCSelected.xhtml page.');
  }
  const pageCode = pageURL.searchParams.get('tocCode');
  if (!pageCode || !/^[A-Z]{2,5}$/.test(pageCode)) {
    throw new Error('Missing or unexpected tocCode in the page URL.');
  }
  const form = document.querySelector('form#codestreeForm2');
  if (!form) throw new Error('Cannot find form#codestreeForm2.');

  // -------- 2. Resolve the actual Expand All link. --------
  // Do not synthesize this URL if a real link exists; preserve provenance.
  const expandCandidates = [...form.querySelectorAll('a[href]')].filter(a => {
    try {
      const u = new URL(a.getAttribute('href'), pageURL);
      return u.origin === ORIGIN &&
        u.pathname.endsWith('/codedisplayexpand.xhtml') &&
        u.searchParams.get('tocCode') === pageCode;
    } catch { return false; }
  });
  if (expandCandidates.length !== 1) {
    errors.push(`Expected 1 Expand All link, found ${expandCandidates.length}.`);
  }
  const expand = expandCandidates[0] || null;
  const expandedURL = expand ? new URL(expand.getAttribute('href'), pageURL).href : null;

  // -------- 3. Inspect branch anchors only within the TOC list. --------
  const title = normalize(form.querySelector('.treecodetitle')?.textContent);
  if (!title) warnings.push('Code title .treecodetitle was not found or is empty.');

  const listContainers = [...form.querySelectorAll('.codes_toc_list')];
  if (!listContainers.length) errors.push('No .codes_toc_list container found.');
  const allTOCAnchors = [...form.querySelectorAll('.codes_toc_list a[href]')];

  // Return an XPath anchored to a unique HTML id when available.
  // XPath is for inspection only; positional segments can change with the DOM.
  function xpathFor(element) {
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      if (node.id) {
        const idLiteral = node.id.includes("'")
          ? `concat('${node.id.split("'").join("',\"'\",'")}')`
          : `'${node.id}'`;
        parts.unshift(`*[@id=${idLiteral}]`);
        return '//' + parts.join('/');
      }
      const siblings = [...(node.parentElement?.children || [])]
        .filter(el => el.localName === node.localName);
      parts.unshift(`${node.localName}[${siblings.indexOf(node) + 1}]`);
      node = node.parentElement;
    }
    return '/' + parts.join('/');
  }

  // Preserve observable DOM ancestors, but do not equate them to legal parents.
  function ancestry(element) {
    const parents = [];
    for (let p = element.parentElement; p && p !== form; p = p.parentElement) {
      parents.push({
        tag: p.localName,
        id: p.id || null,
        class: typeof p.className === 'string' ? p.className : null
      });
    }
    return parents;
  }

  function paramsObject(url) {
    const object = {};
    for (const [key, value] of url.searchParams) {
      if (Object.hasOwn(object, key)) {
        object[key] = [].concat(object[key], value);
      } else {
        object[key] = value;
      }
    }
    return object;
  }

  const entries = [];
  const rejected = [];
  const seenURL = new Map();
  const seenTreePath = new Map();

  allTOCAnchors.forEach((anchor, sourceIndex) => {
    const rawHref = anchor.getAttribute('href') || '';
    const label = normalize(anchor.textContent);
    let url;
    try {
      url = new URL(rawHref, pageURL);
    } catch (error) {
      rejected.push({ source_index: sourceIndex, label, raw_href: rawHref,
        reason: `Invalid URL: ${error.message}` });
      return;
    }
    const isBranch = url.origin === ORIGIN &&
      url.pathname.endsWith('/codes_displayexpandedbranch.xhtml');
    const linkCode = url.searchParams.get('tocCode');
    if (!isBranch || linkCode !== pageCode) {
      rejected.push({ source_index: sourceIndex, label, raw_href: rawHref,
        reason: !isBranch ? 'Not a statutory branch URL' : `tocCode mismatch: ${linkCode}` });
      return;
    }

    const treePath = url.searchParams.get('nodetreepath');
    const entry = {
      index: entries.length,
      source_index: sourceIndex,
      code: pageCode,
      label,
      url: url.href,
      raw_href: rawHref,
      pathname: url.pathname,
      query: paramsObject(url),
      nodetreepath: treePath,
      heading2: url.searchParams.get('heading2'),
      // Future hierarchy levels may be encoded as query parameters.
      division: url.searchParams.get('division'),
      part: url.searchParams.get('part'),
      title: url.searchParams.get('title'),
      chapter: url.searchParams.get('chapter'),
      article: url.searchParams.get('article'),
      dom: {
        tag: anchor.localName,
        id: anchor.id || null,
        class: typeof anchor.className === 'string' ? anchor.className : null,
        xpath: xpathFor(anchor),
        parent_xpath: anchor.parentElement ? xpathFor(anchor.parentElement) : null,
        ancestry: ancestry(anchor),
        outer_html: anchor.outerHTML
      },
      // The top-level branch listing does not prove deeper parentage.
      hierarchy_parent: null,
      hierarchy_status: 'unresolved_until_expanded_page'
    };

    if (!label) warnings.push(`Empty label: entry ${entry.index}.`);
    if (!treePath) warnings.push(`Missing nodetreepath: entry ${entry.index}.`);
    if (seenURL.has(url.href)) {
      warnings.push(`Duplicate branch URL at ${entry.index}; first at ${seenURL.get(url.href)}.`);
    } else seenURL.set(url.href, entry.index);
    if (treePath) {
      if (seenTreePath.has(treePath)) {
        warnings.push(`Repeated nodetreepath '${treePath}' at ${entry.index}; first at ${seenTreePath.get(treePath)}.`);
      } else seenTreePath.set(treePath, entry.index);
    }
    entries.push(entry);
  });

  // -------- 4. Validate extraction quality; never silently discard issues. --------
  if (!entries.length) errors.push('No valid branch links extracted.');
  if (entries.length !== allTOCAnchors.length) {
    warnings.push(`${allTOCAnchors.length - entries.length} TOC anchors excluded; inspect rejected[].`);
  }
  if (rejected.some(item => item.reason.startsWith('tocCode mismatch'))) {
    errors.push('At least one branch references another Code.');
  }

  const validation = {
    page_valid: true,
    expand_link_matches: expandCandidates.length,
    expand_url_found: Boolean(expandedURL),
    toc_container_count: listContainers.length,
    toc_anchor_count: allTOCAnchors.length,
    branch_entry_count: entries.length,
    unique_branch_url_count: seenURL.size,
    unique_nodetreepath_count: seenTreePath.size,
    rejected_anchor_count: rejected.length,
    warnings,
    errors,
    status: errors.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS'
  };

  const toc = {
    schema_version: VERSION,
    step: 2,
    code: pageCode,
    title,
    source_url: pageURL.href,
    expanded_url: expandedURL,
    captured_at: new Date().toISOString(),
    records_are: 'ordered_top_level_branch_links_not_recursive_descendants',
    entries,
    rejected,
    validation
  };
  window.CA_STEP02_TOC = toc;

  // -------- 5. Export an audit-friendly TXT, including complete JSON data. --------
  const lines = [
    'CALIFORNIA LEGAL HIERARCHY — STEP 2 REFINED',
    `VERSION: ${VERSION}`,
    `CODE: ${pageCode}`,
    `TITLE: ${title}`,
    `SOURCE: ${pageURL.href}`,
    `EXPANDED: ${expandedURL || '(not found)'}`,
    `STATUS: ${validation.status}`,
    `BRANCHES: ${entries.length}`,
    '',
    '=== ORDERED BRANCH INDEX ===',
    ...entries.map(e =>
      `[${String(e.index).padStart(2, '0')}] path=${e.nodetreepath ?? '(none)'} | ${e.label}\n     ${e.url}`
    ),
    '',
    '=== VALIDATION ===',
    JSON.stringify(validation, null, 2),
    '',
    '=== FULL RECORDS (JSON) ===',
    JSON.stringify(toc, null, 2),
    ''
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const objectURL = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectURL;
  link.download = `CA_STEP02_${pageCode}_TOC_REFINED.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectURL), 1500);

  console.log('STEP 2 REFINED:', validation.status, pageCode);
  console.table(entries.map(({index, label, nodetreepath, url}) =>
    ({index, label, nodetreepath, url})));
  console.log('Validation:', validation);
  console.log('Full data: window.CA_STEP02_TOC');
  return toc;
})();
