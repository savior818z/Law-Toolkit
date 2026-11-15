/*
 CALIFORNIA LEGISLATIVE INFORMATION — STEP 8.3
 VERIFIED DUAL-PANEL, DOM, CSS, XPATH, HIERARCHY AND LINK EXTRACTOR

 Browser-native JavaScript. Run in Microsoft Edge DevTools Console while viewing:
 /faces/displayCodeAndBill.xhtml?sectionNum=...&billVersionSectionId=...&lawCode=...

 Grounded in CA_FULL_CSS_DOM_XPATH_ANCHORS.txt (2026-11-15):
  - form#dispcodebillid
  - div#codeLawSectionNoHead (current Code section)
  - div#billsectionxsl (selected historical bill-section text)
  - #dispcodebillid:displayAsAmend ("the law as amended", JSF form POST)
  - #dispcodebillid:goBackBtn ("return back to code", JSF form POST)

 NO network requests, clicks, forms submitted, or page transitions.
 Export: ONE UTF-8 .txt file containing structured JSON.
 The script extracts DOM snapshots (not original network response bytes).
*/
(async function CA_STEP8_DUAL_PANEL_EXTRACTOR() {
  'use strict';

  // Step 8.3: DOM-semantic comparisons and legislative action classification.
  // JSF navigation is completed separately by the companion Selenium verifier.
  // This browser script never submits a form automatically.
  // -------------------------- CONFIGURATION -------------------------------
  const CONFIG = {
    INCLUDE_BOTH_FULL_PANELS: true,  // true=full current + historical snapshots
    INCLUDE_RAW_DOM_HTML: true,      // false retains cleaned HTML only
    INCLUDE_ELEMENT_INVENTORY: true, // metadata for every semantic DOM element
    INCLUDE_ALL_PAGE_LINKS: true,    // all anchors with nearby context; not only bill links
    INCLUDE_FULL_PAGE_HTML: false,   // optional VERY large captured DOM snapshot
    INCLUDE_SUBDIVISION_HIERARCHY: true,
    INCLUDE_TEXT_COMPARE: true,      // DOM-aligned subdivision comparison
    INCLUDE_HEADING_OUTLINE: true,   // h1..h6 and hgroup DOM heading outline
    EXPORT_PARAGRAPH_EVIDENCE: true, // source DOM anchors for every compared unit
    DOWNLOAD_TXT: true,
    OUTPUT_CONSOLE: true,          // print structured summary in DevTools
    CONSOLE_SHOW_SUBDIVISIONS: true,
    CONSOLE_SHOW_DOM_ELEMENTS: false, // can be large; toggle when debugging
    CONSOLE_SHOW_LINKS: true,
    CONSOLE_FULL_JSON: false,       // true = print complete export to console
    CONSOLE_MAX_ROWS: 100,
    MAX_TEXT_PREVIEW: 200,
    MAX_TREE_ELEMENTS_PER_PANEL: 2000,
    MAX_ANCHORS_PER_PAGE: 500,
  };

  // Selenium sets this global to collect without triggering a duplicate browser download.
  if (window.CA_STEP8_AUTOMATED_CAPTURE === true) CONFIG.DOWNLOAD_TXT = false;
  const SCHEMA_VERSION = '8.3';
  const url = new URL(location.href);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  assert(url.hostname === 'leginfo.legislature.ca.gov', 'Unexpected origin: ' + url.origin);
  assert(url.pathname === '/faces/displayCodeAndBill.xhtml', 'Wrong page: ' + url.pathname);
  const code = (url.searchParams.get('lawCode') || '').trim().toUpperCase();
  const section = (url.searchParams.get('sectionNum') || '').trim();
  const versionId = (url.searchParams.get('billVersionSectionId') || '').trim();
  assert(code && section && versionId, 'Missing lawCode / sectionNum / billVersionSectionId');
  const authorityId = code + ':' + section;
  const warnings = [];

  // CSS.escape may not be available in older embedded runtimes.
  const cssEscape = value => (window.CSS && CSS.escape)
    ? CSS.escape(value)
    : String(value).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c.codePointAt(0).toString(16) + ' ');
  const normalize = s => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  const abbreviate = s => normalize(s).slice(0, CONFIG.MAX_TEXT_PREVIEW);
  const tag = el => el?.tagName?.toLowerCase() || null;
  const directChildren = el => el ? [...el.children] : [];

  // XPath strings are escaped without invalid double/single-quote assumptions.
  function xpathLiteral(v) {
    v = String(v);
    if (!v.includes("'")) return "'" + v + "'";
    if (!v.includes('"')) return '"' + v + '"';
    return 'concat(' + v.split("'").map((part, i) => (i ? ',"\'",' : '') + "'" + part + "'").join('') + ')';
  }
  function fullXPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      let index = 1;
      for (let prev = cur.previousElementSibling; prev; prev = prev.previousElementSibling)
        if (prev.localName === cur.localName) index++;
      parts.unshift(cur.localName + '[' + index + ']');
      cur = cur.parentElement;
    }
    return '/' + parts.join('/');
  }
  function cssPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.id) {
        parts.unshift(tag(cur) + '#' + cssEscape(cur.id));
        break;
      }
      let nth = 1;
      for (let prev = cur.previousElementSibling; prev; prev = prev.previousElementSibling)
        if (prev.localName === cur.localName) nth++;
      parts.unshift(tag(cur) + ':nth-of-type(' + nth + ')');
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }
  function describeElement(el) {
    if (!el) return null;
    const id = el.getAttribute('id');
    return {
      tag: tag(el), element_id: id || null,
      class_names: [...(el.classList || [])],
      css_selector: cssPath(el),
      xpath: id ? '//*[@id=' + xpathLiteral(id) + ']' : fullXPath(el),
      full_xpath: fullXPath(el),
      parent_element_id: el.parentElement?.id || null,
      parent_css_selector: el.parentElement ? cssPath(el.parentElement) : null,
      child_element_count: el.children.length,
      attributes: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
      text_preview: abbreviate(el.innerText ?? el.textContent),
    };
  }
  function sanitizedHTML(element) {
    if (!element) return null;
    const clone = element.cloneNode(true);
    // Non-content/active elements removed. Anchor href preserved as source evidence.
    clone.querySelectorAll('script,style,iframe,object,embed,input,button,select,textarea,form,link,meta')
      .forEach(n => n.remove());
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      for (const a of [...node.attributes]) {
        if (/^on/i.test(a.name) || ['style', 'srcdoc'].includes(a.name.toLowerCase()))
          node.removeAttribute(a.name);
      }
    }
    return clone.outerHTML;
  }

  const root = document.getElementById('dispcodebillid');
  const current = document.getElementById('codeLawSectionNoHead');
  const historical = document.getElementById('billsectionxsl');
  assert(root && current && historical, 'Missing verified comparison DOM: form / current / historical');
  for (const [key, selector] of [
    ['current', '#codeLawSectionNoHead'], ['historical', '#billsectionxsl'],
  ]) {
    const count = document.querySelectorAll(selector).length;
    if (count !== 1) warnings.push('PANEL_NOT_UNIQUE_' + key.toUpperCase() + ':' + count);
  }

  // DOM inventory: element order, ancestry, attribute metadata, markup locators.
  // Uses all DOM tags in each content panel, not just elements matching a prebuilt CSS list.
  function elementInventory(panel) {
    if (!CONFIG.INCLUDE_ELEMENT_INVENTORY) return null;
    const nodes = [panel, ...panel.querySelectorAll('*')];
    if (nodes.length > CONFIG.MAX_TREE_ELEMENTS_PER_PANEL)
      warnings.push('ELEMENT_INVENTORY_TRUNCATED_' + panel.id + ':' + nodes.length);
    return nodes.slice(0, CONFIG.MAX_TREE_ELEMENTS_PER_PANEL).map((el, i) => ({
      traversal_index: i, ...describeElement(el),
    }));
  }

  // A text-only indentation hierarchy of markup, with preserved DOM parent locator.
  function domTree(panel) {
    const out = [];
    const walk = (el, depth, parentIndex) => {
      if (out.length >= CONFIG.MAX_TREE_ELEMENTS_PER_PANEL) return;
      const idx = out.length;
      out.push({node_index: idx, parent_index: parentIndex, depth,
        tag: tag(el), id: el.id || null, class_names: [...el.classList],
        css_selector: cssPath(el), full_xpath: fullXPath(el),
        direct_text: normalize([...el.childNodes]
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.nodeValue).join(' ')).slice(0, CONFIG.MAX_TEXT_PREVIEW),
      });
      for (const c of directChildren(el)) walk(c, depth + 1, idx);
    };
    walk(panel, 0, null);
    return out;
  }

  // Statutory subdivisions are parsed as a SEPARATE TEXT hierarchy from the DOM tree.
  // If the source wraps all text in one element, this is still useful. The pattern
  // detects line-leading (a), (1), (A), (i); it does not assume fixed nesting where
  // ambiguous Roman numerals and alphabetic markers coincide. Ambiguity is flagged.
  function statutoryTextHierarchy(text) {
    if (!CONFIG.INCLUDE_SUBDIVISION_HIERARCHY) return null;
    const lines = text.split('\n');
    const nodes = [];
    let offset = 0;
    let lastLetter = null, lastNumber = null, lastUpper = null;
    const levelFor = token => {
      if (/^\d+$/.test(token)) return 2;
      if (/^[A-Z]+$/.test(token)) return 3;
      if (/^[a-z]$/.test(token)) return 1;
      if (/^[ivxlcdm]+$/.test(token)) return 4;
      return null;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^\s*\(([a-zA-Z0-9]{1,6})\)\s*/);
      if (m) {
        const token = m[1];
        let level = levelFor(token);
        // Roman numerals (i), (v), (x) overlap single-letter lowercase tokens.
        // Do not silently assign them to level 4 without parent context.
        const isAmbiguous = /^[ivxlcdm]$/.test(token);
        if (isAmbiguous && (lastUpper || lastNumber)) level = 4;
        else if (isAmbiguous) level = 1;
        const parent = level > 1
          ? (level === 2 ? lastLetter : level === 3 ? lastNumber : lastUpper)
          : null;
        const n = {node_index: nodes.length, marker:'(' + token + ')',
          level, parent_index: parent, line_index:i, text_offset:offset + m.index,
          text_preview:abbreviate(line), ambiguous_roman_lowercase:isAmbiguous};
        nodes.push(n);
        if (level === 1) {lastLetter=n.node_index;lastNumber=null;lastUpper=null;}
        if (level === 2) {lastNumber=n.node_index;lastUpper=null;}
        if (level === 3) lastUpper=n.node_index;
      }
      offset += line.length + 1;
    }
    return {nodes, source:'RENDERED_TEXT_LINE_BASED',
      limitations:['Text wrapping can move a subdivision marker mid-line.',
        'Single-letter lowercase tokens may be Roman numerals; inspect ambiguous markers.',
        'Parent-child structure is heuristic pending cross-check against source DOM.']};
  }

  // HTML heading outline (WHATWG HTML): h1 through h6; hgroup participates
  // only when it contains a descendant h1..h6. Do NOT use visual font size.
  function headingOutline(panel) {
    if (!CONFIG.INCLUDE_HEADING_OUTLINE) return null;
    const nodes = [];
    const candidates = [panel, ...panel.querySelectorAll('h1,h2,h3,h4,h5,h6,hgroup')];
    for (const el of candidates) {
      if (!el.matches?.('h1,h2,h3,h4,h5,h6,hgroup')) continue;
      if (el.matches('hgroup') && !el.querySelector('h1,h2,h3,h4,h5,h6')) continue;
      // Child headings within a hgroup remain individually recorded; hgroup itself
      // forms a grouping node, not a fictitious extra heading rank.
      const rank = /^h([1-6])$/i.test(el.tagName) ? +el.tagName.slice(1) : null;
      nodes.push({type: el.localName === 'hgroup' ? 'HEADING_GROUP' : 'HEADING',
        rank, text:normalize(el.innerText || el.textContent),
        within_hgroup: !!el.closest('hgroup'), ...describeElement(el)});
    }
    return {nodes, specification_note:'hgroup requires descendant h1-h6; ranks come from h1-h6 tags, not CSS'};
  }

  // Legislative action headings are anchored at an actual DOM structural boundary.
  // This deliberately rejects cited 'Section 1748.40', inline 'Sec. 2.' from an
  // amendment-history note, and 'SECTION 1.' buried inside body prose.
  function extractLegislativeMarkers(panel) {
    const markers = [];
    const citations = [];
    const history = [];
    const seen = new Set();
    const action = /^(SECTION|SEC\.)\s+(\d+(?:\.\d+)?)\.(?=\s|$)/i;
    const candidateBlocks = [panel, ...panel.querySelectorAll('div,p,span,h1,h2,h3,h4,h5,h6,li')]
      .filter(el => el !== panel && !el.querySelector('div,p,span,h1,h2,h3,h4,h5,h6,li'));
    // Leaf blocks plus direct containers: SECTION 1. in span.ActionLine is a leaf.
    for (const el of candidateBlocks) {
      const t = normalize(el.innerText || el.textContent);
      if (!t) continue;
      if (/\b(?:Amended by|Added by|Repealed by) Stats\./i.test(t) && /^\(/.test(t)) {
        history.push({text:t, ...describeElement(el)}); continue;
      }
      const m = t.match(action);
      // Source convention: action line is a heading-like block (ActionLine or
      // section heading), not an isolated citation embedded in a body paragraph.
      if (!m || !(/ActionLine/i.test(el.className||'') || /^h[1-6]$/.test(el.localName) ||
        /^SECTION\s+\d+\./i.test(t))) continue;
      const key = m[1].toUpperCase()+':'+m[2]+':'+fullXPath(el);
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({classification:'LEGISLATIVE_ACTION_HEADING',marker:m[0],section_number:m[2],
        text:t, ...describeElement(el)});
    }
    // Non-action section references are retained separately, not silently dropped.
    for (const m of normalize(panel.innerText).matchAll(/\bSection\s+(\d+(?:\.\d+)*)\b/gi))
      citations.push({classification:'STATUTORY_SECTION_REFERENCE',reference:m[0],text_offset:m.index});
    return {action_headings:markers, statutory_references:citations,
      amendment_history:history, detection_method:'DOM_LEAF_BOUNDARY_ACTION_HEADINGS',
      limitations:['Historical pages can use different action-line wrappers; inspect warnings.']};
  }

  function semanticUnits(panel) {
    const elements = [panel, ...panel.querySelectorAll('p,div,li')];
    const units = [], seen = new Set();
    for (const el of elements) {
      if (el === panel || el.querySelector('p,div,li')) continue;
      const t = normalize(el.innerText || el.textContent).replace(/\s+/g,' ');
      if (!t) continue;
      const m = t.match(/^\(([a-z]|[A-Z]|\d+|[ivxlcdm]+)\)\s*/);
      if (!m) continue;
      const marker = '('+m[1]+')';
      // Use marker within an ordered parent series, not marker alone. For the
      // comparison page source the (1),(2) children belong to preceding (e).
      let level = /^\d+$/.test(m[1]) ? 2 : /^[A-Z]$/.test(m[1]) ? 3 : 1;
      if (/^[ivxlcdm]+$/.test(m[1]) && m[1].length > 1) level = 4;
      const lastLevel1 = [...units].reverse().find(x=>x.level===1);
      const parentMarker = level === 2 ? (lastLevel1?.marker || null) : null;
      const path = parentMarker ? parentMarker+'/'+marker : marker;
      const key = path + '|' + fullXPath(el);
      if (seen.has(key)) continue;
      seen.add(key);
      units.push({path,marker,parent_marker:parentMarker,level,
        text:t.slice(m[0].length).trim(),source_text:t, ...describeElement(el)});
    }
    return {units, method:'DOM_LEAF_BLOCKS_WITH_MARKER_AND_LOCATOR',
      limitations:['Non-block or multi-subdivision paragraphs require manual examination.',
      'Roman-marker nesting may require preceding context.']};
  }

  function extractPanel(el, kind, full) {
    const text = normalize(el.innerText);
    const raw = el.textContent || '';
    const desc = describeElement(el);
    return {
      panel_kind:kind, provenance:desc,
      content_mode:full ? 'SNAPSHOT_AND_STRUCTURE' : 'STEP_6_REFERENCE_WITH_STRUCTURE',
      current_statute_canonical:false,
      rendered_text_character_count:text.length,
      raw_text_character_count:raw.length,
      rendered_text:full ? text : null,
      raw_text_content:full ? raw : null,
      raw_dom_html:full && CONFIG.INCLUDE_RAW_DOM_HTML ? el.outerHTML : null,
      normalized_html:full ? sanitizedHTML(el) : null,
      raw_html_is_http_response:false,
      dom_element_inventory:elementInventory(el),
      dom_hierarchy:domTree(el),
      statutory_subdivision_hierarchy:statutoryTextHierarchy(text),
      legislative_section_markers:extractLegislativeMarkers(el),
      html_heading_outline:headingOutline(el),
      dom_statutory_units:semanticUnits(el),
      // Note HTML links from inside either panel are also included in page URL inventory.
      contained_anchor_count:el.querySelectorAll('a').length,
    };
  }

  // ---- URL & JSF navigation inventory: parsed without clicking. ----
  function jsfParameters(onclick) {
    const params = {};
    const re = /'([^'\\]*(?:\\.[^'\\]*)*)'\s*:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    for (const m of onclick.matchAll(re)) params[m[1]] = m[2];
    return params;
  }
  function hrefDescription(anchor) {
    const raw = anchor.getAttribute('href');
    if (!raw) return {raw_href:raw, resolved_url:null, type:'NO_HREF'};
    if (raw.trim() === '#') return {raw_href:raw, resolved_url:null, type:'JSF_OR_IN_PAGE_PLACEHOLDER'};
    if (/^javascript:/i.test(raw)) return {raw_href:raw, resolved_url:null, type:'JAVASCRIPT_HANDLER'};
    try {
      const resolved = new URL(raw, url.href);
      return {raw_href:raw, resolved_url:resolved.href,
        type: resolved.hash && resolved.origin === url.origin &&
          resolved.pathname === url.pathname && resolved.search === url.search
          ? 'IN_PAGE_FRAGMENT' : 'OBSERVED_HREF_RESOLVED'};
    } catch (_) {return {raw_href:raw,resolved_url:null,type:'UNPARSABLE_HREF'};}
  }
  function anchorDescriptor(a, i) {
    const form = a.closest('form');
    const handler = a.getAttribute('onclick') || '';
    const isJSF = /(?:mojarra\.jsfcljs|jsf\.cljs)/.test(handler);
    const formAction = form ? new URL(form.getAttribute('action') || url.pathname, url.href).href : null;
    return {
      anchor_index:i, label:normalize(a.innerText || a.textContent),
      ...describeElement(a), ...hrefDescription(a),
      handler_type:isJSF ? 'JSF_FORM_POST' : (handler ? 'OTHER_ONCLICK' : 'NONE'),
      jsf_parameters:isJSF ? jsfParameters(handler) : {},
      onclick_source:handler || null,
      form_id:form?.id || null, form_method:form?.getAttribute('method') || null,
      form_action_url:formAction,
      original_anchor_html:a.outerHTML,
      submission_executed:false,
      destination_status:isJSF?'UNRESOLVED_JSF_DESTINATION':'SEE_HREF_TYPE',
      viewstate_exported:false,
    };
  }
  const anchors = [...document.querySelectorAll('a')];
  if (anchors.length > CONFIG.MAX_ANCHORS_PER_PAGE)
    warnings.push('PAGE_ANCHOR_INVENTORY_TRUNCATED:' + anchors.length);
  const allLinks = anchors.slice(0, CONFIG.MAX_ANCHORS_PER_PAGE).map(anchorDescriptor);
  function linkById(id) {return allLinks.find(a => a.element_id === id) || null;}
  const amended = linkById('dispcodebillid:displayAsAmend');
  const back = linkById('dispcodebillid:goBackBtn');
  if (!amended) warnings.push('LAW_AS_AMENDED_CONTROL_NOT_FOUND');
  if (!back) warnings.push('RETURN_TO_CODE_CONTROL_NOT_FOUND');
  if (amended && amended.handler_type !== 'JSF_FORM_POST')
    warnings.push('LAW_AS_AMENDED_HANDLER_CHANGED');
  const args = amended?.jsf_parameters || {};
  if (args.lawCode && args.lawCode !== code) warnings.push('JSF_LAW_CODE_MISMATCH');
  if (args.sectionNum && args.sectionNum !== section) warnings.push('JSF_SECTION_MISMATCH');
  if (args.billVersionSectionId && args.billVersionSectionId !== versionId)
    warnings.push('JSF_BILL_VERSION_MISMATCH');

  const canonicalStatuteURL = new URL('/faces/codes_displaySection.xhtml', url.origin);
  canonicalStatuteURL.searchParams.set('lawCode', code);
  canonicalStatuteURL.searchParams.set('sectionNum', section);
  const crossRefURL = new URL('/faces/codeBillCrossRef.xhtml', url.origin);
  crossRefURL.searchParams.set('sectionNum', section);
  crossRefURL.searchParams.set('lawCode', code);
  // Constructed crossref page URL omits unknown nodeTreePath; candidate only.

  // Compare matching DOM-derived subdivision paths rather than whole-page prefix.
  // Legislative instructions and historical amendment notes remain separately
  // preserved, but do not pollute section-to-section comparisons.
  function textComparison(currentPanel, historicalPanel) {
    if (!CONFIG.INCLUDE_TEXT_COMPARE) return null;
    const cu = semanticUnits(currentPanel).units;
    const hu = semanticUnits(historicalPanel).units;
    const tokenize = s => s.replace(/\s+/g,' ').trim().split(/\s+/).filter(Boolean);
    function editOps(a,b) {
      // Word-aware LCS; O(m*n) bounded for each subdivision (not full document).
      const A=tokenize(a), B=tokenize(b);
      if (A.length*B.length > 250000) return {status:'TOO_LARGE_FOR_INLINE_DIFF',current_words:A.length,historical_words:B.length};
      const dp=Array.from({length:A.length+1},()=>new Uint32Array(B.length+1));
      for(let i=A.length-1;i>=0;i--) for(let j=B.length-1;j>=0;j--)
        dp[i][j]=A[i]===B[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
      const ops=[];let i=0,j=0;
      const push=(type,token)=> {const z=ops[ops.length-1];if(z?.type===type)z.tokens.push(token);else ops.push({type,tokens:[token]});};
      while(i<A.length&&j<B.length){if(A[i]===B[j]){push('equal',A[i]);i++;j++;}
        else if(dp[i+1][j]>=dp[i][j+1])push('historical_only',A[i++]);
        else push('current_only',B[j++]);}
      while(i<A.length)push('historical_only',A[i++]);
      while(j<B.length)push('current_only',B[j++]);
      return {status:'COMPARED',segments:ops.map(x=>({type:x.type,text:x.tokens.join(' ')}))};
    }
    const byPath = ar => new Map(ar.map(x=>[x.path,x]));
    const c=byPath(cu), h=byPath(hu);
    const matched=[...new Set([...c.keys(),...h.keys()])].map(path=>{
      const a=h.get(path), b=c.get(path);
      return {path,status:!a?'CURRENT_ONLY':!b?'HISTORICAL_ONLY':
        a.text===b.text?'UNCHANGED':'MODIFIED',
        current:b?{text:b.text,css_selector:b.css_selector,xpath:b.xpath}:null,
        historical:a?{text:a.text,css_selector:a.css_selector,xpath:a.xpath}:null,
        diff:a&&b&&a.text!==b.text?editOps(a.text,b.text):null};
    });
    const lead = panel => {
      const t=normalize(panel.innerText).replace(/\s+/g,' ');
      const escapedSection=section.split('').map(ch => /[0-9A-Za-z]/.test(ch) ? ch : '\\'+ch).join('');
      const m=t.match(new RegExp(escapedSection+'\\s*(For purposes of this (?:title|chapter):)','i'));
      return m?m[1]:null;
    };
    const historicalLead=lead(historicalPanel), currentLead=lead(currentPanel);
    return {method:'DOM_ALIGNED_LEGAL_UNITS',
      introductory_clause:{historical:historicalLead,current:currentLead,
        status:historicalLead===currentLead?'UNCHANGED':'MODIFIED',
        provenance:'PANEL_RENDERED_TEXT_EXACT_STATUTORY_SECTION_MATCH'},
      subdivisions:matched, modified_count:matched.filter(x=>x.status==='MODIFIED').length,
      unmatched_count:matched.filter(x=>x.status.endsWith('_ONLY')).length,
      limitations:['This is a comparison of the two observed panels, not a complete amendment history.',
        'Where DOM cannot identify a subdivision, no difference should be inferred.']};
  }
  const currentText = normalize(current.innerText);
  const historicalText = normalize(historical.innerText);
  if (!currentText) warnings.push('CURRENT_STATUTE_TEXT_EMPTY');
  if (!historicalText) warnings.push('HISTORICAL_BILL_TEXT_EMPTY');

  const result = {
    schema_version:SCHEMA_VERSION,
    record_type:'CALIFORNIA_DUAL_PANEL_STATUTE_AND_BILL_COMPARISON',
    extracted_at:new Date().toISOString(),
    configuration:CONFIG,
    identifiers:{authority_id:authorityId,law_code:code,section_number:section,
      bill_version_section_id:versionId,
      step_7_join_key:authorityId + '|' + versionId,
      step_7_bill_identity_status:'PENDING_VERIFIED_JOIN'},
    source:{observed_url:url.href,title:document.title,
      capture_type:'BROWSER_DOM_SNAPSHOT',
      comparison_form:describeElement(root),
      full_page_html:CONFIG.INCLUDE_FULL_PAGE_HTML ? document.documentElement.outerHTML : null,
      full_page_html_is_http_response:false},
    canonical_statute_reference:{authority_id:authorityId,canonical_step:6,
      url:canonicalStatuteURL.href,url_status:'GENERATED_CANONICAL_PATTERN_NOT_FETCHED',
      duplicate_current_content_is_canonical:false},
    panels:{
      current_statute:extractPanel(current,'CURRENT_CODIFIED_STATUTE',CONFIG.INCLUDE_BOTH_FULL_PANELS),
      historical_bill_section:extractPanel(historical,'SELECTED_HISTORICAL_BILL_SECTION',true),
    },
    navigation:{
      law_as_amended:amended,
      return_to_code:back,
      observed_navigation_links:CONFIG.INCLUDE_ALL_PAGE_LINKS ? allLinks : allLinks.filter(a=>a.handler_type==='JSF_FORM_POST'),
      law_as_amended_destination_url:null,
      law_as_amended_destination_status:'PENDING_BROWSER_VERIFICATION',
      current_amendment_context:{year:args.op_statues||null,chapter:args.op_chapter||null,
        section:args.op_section||null},
      historical_bill_identity_not_inferred_from_amendment_context:true,
    },
    url_inventory:{
      observed_comparison_page:{url:url.href,status:'OBSERVED'},
      canonical_statute:{url:canonicalStatuteURL.href,status:'GENERATED_PATTERN'},
      chaptered_bills_cross_reference:{url:crossRefURL.href,status:'INCOMPLETE_GENERATED_PATTERN_NO_NODE_TREE_PATH'},
      law_as_amended:{url:amended?.resolved_url||null,
        form_action:amended?.form_action_url||null,
        status:amended?.destination_status||'CONTROL_NOT_FOUND',
        raw_href:amended?.raw_href||null,
        parameters:amended?.jsf_parameters||{}},
      return_to_code:{url:back?.resolved_url||null,form_action:back?.form_action_url||null,
        status:back?.destination_status||'CONTROL_NOT_FOUND'},
      all_observed_hrefs:allLinks.filter(a=>a.resolved_url)
        .map(a=>({label:a.label,url:a.resolved_url,selector:a.css_selector,source_type:a.type})),
    },
    comparison:textComparison(current,historical),
    validation:{warnings,warning_count:warnings.length,
      current_text_observed_length:currentText.length,
      historical_text_observed_length:historicalText.length,
      both_panels_present:true,
      total_page_anchors:anchors.length,
      source_dom_current_elements:current.querySelectorAll('*').length+1,
      source_dom_historical_elements:historical.querySelectorAll('*').length+1,
      canonical_step_6_not_overwritten:true},
    limitations:[
      'DOM snapshots are not byte-identical original HTTP response HTML.',
      'CSS and XPath positions describe this rendered capture and may change.',
      'The law-as-amended control is JSF POST; run Selenium companion to observe its destination.',
      'This collector does not submit forms; browser companion records the verified transition separately.',
      'Historical bill version identity remains unverified until joined with Step 7.',
      'Subdivision parent assignment is heuristic and should be benchmarked.',
      'No legal effective or operative dates inferred.',
      'The optional full current text is noncanonical comparison evidence; canonical Step 6 remains authoritative in the database.',
    ],
  };
  window.CA_STEP8_DUAL_PANEL = result;
  window.CA_STEP8_URLS = result.url_inventory;

  if (CONFIG.DOWNLOAD_TXT) {
    const name = 'STEP8_3_' + code + '_' + section.replace(/[^A-Za-z0-9.-]/g,'_') +
      '_' + versionId + '_' + (CONFIG.INCLUDE_BOTH_FULL_PANELS ? 'BOTH' : 'HISTORICAL') + '_DOM_HIERARCHY.txt';
    const blob = new Blob([JSON.stringify(result,null,2)],{type:'text/plain;charset=utf-8'});
    const objectURL=URL.createObjectURL(blob);
    try {
      const a=document.createElement('a');a.href=objectURL;a.download=name;
      a.style.display='none';document.body.appendChild(a);a.click();a.remove();
    } finally {setTimeout(()=>URL.revokeObjectURL(objectURL),5000);}
  }
  // ------------------ BROWSER CONSOLE OUTPUT -----------------------------
  // The console view and TXT download are independent. The complete record
  // always remains accessible as window.CA_STEP8_DUAL_PANEL.
  if (CONFIG.OUTPUT_CONSOLE) {
    const display = rows => rows.slice(0, CONFIG.CONSOLE_MAX_ROWS);
    const panelSummary = (name, p) => ({
      panel: name,
      characters: p.rendered_text_character_count,
      dom_elements: p.dom_element_inventory?.length ?? 0,
      subdivisions: p.statutory_subdivision_hierarchy?.nodes?.length ?? 0,
      legislative_action_headings: p.legislative_section_markers?.length ?? 0,
      html_headings: Array.isArray(p.html_heading_outline)
        ? p.html_heading_outline.length : (p.html_heading_outline?.headings?.length ?? 0),
      css: p.provenance?.css_selector ?? '',
      xpath: p.provenance?.xpath ?? ''
    });
    console.groupCollapsed(`[CA Step ${SCHEMA_VERSION}] ${authorityId} | billVersionSectionId=${versionId}`);
    console.info('Full structured record: window.CA_STEP8_DUAL_PANEL');
    console.info('TXT download:', CONFIG.DOWNLOAD_TXT ? 'ENABLED' : 'DISABLED');
    console.table([panelSummary('current_statute', result.panels.current_statute),
                   panelSummary('historical_bill_section', result.panels.historical_bill_section)]);

    if (CONFIG.CONSOLE_SHOW_SUBDIVISIONS) {
      console.groupCollapsed('Statutory subdivision hierarchy (both panels)');
      for (const [name, panel] of Object.entries(result.panels)) {
        const nodes = panel.statutory_subdivision_hierarchy?.nodes || [];
        console.info(name);
        console.table(display(nodes.map(n => ({
          marker:n.marker, level:n.level, parent_index:n.parent_index,
          text_offset:n.text_offset, preview:n.text_preview
        }))));
      }
      console.groupEnd();
    }

    console.groupCollapsed('DOM-aligned changes');
    const cmp = result.comparison;
    if (cmp) {
      console.table([cmp.introductory_clause]);
      console.table(display((cmp.subdivisions || []).map(d => ({
        path:d.path, status:d.status,
        historical_xpath:d.historical?.xpath ?? null,
        current_xpath:d.current?.xpath ?? null
      }))));
      console.info('Full diffs: window.CA_STEP8_DUAL_PANEL.comparison.subdivisions');
    } else console.info('Comparison disabled');
    console.groupEnd();

    if (CONFIG.CONSOLE_SHOW_LINKS) {
      console.groupCollapsed('Law as amended / return to code / observed links');
      console.dir(result.navigation.law_as_amended);
      console.dir(result.navigation.return_to_code);
      console.table(display((result.navigation.observed_navigation_links || []).map(link => ({
        label:link.label ?? '', type:link.type ?? link.handler_type ?? '',
        url:link.resolved_url ?? null,
        css:link.css_selector ?? ''
      }))));
      console.info('JSF destination verification remains pending until Selenium visits it.');
      console.groupEnd();
    }

    if (CONFIG.CONSOLE_SHOW_DOM_ELEMENTS) {
      console.groupCollapsed('DOM element inventory (both panels)');
      for (const [name,panel] of Object.entries(result.panels)) {
        console.info(name);
        console.table(display((panel.dom_element_inventory || []).map(e => ({
          index:e.traversal_index, tag:e.tag, id:e.element_id,
          css:e.css_selector, xpath:e.xpath, parent:e.parent_css_selector
        }))));
      }
      console.groupEnd();
    }
    console.info('Validation:', result.validation);
    if (result.validation.warning_count) console.warn('Warnings:', result.validation.warnings);
    if (CONFIG.CONSOLE_FULL_JSON) console.log(JSON.stringify(result, null, 2));
    console.groupEnd();
  }
  return result;
})();
