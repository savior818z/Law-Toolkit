// STEP 7.3 — CROSS-REFERENCE URL EXTRACTION & JSF PROVENANCE
// Browser-only JavaScript. Paste into Edge DevTools on an OPEN
// /faces/codeBillCrossRef.xhtml page. No external libraries.
//
// Scope: inspect the DOM already loaded in your browser. Does NOT fetch, click,
// submit a JSF form, follow bill links, or crawl additional pages.
// Output: one downloadable UTF-8 TXT file containing structured JSON.
// Retains exact display labels, original anchor markup, XPath, CSS locators, JSF parameters,
// canonical Step 6 statute reference (no duplicate statute text or HTML).
// Hidden inputs / JSF ViewState are NOT exported.
// The JSF billVersionSectionId is a site handler parameter, not a real URL.
// All URLs are extracted or constructed with explicit evidence/verification status.
// JSF href="#" does NOT reveal a destination URL. Form action is the POST endpoint.
// A candidate bill URL is marked GENERATED_NOT_VERIFIED, never a proven link.
// Merkle hashing is intentionally deferred.
(async () => {
  'use strict';

  // 1 — Validate the current page. Do not infer content from a different page.
  const page = new URL(location.href);
  if (page.pathname !== '/faces/codeBillCrossRef.xhtml') {
    throw Error('STEP 7: Open a codeBillCrossRef.xhtml page before running.');
  }
  const code = (page.searchParams.get('lawCode') || '').trim().toUpperCase();
  const section = (page.searchParams.get('sectionNum') || '').trim();
  if (!/^[A-Z]{2,5}$/.test(code) || !/^[0-9][\w.]*$/.test(section)) {
    throw Error('STEP 7: Missing or invalid lawCode/sectionNum URL parameters.');
  }
  const authority = `${code}:${section}`;
  const capturedAt = new Date().toISOString();
  const crossrefRoot = document.querySelector('#code_bill_crossref');
  const listForm = document.getElementById('crbillsectionsid');
  if (!crossrefRoot || !listForm) {
    throw Error('STEP 7: Missing #code_bill_crossref or #crbillsectionsid. Inspect the DOM.');
  }
  const compact = value => String(value || '').replace(/\s+/gu, ' ').trim();

  // 2 — Snapshot XPath with stable ID anchors when possible. XPath remains a
  // snapshot locator and can change after the site modifies its DOM.
  function getXPath(el) {
    if (!el || el.nodeType !== 1) return null;
    const path = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node.id && !node.id.includes("'")) {
        path.unshift(`*[@id='${node.id}']`);
        break;
      }
      const siblings = node.parentElement
        ? [...node.parentElement.children].filter(s => s.tagName === node.tagName)
        : [node];
      path.unshift(`${node.tagName.toLowerCase()}[${siblings.indexOf(node) + 1}]`);
    }
    return '//' + path.join('/');
  }

  // 2b — CSS locator: prefer a stable element ID, escape JSF colons properly.
  // When no ID exists, produce a scoped positional path with :nth-of-type.
  // The ID-based locator is stable only while the site preserves that ID.
  function getCSSSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
      const tag = cur.tagName.toLowerCase();
      const siblings = cur.parentElement
        ? [...cur.parentElement.children].filter(x => x.tagName === cur.tagName)
        : [cur];
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(cur) + 1})`);
    }
    return parts.join(' > ');
  }

  // 3 — Clone before sanitizing so the original page remains untouched.
  // No hidden inputs, ViewState values, executable scripts, or inline handlers
  // are placed in the stored HTML snapshot.
  function sanitizedHTML(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('input[type="hidden"], script, noscript, style, iframe')
      .forEach(el => el.remove());
    const elements = [clone, ...clone.querySelectorAll('*')];
    for (const el of elements) {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      }
    }
    return clone.outerHTML;
  }

  // 4 — Extract the *visible printed label* without treating '#' as a bill URL.
  // Example: 20192020 AB1428 Section 1. (Adds) - Chaptered (Stats.2019 Ch.130)
  const labelPattern =
    /^(\d{4})(\d{4})\s+(AB|SB|ACA|SCA|AJR|SJR|ACR|SCR)\s*(\d+(?:-\d+)?)\s+(?:Section|Sec\.)\s*([\d.]+)\s*\((Adds|Amends|Repeals|Enacts|Renumbers|Amended|Added|Repealed)[^)]*\)\s*-\s*(Chaptered|Enrolled|Vetoed|Failed)?\s*\(Stats\.?\s*(\d{4})\s+Ch\.?\s*(\d+)\)/i;

  // 5 — Read the JSF action attributes, but never execute them.
  // Values such as billVersionSectionId are useful navigation evidence.
  function parseJSFParameters(onclick) {
    if (!onclick) return {};
    const params = {};
    const re = /'([^'\\]*(?:\\.[^'\\]*)*)'\s*:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    for (const match of onclick.matchAll(re)) {
      params[match[1]] = match[2];
    }
    return params;
  }

  // 5b — Keep the JSF *action descriptor* separate from bill identity.
  // The page can pass op_statues=2023 even for a 2019 bill entry; this is
  // navigation context, NOT proof that the 2019 bill belongs to 2023.
  function describeJSF(a, parameters) {
    const raw = a.getAttribute('onclick') || '';
    const form = a.closest('form');
    const formId = form?.id || null;
    const handler = /mojarra\.jsfcljs\s*\(/.test(raw)
      ? 'MOJARRA_JSFCLJS' : raw ? 'UNRECOGNIZED_INLINE_HANDLER' : 'NONE';
    const id = parameters.billVersionSectionId || null;
    const navFields = ['lawCode','sectionNum','op_statues','op_chapter',
      'op_section','billVersionSectionId'];
    const navigationContext = Object.fromEntries(
      navFields.map(key => [key, parameters[key] ?? null]));
    return {
      handler_type:handler,
      method:form?.getAttribute('method')?.toUpperCase() || null,
      form_id:formId,
      form_action:form?.getAttribute('action') || null,
      element_id:a.id || null,
      bill_version_section_id:id,
      navigation_context:navigationContext,
      onclick_raw:raw,
      selector_css:getCSSSelector(a),
      selector_xpath:getXPath(a),
      submission_required:handler === 'MOJARRA_JSFCLJS',
      automatically_executed:false,
      viewstate_exported:false
    };
  }

  // 6 — The URL is a *candidate*, not a resolved navigation destination.
  function generatedBillURLs(sessionStart, sessionEnd, billType, billNumber) {
    if (!sessionStart || !sessionEnd || !billType || !/^\d+$/.test(billNumber)) return null;
    // LegInfo uses the biennial session prefix followed by 0 + bill identifier.
    const billId = `${sessionStart}${sessionEnd}0${billType}${billNumber}`;
    const nav = new URL('/faces/billNavClient.xhtml', page.origin);
    const txt = new URL('/faces/billTextClient.xhtml', page.origin);
    nav.searchParams.set('bill_id', billId);
    txt.searchParams.set('bill_id', billId);
    return {leginfo_bill_id: billId, bill_navigation_url: nav.href,
      bill_text_url: txt.href, url_status: 'GENERATED_NOT_VERIFIED'};
  }

  // 6b — Extract URLs while distinguishing source observations from generated URLs.
  // Direct anchors must have an actual href; '#' / javascript: / blank is not a
  // navigable bill URL. The JSF form action is a POST endpoint, not a target page.
  function directURLFromAnchor(anchor) {
    const raw = (anchor.getAttribute('href') || '').trim();
    if (!raw || raw === '#' || raw.startsWith('#') || /^javascript:/i.test(raw)) {
      return {raw_href:raw || null, resolved_url:null,
        status:'NO_DIRECT_URL_JSF_ACTION'};
    }
    try {
      const u = new URL(raw, page.href);
      if (!/^https?:$/.test(u.protocol)) return {
        raw_href:raw, resolved_url:null, status:'UNSUPPORTED_SCHEME'
      };
      return {raw_href:raw, resolved_url:u.href, status:'OBSERVED_HREF_RESOLVED'};
    } catch {
      return {raw_href:raw, resolved_url:null, status:'INVALID_HREF'};
    }
  }

  function formActionURL(anchor) {
    const form = anchor.closest('form');
    const raw = form?.getAttribute('action') || null;
    if (!raw) return {raw_action:null, url:null, status:'NO_FORM_ACTION'};
    try {
      const target = new URL(raw, page.href);
      if (!/^https?:$/.test(target.protocol)) return {
        raw_action:raw, url:null, status:'UNSUPPORTED_SCHEME'
      };
      return {raw_action:raw, url:target.href,
        method:(form.getAttribute('method') || 'GET').toUpperCase(),
        status:'OBSERVED_FORM_ACTION_ENDPOINT_NOT_DESTINATION'};
    } catch { return {raw_action:raw, url:null, status:'INVALID_FORM_ACTION'}; }
  }

  // Reconstruct the canonical current-section URL from observed query values.
  // This URL points to the section page; it is not a historical bill version.
  function canonicalSectionURL() {
    const u = new URL('/faces/codes_displaySection.xhtml', page.origin);
    u.searchParams.set('lawCode', code);
    u.searchParams.set('sectionNum', section);
    return u.href;
  }

  // 7 — Capture ONLY anchors inside the chaptered-bill sections form/table.
  // This excludes site chrome, page menus, and unrelated links.
  const anchors = [...listForm.querySelectorAll('table a')];
  const issues = [];
  const billRecords = anchors.map((a, index) => {
    const label = compact(a.textContent);
    const match = label.match(labelPattern);
    const jsf = parseJSFParameters(a.getAttribute('onclick'));
    const navigationHandlerId = jsf.billVersionSectionId || null;
    const jsfNavigation = describeJSF(a, jsf);
    const directLink = directURLFromAnchor(a);
    const postEndpoint = formActionURL(a);
    if (!match) issues.push({kind:'UNPARSED_BILL_LABEL', index, label});
    if (!navigationHandlerId) issues.push({kind:'MISSING_BILL_VERSION_SECTION_ID', index, label});
    const sessionStart = match ? Number(match[1]) : null;
    const sessionEnd = match ? Number(match[2]) : null;
    const billType = match?.[3]?.toUpperCase() || null;
    const billNumber = match?.[4] || null;
    const chapterSection = match?.[5]?.replace(/\.$/, '') || null;
    const action = match?.[6]?.toUpperCase() || null;
    const status = match?.[7]?.toUpperCase() || null;
    const statsYear = match ? Number(match[8]) : null;
    const chapter = match ? Number(match[9]) : null;
    if (match && sessionEnd !== sessionStart + 1) {
      issues.push({kind:'SESSION_YEAR_RANGE_REVIEW', index, label});
    }
    const bill = generatedBillURLs(sessionStart, sessionEnd, billType, billNumber);
    // Assert field meaning, without conflating shared JSF operational context
    // with the bill's independently printed legislative history.
    const metadataChecks = {
      printed_bill_year:statsYear,
      jsf_operational_statutes_year:jsf.op_statues || null,
      printed_chapter_number:chapter,
      jsf_operational_chapter:jsf.op_chapter || null,
      printed_chapter_section:chapterSection,
      jsf_operational_section:jsf.op_section || null,
      jsf_context_is_bill_identity:false,
      confidence:match ? 'PRINTED_LABEL_OBSERVED' : 'UNPARSED'
    };
    if (jsf.lawCode && jsf.lawCode !== code) {
      issues.push({kind:'JSF_LAW_CODE_MISMATCH', index,
        expected:code, observed:jsf.lawCode});
    }
    if (jsf.sectionNum && jsf.sectionNum !== section) {
      issues.push({kind:'JSF_SECTION_NUMBER_MISMATCH', index,
        expected:section, observed:jsf.sectionNum});
    }
    if (jsfNavigation.handler_type !== 'MOJARRA_JSFCLJS') {
      issues.push({kind:'JSF_HANDLER_REVIEW', index,
        handler_type:jsfNavigation.handler_type});
    }
    // Operational parameters may refer to the currently viewed statute;
    // differences from the historical bill label are NOT extraction errors.
    // Identity excludes capture time, DOM position and volatile JSF element ID.
    const identity = [code, section, sessionStart, billType, billNumber,
      chapterSection, statsYear, chapter, action].join('|');
    return {
      authority_id: authority,
      crossref_key: identity,
      order: index,
      printed_label: label,
      session_start_year: sessionStart,
      session_end_year: sessionEnd,
      bill_type: billType,
      bill_number: billNumber,
      bill_id: billType && billNumber ? `${billType} ${billNumber}` : null,
      chapter_section: chapterSection,
      action,
      legislative_status: status,
      stats_year: statsYear,
      chapter_number: chapter,
      bill_urls: bill,
      extracted_urls: {
        cross_reference_page_url:page.href,
        canonical_statute_url:canonicalSectionURL(),
        observed_anchor:directLink,
        jsf_form_submission_endpoint:postEndpoint,
        generated_candidate_bill_navigation_url:bill?.bill_navigation_url || null,
        generated_candidate_bill_text_url:bill?.bill_text_url || null,
        generated_bill_url_status:bill?.url_status || 'UNAVAILABLE',
        bill_version_direct_url:null,
        bill_version_url_status:'JSF_POST_REQUIRED_NOT_RESOLVED'
      },
      bill_version_section_id: navigationHandlerId,
      jsf_form_id: a.closest('form')?.id || null,
      jsf_element_id: a.id || null,
      jsf_parameters: jsf,
      jsf_navigation: jsfNavigation,
      bill_metadata_vs_jsf_context: metadataChecks,
      href_raw: a.getAttribute('href'),
      resolved_navigation_url: directLink.resolved_url, // NULL for JSF '#'.
      navigation_status: navigationHandlerId ? 'JSF_FORM_SUBMISSION_REQUIRED' : 'UNRESOLVED',
      source_url: page.href,
      xpath: getXPath(a),
      css_selector: getCSSSelector(a),
      original_anchor_html: a.outerHTML,
      confidence: match ? 'PARSED_PRINTED_LABEL' : 'REVIEW',
    };
  });

  // 8 — Deduplicate by semantic identity rather than the session-specific DOM ID.
  // Preserve the first observed occurrence and log any duplicates.
  const unique = new Map();
  for (const record of billRecords) {
    if (unique.has(record.crossref_key)) {
      issues.push({kind:'DUPLICATE_BILL_REFERENCE', key:record.crossref_key});
    } else unique.set(record.crossref_key, record);
  }
  const records = [...unique.values()];

  // 9 — Cross-reference timeline: year precision only. These are statutes years,
  // NOT verified bill introduction, enactment, chaptering, or effective dates.
  const timeline = records.filter(r => r.stats_year !== null).map(r => ({
    crossref_key:r.crossref_key,
    hierarchy_node_id:authority,
    timeline_type:'LEGISLATIVE',
    event_type:r.action,
    year:r.stats_year,
    date:null,
    date_precision:'YEAR',
    bill_id:r.bill_id,
    chapter:r.chapter_number,
    source_url:r.source_url
  })).sort((a,b) => a.year - b.year || a.crossref_key.localeCompare(b.crossref_key));
  const yearIntervals = timeline.slice(1).map((item, i) => ({
    from_event:timeline[i].crossref_key,
    to_event:item.crossref_key,
    calendar_year_difference:item.year - timeline[i].year,
    exact_elapsed_days:null,
    interval_precision:'YEAR_ONLY'
  }));

  // 10 — The cross-reference page displays the current statute AGAIN.
  // Step 6 already owns that text and original HTML, so do NOT duplicate them.
  // Keep only the canonical authority ID and a source locator proving where the
  // cross-reference page showed that statute. This script runs independently
  // even if Step 6 is not loaded into this browser tab.
  const leftHeading = crossrefRoot.querySelector('h4,h5,h6')?.textContent || '';
  const sectionHeading = crossrefRoot.querySelector('h6')?.textContent || '';
  const listTable = listForm.querySelector('table');
  const result = {
    schema_version:'7.3',
    step:'7-cross-reference-chaptered-bills',
    authority_id:authority, code, section,
    captured_at:capturedAt,
    source_url:page.href,
    canonical_section_url:canonicalSectionURL(),
    page_title:document.title,
    source_type:'OPEN_BROWSER_DOM',
    crossref_mode:document.getElementById('codeBillCrossRef:crossRefType')?.value || null,
    source_section:{
      authority_id:authority,
      canonical_record_id:authority,
      canonical_source_step:'6-section-hierarchy-and-statute',
      text_storage:'REFERENCED_FROM_STEP_6',
      // These two labels are metadata only, not a copy of the statutory body.
      label:compact(leftHeading),
      displayed_section_number:compact(sectionHeading),
      cross_reference_page_url:page.href,
      cross_reference_xpath:getXPath(crossrefRoot),
      cross_reference_css_selector:getCSSSelector(crossrefRoot),
      // Reference is logical, not proof that Step 6 was loaded or persisted.
      canonical_record_verified_in_this_run:false
    },
    bill_references:records,
    // Explicit inventory: all discovered or constructed URLs and their origin.
    url_inventory:{
      cross_reference_page:{url:page.href, status:'OBSERVED_BROWSER_LOCATION'},
      canonical_statute:{url:canonicalSectionURL(),
        status:'GENERATED_FROM_OBSERVED_LAWCODE_SECTION'},
      bill_links:records.map(r=>({
        crossref_key:r.crossref_key,
        bill_id:r.bill_id,
        link_text:r.printed_label,
        original_href:r.extracted_urls.observed_anchor.raw_href,
        observed_direct_url:r.extracted_urls.observed_anchor.resolved_url,
        observed_href_status:r.extracted_urls.observed_anchor.status,
        jsf_form_action_url:r.extracted_urls.jsf_form_submission_endpoint.url,
        jsf_form_action_status:r.extracted_urls.jsf_form_submission_endpoint.status,
        jsf_method:r.extracted_urls.jsf_form_submission_endpoint.method || null,
        bill_version_section_id:r.bill_version_section_id,
        bill_version_direct_url:null,
        bill_version_direct_url_status:'JSF_POST_REQUIRED_NOT_RESOLVED',
        generated_bill_navigation_url:r.bill_urls?.bill_navigation_url || null,
        generated_bill_text_url:r.bill_urls?.bill_text_url || null,
        generated_url_status:r.bill_urls?.url_status || 'UNAVAILABLE',
        source_anchor_css:r.css_selector,
        source_anchor_xpath:r.xpath
      }))
    },
    timeline_events:timeline,
    year_intervals:yearIntervals,
    source_table:{
      xpath:getXPath(listTable),
      css_selector:getCSSSelector(listTable),
      sanitized_html:listTable ? sanitizedHTML(listTable) : null,
      visible_rows:listTable?.querySelectorAll('tr').length || 0
    },
    summary:{
      bill_links_observed:anchors.length,
      distinct_bill_references:records.length,
      parsed_bill_references:records.filter(r => r.confidence !== 'REVIEW').length,
      unique_bills:new Set(records.map(r => r.bill_id).filter(Boolean)).size,
      timeline_events:timeline.length,
      warning_count:issues.length
    },
    validation_warnings:issues,
    limitations:[
      'Cross-reference labels are observed DOM data, not independently verified bill texts.',
      'JSF controls with href="#" are not direct navigation destinations.',
      'The observed form action URL is an endpoint, not the resulting bill-version page URL.',
      'The historical bill-version destination cannot be resolved without a JSF navigation response.',
      'Generated bill URLs are candidates and have not been fetched.',
      'Statutes years do not establish exact bill dates or operative dates.',
      'No external pages or bill versions were fetched or crawled.',
      'The statute body is intentionally omitted; resolve authority_id against the Step 6 canonical section record.',
      'JSF operational fields are navigation context, not independent bill metadata.',
      'CSS selectors and XPaths are DOM snapshot locators, not guaranteed persistent identifiers.'
    ]
  };

  // 11 — Make results available for inspection without modifying Step 6 data.
  window.CA_STEP7_CROSS_REFERENCE = result;
  window.CA_STEP7_NAV_DESCRIPTORS = records.map(r => ({
    crossref_key:r.crossref_key, jsf_navigation:r.jsf_navigation
  }));
  console.log('STEP 7.3 — CHAPTERED BILL CROSS-REFERENCES', result.summary);
  console.table(records.map(r => ({
    bill:r.bill_id, session:`${r.session_start_year}-${r.session_end_year}`,
    action:r.action, stats_year:r.stats_year, chapter:r.chapter_number,
    chapter_section:r.chapter_section, bill_version_section_id:r.bill_version_section_id,
    candidate_bill_url:r.bill_urls?.bill_navigation_url || null,
    observed_direct_url:r.extracted_urls.observed_anchor.resolved_url
  })));
  if (issues.length) console.warn('STEP 7 validation review:', issues);

  // 12 — TXT only. A single JSON serialization prevents duplicate in-memory copies.
  const blob = new Blob([JSON.stringify(result, null, 2)],
    {type:'text/plain;charset=utf-8'});
  const objectURL = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectURL;
  link.download = `STEP7_${code}_${section.replace(/[^A-Za-z0-9.-]/g,'_')}_CHAPTERED_BILLS.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectURL), 5000);
  return result;
})();
