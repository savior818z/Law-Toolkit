// STEP 6.6.1 — INDIVIDUAL STATUTORY SECTION + OPTIONAL SEVEN-TRACK VIEWER + NINE INDEXES
// Paste into Edge DevTools on an opened California codes_displaySection.xhtml page.
// Creates a single UTF-8 TXT file containing JSON. No fetch, navigation, or JSF submission.
// Preserves the section, all original paragraph HTML/XPaths, hierarchy notes, and bill URLs.
// Excludes JSF ViewState and other hidden form inputs from the exported section HTML.
// IMPORTANT: Subdivision structure is inferred from textual labels, with explicit warnings
// for uncertain numbering; statutory text is never silently rewritten.
// FIX 1: Display subdivision markers once (the original statutory text is unchanged).
// FIX 2: Separate the observed source URL from an independently verified navigation URL.
// UPGRADE: one canonical event registry, nine derived indexes, OPTIONAL seven-track SVG viewer,
//          stable event keys, temporal distance, and as-of analysis.
// Browser JavaScript only: no Java runtime, npm, CDN, fetch, or third-party libraries.
// Timeline dates preserve YEAR vs DAY precision; historical validity is never invented.
// Bitemporal safety: observation timestamp is NOT proof of legal validity intervals.
// Source URLs refer to the inspected statutory page, NOT individual heading destinations.
(() => {
  'use strict';

  // 1 — Validate the observed page and its stable content root.
  const page = new URL(location.href);
  if (page.pathname !== '/faces/codes_displaySection.xhtml') {
    throw Error('Open a codes_displaySection.xhtml page first.');
  }
  const code = (page.searchParams.get('lawCode') || '').toUpperCase();
  const section = page.searchParams.get('sectionNum') || '';
  if (!/^[A-Z]{2,5}$/.test(code) || !/^[0-9][A-Za-z0-9.]*$/.test(section)) {
    throw Error('Missing or unexpected lawCode/sectionNum in page URL.');
  }
  const root = document.querySelector('#single_law_section');
  if (!root) throw Error('Missing #single_law_section');
  const norm = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const xpath = el => {
    if (!el) return null;
    const parts = [];
    for (let n = el; n?.nodeType === 1; n = n.parentElement) {
      if (n.id && !n.id.includes("'")) {
        parts.unshift(`*[@id='${n.id}']`);
        break;
      }
      const siblings = n.parentElement
        ? [...n.parentElement.children].filter(x => x.tagName === n.tagName) : [n];
      parts.unshift(`${n.tagName.toLowerCase()}[${siblings.indexOf(n) + 1}]`);
    }
    return '//' + parts.join('/');
  };
  const canonical = new URL('/faces/codes_displaySection.xhtml', page.origin);
  canonical.searchParams.set('lawCode', code);
  canonical.searchParams.set('sectionNum', section);
  const authority = `${code}:${section}`;

  // 2 — Keep structural HTML exactly as represented in the opened DOM, but strip
  // volatile inputs and executable content from the *export copy*. Never mutate the page.
  function cleanHTML(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('input[type="hidden"], input[name="javax.faces.ViewState"], script, noscript')
      .forEach(n => n.remove());
    return clone.outerHTML;
  }

  // 3 — Extract heading nodes in DOM order; inspect labels, not just h4/h5 tags.
  // Hierarchy levels on this site may skip a kind or reuse the same HTML heading tag.
  const headingElements = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const headingPattern = /^(DIVISION|PART|TITLE|CHAPTER|ARTICLE)\s+([0-9A-Za-z.]+)(?:\s|$)/i;
  const headings = headingElements.map((el, index) => ({
    index, tag: el.tagName.toLowerCase(), text: norm(el),
    xpath: xpath(el), html: el.outerHTML
  }));
  const hierarchyOrder = {DIVISION: 1, PART: 2, TITLE: 3, CHAPTER: 4, ARTICLE: 5, SECTION: 6};
  const hierarchyNodes = [{
    id: code, parent_id: null, kind: 'CODE', number: code, label: `California Code ${code}`,
    depth: 0, source_url: canonical.href, full_url: canonical.href,
    navigation_url: null, navigation_url_status: 'NOT_RESOLVED', xpath: null, original_html: null,
    inferred: false, issues: []
  }];
  const ancestorStack = [{id: code, rank: 0}];
  for (const h of headings) {
    const m = h.text.match(headingPattern);
    const isSection = h.tag === 'h6' && h.text.replace(/\s/g, '').replace(/\u00a0/g, '') === section;
    if (!m && !isSection) continue;
    const kind = isSection ? 'SECTION' : m[1].toUpperCase();
    const number = isSection ? section : m[2];
    const rank = hierarchyOrder[kind];
    while (ancestorStack.length > 1 && ancestorStack[ancestorStack.length - 1].rank >= rank) ancestorStack.pop();
    const parent = ancestorStack[ancestorStack.length - 1];
    const id = isSection ? authority : `${parent.id}/${kind}:${number}`;
    const node = {
      id, parent_id: parent.id, kind, number, label: h.text,
      depth: ancestorStack.length, source_url: canonical.href, full_url: canonical.href,
      // A heading appearing on the section page does not prove a separate navigable URL.
      navigation_url: isSection ? canonical.href : null,
      navigation_url_status: isSection ? 'CANONICAL_SECTION_URL' : 'NOT_RESOLVED',
      xpath: h.xpath, original_html: h.html, inferred: false, issues: []
    };
    hierarchyNodes.push(node);
    ancestorStack.push({id, rank});
  }
  const sectionNode = hierarchyNodes.find(n => n.kind === 'SECTION');
  if (!sectionNode) throw Error('The displayed section heading does not match the URL; inspect manually.');

  // 4 — Preserve all paragraphs individually and parse *prefixes* only.
  // (a)-(z) are alphabetic subdivisions; (1)-(999) are numeric subparts;
  // (A)-(Z) commonly nest below numeric clauses. Actual legal numbering can
  // be nonstandard, so unresolved prefixes are flagged rather than fabricated.
  const paragraphs = [...root.querySelectorAll('p')].map((el, index) => ({
    index, text: norm(el), xpath: xpath(el), html: el.outerHTML,
    style: el.getAttribute('style') || null
  }));
  const firstLabel = t => t.match(/^\(([a-zA-Z]|\d{1,3}|[ivxlcdmIVXLCDM]{1,8})\)(?=\s|\S)/)?.[1] || null;
  const alphaIndex = c => c.toLowerCase().charCodeAt(0) - 96;
  // Determine level using predecessor / parent context, not a global fixed
  // mapping: '(i)' can be a letter subdivision or a Roman subsubdivision.
  const subdivisionNodes = [];
  const open = []; // current path of labeled subdivisions
  let lastTopLetter = 0;
  const warnings = [];

  for (const p of paragraphs) {
    const label = firstLabel(p.text);
    if (!label) {
      subdivisionNodes.push({
        id: `${authority}:P${p.index + 1}`, parent_id: authority,
        kind: 'UNNUMBERED_PARAGRAPH', marker: null, depth: 1,
        order: p.index, text: p.text, xpath: p.xpath, original_html: p.html,
        source_url: canonical.href, full_url: canonical.href,
        navigation_url: null, navigation_url_status: 'NOT_RESOLVED',
        confidence: 'DOM_TEXT', issues: []
      });
      continue;
    }
    const issues = [];
    let level;
    let kind;
    if (/^\d+$/.test(label)) {
      kind = 'NUMBER'; level = 2;
      if (!open.some(n => n.level === 1)) {
        issues.push('number_without_letter_parent');
        level = 1; // conservatively attach to statute instead of fake parent
      }
    } else if (/^[A-Z]$/.test(label)) {
      kind = 'UPPER_ALPHA'; level = open.some(n => n.level === 2) ? 3 : 1;
      if (level === 1) issues.push('uppercase_without_number_parent');
    } else if (/^[ivxlcdm]{2,8}$/.test(label) ||
        (/^[ivxlcdm]$/.test(label) && open.some(n => n.level >= 3))) {
      kind = 'ROMAN'; level = 4;
      if (!open.some(n => n.level === 3)) {
        issues.push('roman_without_upper_alpha_parent');
        level = open.length ? Math.min(4, open[open.length - 1].level + 1) : 1;
      }
    } else {
      kind = 'LOWER_ALPHA'; level = 1;
      // Lowercase (i) is usually the 9th sibling when the alpha run reached (h).
      if (label.toLowerCase() === 'i' && lastTopLetter < 8 && open.some(n => n.level >= 3)) {
        kind = 'ROMAN'; level = 4;
      } else {
        lastTopLetter = alphaIndex(label);
      }
    }
    while (open.length && open[open.length - 1].level >= level) open.pop();
    const nearest = open.length ? open[open.length - 1] : null;
    if (level > 1 && (!nearest || nearest.level !== level - 1)) {
      issues.push('missing_expected_parent_level');
    }
    const parentId = nearest ? nearest.id : authority;
    const id = `${authority}:P${p.index + 1}:${label}`;
    const node = {
      id, parent_id: parentId, kind: 'SUBDIVISION', marker: `(${label})`,
      label_type: kind, depth: level, order: p.index,
      text: p.text, xpath: p.xpath, original_html: p.html,
      source_url: canonical.href, full_url: canonical.href,
      navigation_url: null, navigation_url_status: 'NOT_RESOLVED',
      confidence: issues.length ? 'REVIEW' : 'PREFIX_AND_SEQUENCE_INFERRED', issues
    };
    subdivisionNodes.push(node);
    if (issues.length) warnings.push({id, issues});
    open.push({...node, level});
  }

  // 5 — Legislative notes can appear as <i> children outside paragraphs.
  // Keep source note HTML/XPath and resolve only explicitly printed bill IDs.
  const notePattern = /\b(?:Added|Amended|Repealed|Enacted)\s+by\s+Stats\.|\bStats\.\s*\d{4}\s*,\s*Ch\./i;
  const noteElements = [...root.querySelectorAll('i,em,p')].filter(el =>
    notePattern.test(norm(el)) && !(el.matches('p') && [...el.querySelectorAll('i,em')]
      .some(child => notePattern.test(norm(child))))
  );
  const legislativeNotes = noteElements.map(el => {
    const text = norm(el);
    const bill = text.match(/\b(AB|SB|ACA|SCA|AJR|SJR|ACR|SCR)\s*(\d+)\b/i);
    const stats = text.match(/Stats\.\s*(\d{4})\s*,\s*Ch\.\s*(\d+)\s*,\s*Sec\.\s*([\d.]+)/i);
    const year = stats ? +stats[1] : null;
    const first = year >= 1993 ? (year % 2 ? year : year - 1) : null;
    const billId = bill ? `${bill[1].toUpperCase()} ${bill[2]}` : null;
    const leginfoId = first && bill ? `${first}${first + 1}0${bill[1].toUpperCase()}${bill[2]}` : null;
    const urls = leginfoId ? ['billNavClient.xhtml', 'billTextClient.xhtml'].map(path => {
      const u = new URL(`/faces/${path}`, page.origin);
      u.searchParams.set('bill_id', leginfoId);
      return u.href;
    }) : [null, null];
    return {
      text, xpath: xpath(el), original_html: el.outerHTML,
      bill_id: billId, stats_year: stats?.[1] || null, chapter: stats?.[2] || null,
      bill_section: stats?.[3] || null,
      legislative_session: first ? `${first}-${first + 1}` : null,
      leginfo_bill_id: leginfoId, bill_navigation_url: urls[0], bill_text_url: urls[1],
      bill_url_status: leginfoId ? 'GENERATED_NOT_VERIFIED' : 'UNRESOLVED',
      // Match the nearest preceding heading node without assuming fixed DOM nesting.
      parent_heading_id: (() => {
        const matching = headings.filter(h => {
          const hn = headingElements[h.index];
          return !!hn && !!(hn.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        const nearest = matching.at(-1);
        return nearest ? hierarchyNodes.find(n => n.xpath === nearest.xpath)?.id || null : null;
      })()
    };
  });

  // 5A — TEMPORAL METADATA PARSER (Java-friendly event rows).
  // Each legislative note becomes its OWN event linked to its appropriate hierarchy node.
  // A heading amendment must NEVER be represented as an amendment of the section itself.
  // Capture year, chapter, bill, effective date and operative date ONLY when present in text.
  // A biennial session calculated from a year is an INFERENCE, not a verified bill session.
  const captureTimestamp = new Date().toISOString();
  const monthNumber = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };
  function isoDateFromText(text) {
    // Supports explicitly written month/day/year; no invented January 1 defaults.
    const m = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
    if (!m) return null;
    const year = Number(m[3]), month = monthNumber[m[1].toLowerCase()], day = Number(m[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
  }
  function extractLabeledDate(text, labelPattern) {
    const m = text.match(new RegExp(`\\b(?:${labelPattern})\\s+(?:on\\s+)?(?:as\\s+of\\s+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4})`, 'i'));
    return m ? isoDateFromText(m[1]) : null;
  }
  function classifyLegislativeNote(text) {
    if (/\brepealed\b/i.test(text)) return 'REPEALED';
    if (/\bamended\b/i.test(text)) return 'AMENDED';
    if (/\badded\b/i.test(text)) return 'ADDED';
    if (/\benacted\b/i.test(text)) return 'ENACTED';
    return 'UNCLASSIFIED';
  }
  // Stable deduplication identity is based on legal content, NOT capture order or time.
  // Keep the complete key as well as a short portable event_id; never assume hashes
  // are guaranteed unique. Downstream SQLite should enforce UNIQUE(event_key).
  function stableEventKey({node, type, year, chapter, chapterSection}) {
    return [node || 'UNKNOWN_NODE', type || 'UNKNOWN_TYPE',
      year == null ? 'UNKNOWN_YEAR' : String(year),
      chapter == null ? 'UNKNOWN_CHAPTER' : String(chapter),
      chapterSection || 'UNKNOWN_SECTION'].map(v => encodeURIComponent(v)).join('|');
  }
  function fnv1a64(text) {
    // Pure JS deterministic 64-bit FNV-1a; no network, cryptography or async work.
    let hash = 0xcbf29ce484222325n;
    const bytes = new TextEncoder().encode(text);
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
  }
  const temporalEvents = legislativeNotes.map((n, index) => {
    const statsYear = n.stats_year == null ? null : Number(n.stats_year);
    // 1993+ standard two-year session estimate; cannot verify from a citation alone.
    const sessionStart = statsYear !== null && statsYear >= 1993
      ? (statsYear % 2 === 1 ? statsYear : statsYear - 1) : null;
    const eventType = classifyLegislativeNote(n.text);
    const effectiveDate = extractLabeledDate(n.text, 'effective(?:\\s+on)?');
    const operativeDate = extractLabeledDate(n.text, 'operative(?:\\s+on)?');
    const repealDate = extractLabeledDate(n.text, 'repealed(?:\\s+on)?|repeal\\s+date');
    const sunsetDate = extractLabeledDate(n.text, 'sunset(?:\\s+date)?|expires?(?:\\s+on)?');
    const chapterSection = n.bill_section ? n.bill_section.replace(/\.$/, '') : null;
    const eventKey = stableEventKey({node: n.parent_heading_id, type: eventType,
      year: statsYear, chapter: n.chapter == null ? null : Number(n.chapter),
      chapterSection});
    const validFrom = null; // requires source-verified version-level legal validity
    const validTo = null;
    return {
      // Record order is retained solely for display; event_id survives recaptures.
      capture_note_index: index,
      event_key: eventKey,
      event_id: `EVT-${fnv1a64(eventKey)}`,
      authority_id: authority,
      hierarchy_node_id: n.parent_heading_id || null,
      event_type: eventType,
      stats_year: statsYear,
      session_start_year: sessionStart,
      session_end_year: sessionStart === null ? null : sessionStart + 1,
      session_status: sessionStart === null ? 'UNKNOWN' : 'INFERRED_FROM_STATS_YEAR',
      chapter_number: n.chapter == null ? null : Number(n.chapter),
      chapter_section: chapterSection,
      bill_id: n.bill_id || null,
      leginfo_bill_id: n.leginfo_bill_id || null,
      bill_navigation_url: n.bill_navigation_url || null,
      bill_text_url: n.bill_text_url || null,
      bill_url_status: n.bill_url_status,
      effective_date: effectiveDate,
      operative_date: operativeDate,
      repeal_date: repealDate,
      sunset_date: sunsetDate,
      valid_from: validFrom,
      valid_to_exclusive: validTo,
      valid_time_status: 'NOT_VERIFIED',
      observed_at: captureTimestamp, // transaction observation, not legal effective date
      recorded_from: captureTimestamp,
      recorded_to_exclusive: null,
      record_time_status: 'CAPTURED_NOT_DATABASE_COMMITTED',
      source_url: canonical.href,
      source_xpath: n.xpath,
      source_note_text: n.text,
      original_note_html: n.original_html,
      warnings: [
        ...(sessionStart === null ? ['session_not_inferred'] : ['session_inferred_not_verified']),
        ...(n.parent_heading_id ? [] : ['hierarchy_parent_unresolved'])
      ]
    };
  });

  // 5B — CLASSIFY TEMPORAL WARNINGS SEPARATELY FROM HIERARCHY ERRORS.
  // Inferred sessions and unknown years are quality/coverage warnings, NOT parser
  // failures. Group warnings for clear UI and Java ingestion.
  const warningSeverity = {
    session_inferred_not_verified: 'INFO',
    session_not_inferred: 'INFO',
    hierarchy_parent_unresolved: 'WARNING',
    duplicate_event_key_in_capture: 'WARNING'
  };
  const seenEventKeys = new Map();
  for (const event of temporalEvents) {
    const prev = seenEventKeys.get(event.event_key);
    if (prev) {
      event.warnings.push('duplicate_event_key_in_capture');
      prev.warnings.push('duplicate_event_key_in_capture');
    } else {
      seenEventKeys.set(event.event_key, event);
    }
  }
  const temporalWarnings = temporalEvents.flatMap(event =>
    [...new Set(event.warnings)].map(code => ({
      event_id: event.event_id, event_key: event.event_key,
      hierarchy_node_id: event.hierarchy_node_id,
      code, severity: warningSeverity[code] || 'WARNING'
    }))
  );
  const temporalValidation = {
    event_count: temporalEvents.length,
    unique_event_keys: seenEventKeys.size,
    warning_count: temporalWarnings.length,
    warnings_by_code: Object.fromEntries(
      [...new Set(temporalWarnings.map(w => w.code))].sort().map(code =>
        [code, temporalWarnings.filter(w => w.code === code).length])),
    warnings_by_severity: Object.fromEntries(
      ['INFO','WARNING','ERROR'].map(level =>
        [level, temporalWarnings.filter(w => w.severity === level).length])),
    warnings: temporalWarnings
  };

  // 5C — THREE TEMPORAL VIEWS. A legal event is usually known only by Stats YEAR;
  // do NOT label it as January 1. A separate effective-date milestone may have
  // DAY precision. Every timeline retains the affected hierarchy node and source.
  // Timelines are useful to JavaFX, Java Streams, and indexed SQLite tables.
  const timelineEvents = [];
  for (const event of temporalEvents) {
    timelineEvents.push({
      timeline_id: `${event.event_id}:LEGISLATIVE`,
      timeline_type: 'LEGISLATIVE_EVENT',
      event_id: event.event_id, event_key: event.event_key,
      hierarchy_node_id: event.hierarchy_node_id,
      action: event.event_type, date_precision: event.stats_year == null ? 'UNKNOWN' : 'YEAR',
      event_year: event.stats_year, event_date: null,
      chapter_number: event.chapter_number,
      chapter_section: event.chapter_section, bill_id: event.bill_id,
      source_url: event.source_url, source_xpath: event.source_xpath,
      verification_status: 'SOURCE_NOTE_EXTRACTED'
    });
    for (const [field, action] of [
      ['effective_date','EFFECTIVE'],['operative_date','OPERATIVE'],
      ['repeal_date','REPEAL_DATE'],['sunset_date','SUNSET_DATE']
    ]) {
      if (!event[field]) continue;
      timelineEvents.push({
        timeline_id: `${event.event_id}:${action}`,
        timeline_type: 'LEGAL_DATE_MILESTONE',
        event_id: event.event_id, event_key: event.event_key,
        hierarchy_node_id: event.hierarchy_node_id,
        action, date_precision: 'DAY',
        event_year: Number(event[field].slice(0, 4)), event_date: event[field],
        chapter_number: event.chapter_number,
        chapter_section: event.chapter_section, bill_id: event.bill_id,
        source_url: event.source_url, source_xpath: event.source_xpath,
        verification_status: 'EXPLICIT_DATE_IN_SOURCE_NOTE'
      });
    }
  }
  timelineEvents.sort((a, b) =>
    (a.event_year ?? Number.MAX_SAFE_INTEGER) - (b.event_year ?? Number.MAX_SAFE_INTEGER)
    || (a.event_date || '').localeCompare(b.event_date || '')
    || a.timeline_id.localeCompare(b.timeline_id));

  // Database observation and database commit are NOT the same event.
  // recorded_from fields in the legacy event rows mean "observed in this capture"
  // until a separate transaction is actually committed by Java/SQLite.
  const timelines = {
    legislative_events: timelineEvents,
    legal_validity_intervals: [], // historical version text NOT supplied
    database_record_events: [{
      record_event_id: `${authority}:OBSERVED:${captureTimestamp}`,
      authority_id: authority, kind: 'BROWSER_CAPTURE',
      observed_at: captureTimestamp, committed_at: null,
      database_transaction_id: null,
      status: 'OBSERVED_NOT_COMMITTED',
      source_url: canonical.href
    }],
    model_status: {
      legislative: 'EXTRACTED_SOURCE_NOTES',
      legal_validity: 'NOT_ESTABLISHED',
      transaction: 'OBSERVATION_ONLY'
    }
  };
  const timelineTree = timelineEvents.map(e =>
    `${e.event_date || (e.event_year ?? 'UNKNOWN')} [${e.date_precision}] ` +
    `${e.action} — ${e.hierarchy_node_id || 'UNKNOWN NODE'} ` +
    `(Event ${e.event_id})\n  SOURCE_URL: ${e.source_url}`
  ).join('\n');

  // Java-friendly column metadata: stable primitive types; null means unknown.
  const temporalSchema = {
    date_format: 'ISO-8601 yyyy-MM-dd',
    timestamp_format: 'ISO-8601 UTC instant',
    interval_semantics: '[start,end) when intervals have been verified',
    event_granularity: 'one row per legislative note',
    event_identity: 'event_key combines affected node, event type, stats year, chapter, chapter section',
    event_id_algorithm: 'FNV1a64 UTF-8 of event_key; index by full event_key',
    timeline_date_precision: ['YEAR', 'DAY', 'UNKNOWN'],
    legal_validity_policy: 'never infer valid_from or valid_to from a note alone',
    java_types: {
      stats_year: 'Integer', session_start_year: 'Integer', session_end_year: 'Integer',
      chapter_number: 'Integer', chapter_section: 'String', bill_id: 'String',
      effective_date: 'LocalDate', operative_date: 'LocalDate', repeal_date: 'LocalDate',
      sunset_date: 'LocalDate', valid_from: 'LocalDate', valid_to_exclusive: 'LocalDate',
      observed_at: 'Instant', recorded_from: 'Instant', recorded_to_exclusive: 'Instant'
    }
  };

  // 6 — Inspect form-backed navigation without submitting it.
  const navigationActions = ['goUp','previous','next','crossRef','pdf_link'].map(name => {
    const el = document.getElementById(`displayCodeSection:${name}`);
    return {action: name, present: !!el, label: norm(el), xpath: xpath(el),
      raw_href: el?.getAttribute('href') || null,
      onclick: el?.getAttribute('onclick') || null,
      requires_jsf_form_submission: !!el?.getAttribute('onclick')?.includes('jsfcljs'),
      resolved_destination_url: null};
  });
  const sectionLinks = [...root.querySelectorAll('a[href]')].map(el => ({
    text: norm(el), raw_href: el.getAttribute('href'),
    url: el.getAttribute('href') && !/^(#|javascript:)/i.test(el.getAttribute('href'))
      ? new URL(el.getAttribute('href'), page.href).href : null,
    xpath: xpath(el), original_html: el.outerHTML
  }));

  // 7 — Join normalized hierarchy and subdivision nodes into one tree.
  // Retain flat lists as well so SQLite can later ingest each type independently.
  const allNodes = [...hierarchyNodes, ...subdivisionNodes];
  const byId = new Map(allNodes.map(n => [n.id, {...n, children: []}]));
  const roots = [];
  for (const n of byId.values()) {
    if (n.parent_id && byId.has(n.parent_id)) byId.get(n.parent_id).children.push(n);
    else roots.push(n);
  }
  // 7A — Display-only formatter for statutory subdivisions.
  // The original text already starts with its marker, e.g. '(a) ...'.
  // Previously the tree prepended '(a)' again and produced '(a) (a) ...'.
  // IMPORTANT: Do NOT change node.text, statutory_paragraphs, or original_html.
  function displayStatutoryText(node) {
    const raw = node.text || '';
    if (!node.marker) return raw; // Introductory / unnumbered paragraph.
    const trimmed = raw.trimStart();
    // Use a literal prefix test; handles '(a)Text' and '(a) Text'.
    return trimmed.startsWith(node.marker)
      ? trimmed
      : `${node.marker} ${trimmed}`.trim();
  }

  // 7B — Human-readable hierarchy with full source URLs and separate targets.
  // A source URL identifies where the text was observed. An actual navigation
  // URL is supplied ONLY if known (the section's canonical URL, in this case).
  // Heading/subdivision navigation URLs remain null until independently resolved.
  const treeLines = [];
  function renderTree(node, level = 0) {
    const pad = '  '.repeat(level);
    const title = node.kind === 'SUBDIVISION'
      ? displayStatutoryText(node)
      : node.kind === 'UNNUMBERED_PARAGRAPH'
        ? `INTRO ${displayStatutoryText(node)}`
        : node.label || node.id;
    treeLines.push(`${pad}${title}`);
    treeLines.push(`${pad}  SOURCE_URL: ${node.source_url || canonical.href}`);
    // Display a navigation URL only when it is actually identified.
    if (node.navigation_url) treeLines.push(`${pad}  NAVIGATION_URL: ${node.navigation_url}`);
    for (const child of node.children) renderTree(child, level + 1);
  }
  roots.forEach(node => renderTree(node));
  const hierarchyTreeWithURLs = treeLines.join('\n');
  const billURLInventory = [...new Map(legislativeNotes
    .filter(n => n.leginfo_bill_id)
    .map(n => [n.leginfo_bill_id, {
      bill_id: n.bill_id,
      bill_navigation_url: n.bill_navigation_url,
      bill_text_url: n.bill_text_url,
      status: n.bill_url_status
    }])).values()];
  const urlInventory = {
    source_page_url: page.href,
    canonical_section_url: canonical.href,
    // Every heading uses the inspected section as its source; no guessed heading targets.
    hierarchy_node_sources: hierarchyNodes.map(n => ({
      id: n.id, kind: n.kind, label: n.label,
      full_source_url: n.source_url,
      navigation_url: n.navigation_url,
      navigation_url_status: n.navigation_url_status
    })),
    bill_urls: billURLInventory
  };

  // 7C — PURE BROWSER TEMPORAL DISTANCE ENGINE (built-in JS Date, Array, Map).
  // IMPORTANT: "Stats. 2023" has YEAR precision, NOT January 1, 2023.
  // The capture timestamp is a UTC instant. For day-based aging we use its
  // UTC calendar date, so the result is reproducible across machine timezones.
  // An optional as-of date can be provided BEFORE pasting this script:
  //   window.CA_STEP6_CONFIG = {as_of_date: '2025-06-01'};
  // Without it, the first result uses the capture date. Query again later via:
  //   CA_STEP6_ANALYZE_AS_OF('2025-06-01')  or  CA_STEP6_ANALYZE_AS_OF()
  // Calling without a date recalculates at the CURRENT UTC date (no recrawl).
  const dateRe = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
  const UTC_DAY_MS = 86400000;
  function isoDayFromUTCInstant(instant) {
    return new Date(instant).toISOString().slice(0, 10);
  }
  function dayNumber(iso) {
    if (typeof iso !== 'string' || !dateRe.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const value = Date.UTC(y, m - 1, d);
    const date = new Date(value);
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? Math.round(value / UTC_DAY_MS) : null;
  }
  function elapsedDays(start, end) {
    const a = dayNumber(start), b = dayNumber(end);
    return a === null || b === null ? null : b - a;
  }
  // Keep the signed interval. Negative values mean the reference date precedes
  // the event date; they are not silently clamped to zero.
  function daysBetweenEvents(first, second, category, precision) {
    return {
      from_event_id: first.event_id,
      to_event_id: second.event_id,
      from_hierarchy_node_id: first.hierarchy_node_id,
      to_hierarchy_node_id: second.hierarchy_node_id,
      category,
      date_precision: precision,
      from_year: first.stats_year,
      to_year: second.stats_year,
      from_date: precision === 'DAY' ? first.effective_date : null,
      to_date: precision === 'DAY' ? second.effective_date : null,
      calendar_year_difference: first.stats_year !== null && second.stats_year !== null
        ? second.stats_year - first.stats_year : null,
      elapsed_days: precision === 'DAY' ? elapsedDays(first.effective_date, second.effective_date) : null,
      status: precision === 'YEAR' ? 'YEAR_PRECISION_ONLY' : 'EXACT_DATES_FROM_SOURCE_NOTES'
    };
  }
  // Pairs are grouped by affected hierarchy node. Do not count a Division-heading
  // amendment as a prior amendment of a statutory SECTION.
  const eventsByNode = new Map();
  for (const e of temporalEvents) {
    const key = e.hierarchy_node_id || '__UNRESOLVED__';
    if (!eventsByNode.has(key)) eventsByNode.set(key, []);
    eventsByNode.get(key).push(e);
  }
  const eventIntervals = [];
  const effectiveDateIntervals = [];
  for (const group of eventsByNode.values()) {
    const byYear = group.filter(e => Number.isInteger(e.stats_year))
      .sort((a, b) => a.stats_year - b.stats_year || a.event_key.localeCompare(b.event_key));
    for (let i = 1; i < byYear.length; i++) {
      eventIntervals.push(daysBetweenEvents(byYear[i - 1], byYear[i], 'SAME_NODE_LEGISLATIVE_EVENTS', 'YEAR'));
    }
    const byEffective = group.filter(e => dayNumber(e.effective_date) !== null)
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.event_key.localeCompare(b.event_key));
    for (let i = 1; i < byEffective.length; i++) {
      effectiveDateIntervals.push(daysBetweenEvents(byEffective[i - 1], byEffective[i], 'SAME_NODE_EFFECTIVE_DATES', 'DAY'));
    }
  }
  // Additional across-node comparisons are descriptive only. No implication that
  // these events revised the same statute or occurred on a known day of that year.
  const allYearEvents = temporalEvents.filter(e => Number.isInteger(e.stats_year))
    .sort((a, b) => a.stats_year - b.stats_year || a.event_key.localeCompare(b.event_key));
  const observedEventYearGaps = [];
  for (let i = 1; i < allYearEvents.length; i++) {
    observedEventYearGaps.push(daysBetweenEvents(allYearEvents[i - 1], allYearEvents[i], 'ACROSS_OBSERVED_HIERARCHY_NODES', 'YEAR'));
  }
  // Only explicitly printed DAY dates support day-accurate differences.
  const effectiveToOperative = temporalEvents.filter(e =>
    dayNumber(e.effective_date) !== null && dayNumber(e.operative_date) !== null).map(e => ({
    event_id: e.event_id, hierarchy_node_id: e.hierarchy_node_id,
    effective_date: e.effective_date, operative_date: e.operative_date,
    elapsed_days: elapsedDays(e.effective_date, e.operative_date),
    status: 'EXPLICIT_DATE_PAIR'
  }));
  // This single statutory page does not supply bill introduction, passage, or
  // chaptering DAY dates; do not invent those intervals from Stats years.
  const billIntervals = [];
  const captureDateUTC = isoDayFromUTCInstant(captureTimestamp);
  function buildAsOfAge(asOf) {
    if (dayNumber(asOf) === null) throw Error('as_of_date must be a real YYYY-MM-DD calendar date.');
    return {
      as_of_date: asOf,
      date_basis: 'UTC_CALENDAR_DAY',
      // At crawl is immutable, while as-of is explicitly chosen/recomputed.
      captured_at: captureTimestamp,
      capture_date_utc: captureDateUTC,
      age_rows: temporalEvents.map(e => ({
        event_id: e.event_id,
        hierarchy_node_id: e.hierarchy_node_id,
        event_type: e.event_type,
        stats_year: e.stats_year,
        // YEAR-only age is a year-label difference, not a legal duration.
        stats_year_difference: Number.isInteger(e.stats_year)
          ? Number(asOf.slice(0, 4)) - e.stats_year : null,
        stats_year_difference_precision: 'CALENDAR_YEAR_LABELS_ONLY',
        effective_date: e.effective_date,
        days_since_effective_at_capture: elapsedDays(e.effective_date, captureDateUTC),
        days_since_effective_as_of: elapsedDays(e.effective_date, asOf),
        operative_date: e.operative_date,
        days_since_operative_at_capture: elapsedDays(e.operative_date, captureDateUTC),
        days_since_operative_as_of: elapsedDays(e.operative_date, asOf),
        sunset_date: e.sunset_date,
        days_until_sunset_as_of: elapsedDays(asOf, e.sunset_date),
        // Unknown dates remain null, not zero and not today's date.
        exact_date_status: e.effective_date || e.operative_date || e.sunset_date
          ? 'SOURCE_NOTE_HAS_EXACT_DATE' : 'YEAR_ONLY_OR_UNKNOWN'
      }))
    };
  }
  const requestedAsOf = window.CA_STEP6_CONFIG?.as_of_date;
  const initialAsOf = requestedAsOf == null ? captureDateUTC : requestedAsOf;
  const asOfAnalysis = buildAsOfAge(initialAsOf);
  // Future calls rerun analysis against current UTC day if no argument is passed.
  window.CA_STEP6_ANALYZE_AS_OF = (asOfDate = isoDayFromUTCInstant(new Date().toISOString())) =>
    buildAsOfAge(asOfDate);

  // 7D — SECTION PROXIMITY: a one-page DOM may NOT contain its neighboring sections.
  // Gather only direct, observed section links from this page as candidates.
  // Site "Previous" / "Next" are JSF POST actions (href="#"), not verified URLs.
  // Numeric subtraction of section identifiers is NOT a sound legal distance.
  const sameCodeSectionCandidates = [...new Map(sectionLinks.flatMap(link => {
    if (!link.url) return [];
    try {
      const u = new URL(link.url);
      const sec = u.searchParams.get('sectionNum');
      const law = u.searchParams.get('lawCode');
      return u.origin === page.origin && u.pathname === page.pathname &&
        law?.toUpperCase() === code && sec
        ? [[sec, {section: sec, url: u.href, source_xpath: link.xpath}]] : [];
    } catch { return []; }
  })).values()];
  const proximity = {
    section, authority_id: authority,
    previous_section: null, next_section: null,
    previous_section_url: null, next_section_url: null,
    sequence_distance_to_previous: null, sequence_distance_to_next: null,
    hierarchy_edge_distance: null,
    numeric_gap: null,
    observed_same_code_section_links: sameCodeSectionCandidates,
    jsf_previous_present: navigationActions.some(a => a.action === 'previous' && a.present),
    jsf_next_present: navigationActions.some(a => a.action === 'next' && a.present),
    status: 'NEEDS_VERIFIED_ORDERED_SECTION_INVENTORY',
    explanation: 'JSF navigation controls and a single section page cannot establish adjacent section IDs.'
  };
  const temporalDistances = {
    model: 'BROWSER_BUILTINS_ONLY',
    capture_date_utc: captureDateUTC,
    as_of_analysis: asOfAnalysis,
    event_intervals: eventIntervals,
    observed_hierarchy_year_gaps: observedEventYearGaps,
    effective_date_intervals: effectiveDateIntervals,
    effective_to_operative_intervals: effectiveToOperative,
    bill_intervals: billIntervals,
    bill_interval_status: 'EXACT_BILL_MILESTONE_DATES_NOT_PRESENT_ON_SECTION_PAGE',
    version_durations: [],
    version_duration_status: 'REQUIRES_VERIFIED_HISTORICAL_VERSION_INTERVALS',
    statutory_proximity: proximity,
    interval_semantics: {
      elapsed_days: 'SIGNED_UTC_CALENDAR_DAYS; available only for exact source dates',
      calendar_year_difference: 'YEAR_LABEL_DIFFERENCE_ONLY; not exact elapsed days',
      as_of_policy: 'snapshot saved at capture; recompute dynamically with CA_STEP6_ANALYZE_AS_OF()'
    }
  };
  const distanceTree = [
    `CAPTURE UTC: ${captureDateUTC} (${captureTimestamp})`,
    `AS-OF DATE: ${initialAsOf}`,
    `OBSERVED YEAR GAPS: ${observedEventYearGaps.length} (across hierarchy nodes)`,
    `SAME-NODE YEAR GAPS: ${eventIntervals.length}`,
    `EXACT EFFECTIVE-DATE PAIRS: ${effectiveDateIntervals.length}`,
    `EFFECTIVE→OPERATIVE PAIRS: ${effectiveToOperative.length}`,
    `BILL DATE INTERVALS: ${billIntervals.length} (no verified bill milestones)`,
    `SECTION NEIGHBORS: ${proximity.status}`
  ].join('\n');

  // 7E — ONE CANONICAL REGISTRY + NINE DERIVED INDEXES + SEVEN SVG TRACKS.
  // Browser-native only: Array, Map, Set, Date, DOM/SVG; NO external libraries.
  // All index entries are references (IDs), never copied statutory records.
  const TRACKS = [
    ['legislative','Legislative'], ['bill_lifecycle','Bill lifecycle'],
    ['legal_effect','Effective / operative'], ['historical_versions','Historical versions'],
    ['hierarchical','Hierarchy changes'], ['database_observation','Database observation'],
    ['judicial_interpretation','Judicial interpretation']
  ];
  const INDEX_NAMES = [
    'legislative_event_time','effective_time','operative_time','valid_time',
    'transaction_time','observation_time','bill_timeline',
    'amendment_intervals','section_proximity'
  ];
  const registryById = new Map();
  const registryByKey = new Map();
  const registryWarnings = [];
  const trackIds = new Map(TRACKS.map(([key]) => [key, new Set()]));
  const indexesByName = new Map(INDEX_NAMES.map(key => [key, []]));
  const validDay = iso => typeof iso === 'string' && dayNumber(iso) !== null;
  const legalYear = year => Number.isInteger(year) && year >= 1 && year <= 9999;

  function addCanonicalEvent(value) {
    // A canonical event may belong to several tracks. Its key must identify the
    // actual event, not its position in a capture. Never use capture time as a
    // key for legislative events; use it ONLY for distinct observation records.
    if (!value || !value.canonical_key) return null;
    const key = String(value.canonical_key);
    if (registryByKey.has(key)) {
      const prior = registryByKey.get(key);
      // First accepted record remains authoritative for this capture; divergent
      // records are flagged, not silently overwritten or falsely merged.
      if (prior.date !== (value.date || null) || prior.year !== (value.year ?? null))
        registryWarnings.push({code:'CONFLICTING_EVENT_DATE', canonical_key:key});
      return prior;
    }
    const event = {
      id: `T-${fnv1a64(key)}`, canonical_key:key,
      action: value.action || 'UNKNOWN', label: value.label || value.action || 'Event',
      year: legalYear(value.year) ? value.year : null,
      date: validDay(value.date) ? value.date : null,
      precision: validDay(value.date) ? 'DAY' : legalYear(value.year) ? 'YEAR' : 'UNKNOWN',
      authority_id: value.authority_id || authority,
      hierarchy_node_id: value.hierarchy_node_id || null,
      source_url: value.source_url || null, source_xpath: value.source_xpath || null,
      source_hash: value.source_hash || null, // Optional; not proof of source authenticity
      verification_status: value.verification_status || 'SOURCE_NOTE_EXTRACTED',
      bill_id: value.bill_id || null,
      parent_event_id: value.parent_event_id || null,
      valid_from: validDay(value.valid_from) ? value.valid_from : null,
      valid_to_exclusive: validDay(value.valid_to_exclusive) ? value.valid_to_exclusive : null,
      transaction_from: value.transaction_from || null,
      transaction_to_exclusive: value.transaction_to_exclusive || null,
      tracks: [...new Set((value.tracks || []).filter(k => trackIds.has(k)))]
    };
    if (registryById.has(event.id) && registryById.get(event.id).canonical_key !== key) {
      registryWarnings.push({code:'HASH_COLLISION', canonical_key:key});
      return null;
    }
    registryById.set(event.id, event);
    registryByKey.set(key, event);
    for (const track of event.tracks) trackIds.get(track).add(event.id);
    return event;
  }

  function insertFromLegislativeEvent(e) {
    const hierarchyKinds = new Set(['DIVISION','PART','TITLE','CHAPTER','ARTICLE']);
    const matchedNode = hierarchyNodes.find(n => n.id === e.hierarchy_node_id);
    const tracks = ['legislative'];
    if (matchedNode && hierarchyKinds.has(matchedNode.kind)) tracks.push('hierarchical');
    const base = addCanonicalEvent({
      canonical_key:`LEGISLATIVE|${e.event_key}`,
      action:e.event_type, label:`${e.event_type} — ${matchedNode?.label || e.hierarchy_node_id || 'Unresolved node'}`,
      year:e.stats_year, date:null, authority_id:e.authority_id,
      hierarchy_node_id:e.hierarchy_node_id, bill_id:e.bill_id,
      source_url:e.source_url, source_xpath:e.source_xpath,
      source_hash:e.source_note_text ? `FNV1A64:${fnv1a64(e.source_note_text)}` : null,
      verification_status:'SOURCE_NOTE_EXTRACTED', tracks
    });
    if (!base) return;
    for (const [field, action, track] of [
      ['effective_date','EFFECTIVE','legal_effect'],
      ['operative_date','OPERATIVE','legal_effect'],
      ['repeal_date','REPEAL_DATE','legal_effect'],
      ['sunset_date','SUNSET_DATE','legal_effect']
    ]) {
      if (!validDay(e[field])) continue;
      addCanonicalEvent({
        canonical_key:`LEGAL_DATE|${e.event_key}|${action}|${e[field]}`,
        parent_event_id:base.id, action,
        label:`${action.replaceAll('_',' ')} — ${e.hierarchy_node_id || 'Unresolved node'}`,
        year:Number(e[field].slice(0,4)), date:e[field],
        authority_id:e.authority_id, hierarchy_node_id:e.hierarchy_node_id,
        bill_id:e.bill_id, source_url:e.source_url, source_xpath:e.source_xpath,
        verification_status:'EXPLICIT_DATE_IN_SOURCE_NOTE', tracks:[track]
      });
    }
  }
  temporalEvents.forEach(insertFromLegislativeEvent);

  // A browser observation is an actual instant. It is NOT a SQLite commit,
  // a date of enactment, or proof of the law's entire validity interval.
  addCanonicalEvent({
    canonical_key:`OBSERVATION|${authority}|${captureTimestamp}`,
    action:'BROWSER_CAPTURE', label:`Captured ${authority}`,
    year:Number(captureDateUTC.slice(0,4)), date:captureDateUTC,
    source_url:page.href, verification_status:'OBSERVED_NOT_COMMITTED',
    transaction_from:null, tracks:['database_observation']
  });

  // Optional external normalized events. The extractor itself does not invent
  // bill milestones, judicial cases, historical versions, or transaction logs.
  // Supply only independently sourced, verified records using the exact schema:
  // window.CA_STEP6_ADDITIONAL_TIMELINE_EVENTS = [{canonical_key, action, date,
  //   tracks:['judicial_interpretation'],source_url,verification_status,...}]
  // Their dates are retained with original DAY or YEAR precision.
  const extra = window.CA_STEP6_ADDITIONAL_TIMELINE_EVENTS;
  if (Array.isArray(extra)) for (const e of extra) {
    if (!e || typeof e.canonical_key !== 'string' || !e.canonical_key.trim()) {
      registryWarnings.push({code:'EXTRA_EVENT_MISSING_KEY'}); continue;
    }
    if (e.date != null && !validDay(e.date)) {
      registryWarnings.push({code:'EXTRA_EVENT_INVALID_DATE', canonical_key:e.canonical_key}); continue;
    }
    addCanonicalEvent(e);
  }

  const timelineSort = (a,b) =>
    (a.year ?? 99999) - (b.year ?? 99999)
    || (a.date || '').localeCompare(b.date || '')
    || a.canonical_key.localeCompare(b.canonical_key);

  function rebuildTemporalIndexes() {
    for (const list of indexesByName.values()) list.length = 0;
    const sorted = [...registryById.values()].sort(timelineSort);
    const add = (name, event, extras = {}) =>
      indexesByName.get(name).push({event_id:event.id, ...extras});
    for (const event of sorted) {
      if (event.tracks.includes('legislative')) add('legislative_event_time', event,
        {year:event.year,precision:event.precision});
      if (event.action === 'EFFECTIVE') add('effective_time', event, {date:event.date});
      if (event.action === 'OPERATIVE') add('operative_time', event, {date:event.date});
      if (event.valid_from && event.valid_to_exclusive &&
          event.valid_from < event.valid_to_exclusive &&
          event.verification_status === 'VERIFIED_HISTORICAL_VERSION')
        add('valid_time',event,{from:event.valid_from,to_exclusive:event.valid_to_exclusive});
      if (event.transaction_from && event.verification_status === 'DATABASE_COMMITTED')
        add('transaction_time', event,
          {from:event.transaction_from,to_exclusive:event.transaction_to_exclusive});
      if (event.tracks.includes('database_observation'))
        add('observation_time', event,{date:event.date});
      // Bill lifecycle events are imported only if the source actually provides
      // introduction, passage, chaptering, or other dated bill actions.
      if (event.tracks.includes('bill_lifecycle'))
        add('bill_timeline', event,{bill_id:event.bill_id,date:event.date,year:event.year});
    }
    // Interval pairs refer back to the canonical events and never count a
    // hierarchy heading change as an amendment of the statutory SECTION.
    for (const gap of eventIntervals) indexesByName.get('amendment_intervals').push({
      from_event_id: gap.from_event_id,
      to_event_id: gap.to_event_id,
      calendar_year_difference:gap.calendar_year_difference,
      precision:gap.date_precision,
      source:'LEGACY_SAME_NODE_INTERVAL',
      // Legacy event IDs are retained as foreign references for traceability.
      canonical_from_id:registryByKey.get(`LEGISLATIVE|${temporalEvents.find(e => e.event_id === gap.from_event_id)?.event_key}`)?.id || null,
      canonical_to_id:registryByKey.get(`LEGISLATIVE|${temporalEvents.find(e => e.event_id === gap.to_event_id)?.event_key}`)?.id || null
    });
    indexesByName.get('section_proximity').push({
      authority_id:authority, previous_section:proximity.previous_section,
      next_section:proximity.next_section,
      status:proximity.status, evidence:'SECTION_INVENTORY_REQUIRED'
    });
  }
  rebuildTemporalIndexes();
  // Snapshot is serializable; internal Maps/Sets power fast lookups.
  const temporalRegistry = {
    source_hash_note: 'FNV1A64 is a noncryptographic source-text fingerprint, not a verified signature',
    schema:'6.6', algorithm:'FNV1A64_WITH_FULL_CANONICAL_KEY',
    canonical_events:[...registryById.values()].sort(timelineSort),
    tracks:Object.fromEntries(TRACKS.map(([key,label]) => [key,{
      label, event_ids:[...trackIds.get(key)]
    }])),
    indexes:Object.fromEntries(INDEX_NAMES.map(name => [name,{
      entry_count:indexesByName.get(name).length,
      entries:indexesByName.get(name)
    }])),
    warnings:registryWarnings,
    coverage:{
      legal_versions:'NOT_VERIFIED_FROM_SINGLE_SECTION',
      bill_milestones:'NOT_VERIFIED_FROM_SINGLE_SECTION',
      judiciary:'NOT_INDEXED_FROM_SECTION_PAGE',
      database_transactions:'NOT_COMMITTED_BY_BROWSER_CAPTURE',
      section_neighbors:proximity.status
    }
  };

  // 7F — A synchronized seven-track SVG viewer. No dependencies or network.
  // Built with DOM methods and textContent (never untrusted innerHTML).
  // The same canonical event ID is used in all tracks and indexes.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function makeSvg(tag, attrs = {}, label = null) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [key,value] of Object.entries(attrs)) n.setAttribute(key,String(value));
    if (label !== null) n.textContent = label;
    return n;
  }
  function showTimelineViewer() {
    document.getElementById('ca-step66-viewer')?.remove();
    const all = temporalRegistry.canonical_events;
    const years = all.map(e => e.year).filter(legalYear);
    const minYear = years.length ? Math.min(...years) : new Date().getUTCFullYear();
    const maxYear = years.length ? Math.max(...years) : minYear;
    let fromYear = minYear, toYear = Math.max(maxYear,minYear+1);
    let activeTrack = 'ALL';

    const wrap = document.createElement('section'); wrap.id='ca-step66-viewer';
    Object.assign(wrap.style,{
      position:'fixed',zIndex:'2147483640',top:'5vh',right:'3vw',
      width:'min(1050px,94vw)',height:'min(800px,90vh)',
      background:'#101827',color:'#e5edf8',border:'1px solid #51617b',
      borderRadius:'12px',boxShadow:'0 16px 55px #0009',
      font:'13px system-ui, sans-serif',overflow:'hidden',display:'flex',flexDirection:'column'
    });
    const header=document.createElement('div');
    Object.assign(header.style,{padding:'14px',borderBottom:'1px solid #43506a',display:'flex',alignItems:'center',gap:'9px',flexWrap:'wrap'});
    const title=document.createElement('strong'); title.textContent=`Seven-track legal timeline — ${authority}`;
    title.style.marginRight='auto';header.appendChild(title);
    const fromInput=document.createElement('input');fromInput.type='number';fromInput.value=String(fromYear);fromInput.title='First year';
    const toInput=document.createElement('input');toInput.type='number';toInput.value=String(toYear);toInput.title='Last year';
    for(const input of [fromInput,toInput]) Object.assign(input.style,{width:'70px',padding:'4px',color:'#111827'});
    const filter=document.createElement('select');
    for(const [value,label] of [['ALL','All tracks'],...TRACKS]) {
      const o=document.createElement('option');o.value=value;o.textContent=label;filter.appendChild(o);
    }
    const close=document.createElement('button');close.textContent='Close';
    close.type='button';close.addEventListener('click',()=>wrap.remove());
    for(const el of [fromInput,toInput,filter,close]) header.appendChild(el);
    wrap.appendChild(header);
    const expl=document.createElement('div'); expl.style.padding='7px 14px';
    expl.textContent='Year-only markers occupy a year band; exact dates use day positions. Empty tracks mean no verified data.';
    wrap.appendChild(expl);
    const body=document.createElement('div');
    Object.assign(body.style,{flex:'1',overflow:'auto',padding:'8px 12px'});
    const svg=makeSvg('svg',{width:'100%',viewBox:'0 0 970 610',role:'img','aria-label':'Seven synchronized legal timeline tracks'});
    Object.assign(svg.style,{display:'block',minWidth:'740px',background:'#172338',borderRadius:'6px'});
    body.appendChild(svg);
    const detail=document.createElement('div');
    Object.assign(detail.style,{background:'#0c1320',borderTop:'1px solid #51617b',padding:'10px 14px',maxHeight:'130px',overflow:'auto',whiteSpace:'pre-wrap'});
    detail.textContent='Select a point to see the canonical event ID, legal node, provenance, and date precision.';
    wrap.append(body,detail);document.body.appendChild(wrap);
    const axisLeft=198,axisRight=945;
    const yTop=94,yStep=68;
    function epochOfYear(year) {return Date.UTC(year,0,1);}
    function positionOf(event){
      const left=epochOfYear(fromYear),right=epochOfYear(toYear+1);
      const stamp=event.date ? Date.parse(`${event.date}T00:00:00Z`) :
        epochOfYear(event.year)+ (epochOfYear(event.year+1)-epochOfYear(event.year))/2;
      return axisLeft+(stamp-left)/(right-left)*(axisRight-axisLeft);
    }
    function draw(){
      svg.replaceChildren();
      const start=Number(fromInput.value),end=Number(toInput.value);
      if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>9998||start>end){
        detail.textContent='Enter a valid range of years (start <= end).';return;
      }
      fromYear=start;toYear=end;activeTrack=filter.value;
      const ticks=Math.max(1,Math.min(12,toYear-fromYear+1));
      for(let i=0;i<=ticks;i++){
        const yr=fromYear+Math.round((toYear-fromYear)*i/ticks);
        const x=axisLeft+(epochOfYear(yr)-epochOfYear(fromYear))/
          (epochOfYear(toYear+1)-epochOfYear(fromYear))*(axisRight-axisLeft);
        svg.appendChild(makeSvg('line',{x1:x,y1:45,x2:x,y2:590,stroke:'#34435b','stroke-width':1}));
        svg.appendChild(makeSvg('text',{x,y:35,fill:'#cbd5e1','font-size':12,'text-anchor':'middle'},String(yr)));
      }
      TRACKS.forEach(([key,label],i)=>{
        const y=yTop+i*yStep;
        svg.appendChild(makeSvg('text',{x:12,y:y-8,fill:'#e5edf8','font-size':13},label));
        svg.appendChild(makeSvg('line',{x1:axisLeft,y1:y,x2:axisRight,y2:y,stroke:'#66778e','stroke-width':1}));
        if(activeTrack!=='ALL'&&activeTrack!==key)return;
        const events=[...trackIds.get(key)].map(id=>registryById.get(id)).filter(Boolean)
          .filter(e=>e.year!=null&&e.year>=fromYear&&e.year<=toYear)
          .sort(timelineSort);
        // An empty track is not filled with simulated legislation.
        if (!events.length) {
          svg.appendChild(makeSvg('text',{x:axisLeft+9,y:y-9,fill:'#8a9bb3','font-size':11},'No sourced events in selected interval'));
          return;
        }
        events.forEach((e,j)=>{
          const x=positionOf(e);
          const cy=y-5-(j%3)*12; // spread overlapping markers without shifting their date
          const symbol=e.precision==='YEAR'
            ? makeSvg('rect',{x:x-5,y:cy-5,width:10,height:10,fill:'#fbbf24',stroke:'#111827'})
            : makeSvg('circle',{cx:x,cy,r:5,fill:'#5eead4',stroke:'#111827'});
          symbol.style.cursor='pointer';
          symbol.appendChild(makeSvg('title',{},`${e.precision}: ${e.date||e.year} — ${e.label}`));
          symbol.addEventListener('click',()=>{
            detail.replaceChildren();
            const lines=[`EVENT: ${e.label}`,`ID: ${e.id}`,`DATE: ${e.date||e.year||'UNKNOWN'} [${e.precision}]`,
              `NODE: ${e.hierarchy_node_id||'Unresolved'}`,`STATUS: ${e.verification_status}`,
              `SOURCE: ${e.source_url||'Not provided'}`];
            detail.appendChild(document.createTextNode(lines.join('\n')));
            if(e.source_url && /^https:\/\//i.test(e.source_url)){
              const a=document.createElement('a');a.href=e.source_url;a.target='_blank';a.rel='noopener noreferrer';
              a.textContent=' Open source';a.style.color='#5eead4';detail.appendChild(a);
            }
          });
          svg.appendChild(symbol);
        });
      });
    }
    for(const el of [fromInput,toInput,filter]) el.addEventListener('change',draw);
    draw();
    return wrap;
  }
  // Query derived indexes by ID. Indexes are views over registryById, not copies.
  // Example: CA_STEP6_QUERY_TEMPORAL('effective_time', '2024-01-01')
  // For YEAR-only records, day cutoffs are deliberately not interpreted as exact.
  window.CA_STEP6_QUERY_TEMPORAL=(name, asOfDate=null) => {
    if (!indexesByName.has(name)) throw Error('Unknown temporal index: '+name);
    if (asOfDate !== null && !validDay(asOfDate)) throw Error('Invalid as-of date');
    return indexesByName.get(name).filter(entry => {
      if (!asOfDate) return true;
      if (name === 'valid_time') return entry.from <= asOfDate && asOfDate < entry.to_exclusive;
      if (name === 'effective_time' || name === 'operative_time') return entry.date <= asOfDate;
      if (name === 'observation_time') return entry.date <= asOfDate;
      if (name === 'legislative_event_time') return entry.precision === 'YEAR'
        ? entry.year < Number(asOfDate.slice(0,4)) : true;
      return true; // Other indexes need index-specific predicates.
    }).map(entry => ({...entry,
      event:entry.event_id ? registryById.get(entry.event_id) || null : null}));
  };
  window.CA_STEP6_GET_CANONICAL_EVENT=id=>registryById.get(id)||null;
  window.CA_STEP6_SHOW_TIMELINE=showTimelineViewer;
  window.CA_STEP6_CLOSE_TIMELINE=()=>document.getElementById('ca-step66-viewer')?.remove();
  // VISUALIZATION IS OPTIONAL AND OFF BY DEFAULT.
  // By default the script exports TXT/JSON and creates the indexes without
  // opening a window or changing the page layout.
  // Opt in BEFORE execution: window.CA_STEP6_CONFIG={show_timeline:true}
  // Or open the viewer ANYTIME AFTER execution: CA_STEP6_SHOW_TIMELINE()
  // Close without deleting results: CA_STEP6_CLOSE_TIMELINE()
  const openTimelineAutomatically=window.CA_STEP6_CONFIG?.show_timeline===true;

  const result = {
    schema_version: '6.6.1', step: '6-section-hierarchy-and-statute',
    code, section, authority_id: authority,
    captured_at: captureTimestamp, source_url: page.href,
    canonical_section_url: canonical.href, document_title: document.title,
    verification_scope: 'Opened page DOM only; hierarchy target URLs unresolved except section; subdivision nesting inferred; bill URLs constructed, not retrieved',
    summary: {
      hierarchy_nodes: hierarchyNodes.length, headings: headings.length,
      paragraphs: paragraphs.length, subdivision_nodes: subdivisionNodes.length,
      legislative_notes: legislativeNotes.length, source_links: sectionLinks.length,
      hierarchy_warnings: warnings.length, temporal_events: temporalEvents.length,
      temporal_warnings: temporalWarnings.length, timeline_events: timelineEvents.length,
      canonical_events:temporalRegistry.canonical_events.length,
      timeline_tracks:TRACKS.length, temporal_indexes:INDEX_NAMES.length,
      year_gaps_observed: observedEventYearGaps.length, same_node_year_intervals: eventIntervals.length,
      cross_reference_action_present: navigationActions.some(x => x.action === 'crossRef' && x.present)
    },
    hierarchy_nodes: hierarchyNodes, statutory_paragraphs: paragraphs,
    subdivision_nodes: subdivisionNodes, tree: roots,
    hierarchy_tree_with_urls: hierarchyTreeWithURLs, url_inventory: urlInventory,
    legislative_notes: legislativeNotes, temporal_events: temporalEvents,
    temporal_schema: temporalSchema, temporal_validation: temporalValidation,
    timeline_events: timelineEvents, timelines, timeline_tree: timelineTree,
    temporal_distances: temporalDistances, distance_tree: distanceTree,
    temporal_registry: temporalRegistry, headings,
    section_links: sectionLinks, navigation_actions: navigationActions,
    statutory_text_only: paragraphs.map(p => p.text).join('\n'),
    section_text: norm(root), section_html: cleanHTML(root),
    validation_warnings: warnings
  };
  window.CA_STEP6_SECTION_HIERARCHY = result;
  console.log('STEP 6 — HIERARCHY + STATUTE', result.summary);
  console.log('HIERARCHY WITH FULL SOURCE URLS\n' + hierarchyTreeWithURLs);
  console.table(urlInventory.hierarchy_node_sources);
  console.table(billURLInventory);
  console.log('TEMPORAL VALIDATION', temporalValidation);
  console.log('LEGISLATIVE TIMELINE\n' + timelineTree);
  console.log('TEMPORAL DISTANCE\n' + distanceTree);
  console.table(Object.entries(temporalRegistry.indexes).map(([name, value]) => ({index:name, entries:value.entry_count})));
  // Only draw the optional visual when explicitly enabled.
  if (openTimelineAutomatically) showTimelineViewer();
  console.table(asOfAnalysis.age_rows);
  console.table(temporalEvents.map(e => ({node:e.hierarchy_node_id, year:e.stats_year, chapter:e.chapter_number, chapter_section:e.chapter_section, bill:e.bill_id, effective:e.effective_date, operative:e.operative_date, session:e.session_status})));
  console.table(subdivisionNodes.map(n => ({id:n.id, parent:n.parent_id,
    marker:n.marker || '', type:n.kind, confidence:n.confidence, issues:n.issues.join(';')})));

  // 8 — Export JSON as TXT; no libraries, Java executable, or network needed.
  // A single file includes all raw/derived data; future as-of calls recompute without downloading.
  const blob = new Blob([JSON.stringify(result, null, 2)], {type:'text/plain;charset=utf-8'});
  const downloadURL = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadURL;
  a.download = `STEP6_${code}_${section.replace(/[^A-Za-z0-9.-]/g, '_')}_HIERARCHY_STATUTE.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(downloadURL), 5000);
  return result;
})();
