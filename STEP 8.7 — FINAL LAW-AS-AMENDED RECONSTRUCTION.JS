/*
STEP 8.7 — FINAL LAW-AS-AMENDED RECONSTRUCTION
Run in Microsoft Edge DevTools Console on /faces/asAmendsTheBill.xhtml.
Read-only: does not click, navigate, submit forms, or modify page HTML.
Exports one JSON-formatted .txt and prints a structured console report.
*/
(async () => {
  'use strict';
  const CFG = {
    DOWNLOAD_TXT: true,
    OUTPUT_CONSOLE: true,
    CONSOLE_FULL_JSON: false,
    CONSOLE_SHOW_ELEMENTS: false,
    INCLUDE_FULL_DOM_HTML: true,
    INCLUDE_COMPUTED_STYLES: true,
    MAX_ELEMENTS_PER_PANEL: 5000,
    MAX_CONSOLE_ROWS: 100
  };
  const warnings = [];
  const q = (s, root = document) => root.querySelector(s);
  const qa = (s, root = document) => Array.from(root.querySelectorAll(s));
  const clean = s => (s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  const norm = s => clean(s).replace(/\s+/g, ' ');
  const attr = el => Object.fromEntries(Array.from(el.attributes || [], a => [a.name, a.value]));
  const css = el => {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `${el.localName}#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.id) { parts.unshift(`${cur.localName}#${CSS.escape(cur.id)}`); break; }
      const same = cur.parentElement ? Array.from(cur.parentElement.children).filter(x => x.localName === cur.localName) : [cur];
      parts.unshift(`${cur.localName}:nth-of-type(${same.indexOf(cur) + 1})`);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  const xpath = el => {
    if (!el || el.nodeType !== 1) return null;
    const parts = [];
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      const siblings = cur.parentElement ? Array.from(cur.parentElement.children).filter(x => x.localName === cur.localName) : [cur];
      parts.unshift(`${cur.localName}[${siblings.indexOf(cur) + 1}]`);
    }
    return '/' + parts.join('/');
  };
  const style = el => {
    const c = getComputedStyle(el);
    const colorAncestor = el.closest('[color], [style*="color"]');
    return {
      inline_style: el.getAttribute('style'),
      declared_color: el.getAttribute('color'),
      nearest_declared_color: colorAncestor?.getAttribute('color') || colorAncestor?.style?.color || null,
      computed_color: c.color,
      computed_background_color: c.backgroundColor,
      computed_text_decoration_line: c.textDecorationLine,
      computed_font_style: c.fontStyle,
      computed_font_weight: c.fontWeight,
      computed_display: c.display
    };
  };
  const locate = el => el ? ({tag: el.localName, id: el.id || null, css: css(el), xpath: xpath(el), attributes: attr(el)}) : null;
  const getTextNodes = root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  };
  const editClass = el => {
    const owner = el?.closest?.('.deltaxml-old,.deltaxml-new');
    if (!owner) return null;
    return owner.classList.contains('deltaxml-old') ? 'delete' : 'insert';
  };
  // TextNode-preserving reconstruction avoids textContent's old+new concatenation.
  // Output faithfully follows source DOM order; add a space only where an actual
  // source text node contains one. Norm() is used for validation, not archival.
  const reconstruct = (root, mode) => {
    if (!root) return '';
    const chunks = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const change = editClass(node.parentElement);
        if (!((mode === 'before' && change === 'insert') || (mode === 'after' && change === 'delete'))) {
          chunks.push(node.nodeValue || '');
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node !== root && ['DIV','P','BR','LI','H1','H2','H3','H4','H5','H6'].includes(node.tagName)) chunks.push('\n');
      }
      node = walker.nextNode();
    }
    return chunks.join('').replace(/\u00a0/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  const inventory = root => {
    if (!root) return [];
    const els = [root, ...qa('*', root)].slice(0, CFG.MAX_ELEMENTS_PER_PANEL);
    return els.map((el, i) => ({
      node_index: i,
      parent_index: el === root ? null : els.indexOf(el.parentElement),
      depth: el === root ? 0 : (() => { let d=0, p=el; while(p && p!==root) { d++; p=p.parentElement; } return d; })(),
      ...locate(el),
      own_text: Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.nodeValue).join('').trim(),
      ...(CFG.INCLUDE_COMPUTED_STYLES ? {style: style(el)} : {})
    }));
  };
  const directBlocks = root => root ? qa(':scope > div, :scope > p, :scope > section', root) : [];
  const markerFor = text => {
    const m = norm(text).match(/^\(([a-z]|\d+|[A-Z]|[ivxlcdm]+)\)(?=\s|\S)/);
    return m?.[1] || null;
  };
  const subdivisionHierarchy = root => {
    const result = []; let letter = null, number = null, capital = null;
    const blocks = directBlocks(root);
    for (const el of blocks) {
      const t = norm(el.textContent);
      const m = t.match(/^\(([a-z]|\d+|[A-Z]|[ivxlcdm]+)\)/);
      if (!m) continue;
      const tok = m[1]; let level; let parent = null;
      // Contextual ordering distinguishes lowercase roman vs letter where possible.
      if (/^\d+$/.test(tok)) { level=2; parent=letter; number=result.length; }
      else if (/^[A-Z]$/.test(tok)) { level=3; parent=number; capital=result.length; }
      else if (/^[a-z]$/.test(tok)) { level=1; letter=result.length; number=null; capital=null; }
      else { level=4; parent=capital; }
      result.push({node_index: result.length, marker:`(${tok})`, level, parent_index: parent,
        text:t, locator:locate(el), style: CFG.INCLUDE_COMPUTED_STYLES ? style(el) : null,
        hierarchy_confidence: (level === 4 || (level > 1 && parent == null)) ? 'REVIEW' : 'STRUCTURAL'});
    }
    return result;
  };
  const headingInventory = root => root ? qa('h1,h2,h3,h4,h5,h6,hgroup',root).filter(el => el.localName !== 'hgroup' || !!q('h1,h2,h3,h4,h5,h6',el)).map(el => ({
    tag: el.localName, text:norm(el.textContent), locator:locate(el),
    grouped_heading: !!el.closest('hgroup'), heading_level: /^h[1-6]$/.test(el.localName) ? Number(el.localName[1]) : null
  })) : [];
  const id = new URL(location.href);
  const source = {url: location.href, title: document.title, path: location.pathname,
    law_code: id.searchParams.get('lawCode'), section_number:id.searchParams.get('sectionNum'),
    bill_version_section_id:id.searchParams.get('billVersionSectionId'),
    captured_at:new Date().toISOString(), method:'LIVE_BROWSER_DOM_SNAPSHOT'};
  if (!/\/asAmendsTheBill\.xhtml$/i.test(location.pathname)) warnings.push('Not on asAmendsTheBill.xhtml; confirm navigation.');
  const current = q('#codeLawSectionNoHead');
  const redline = q('#code_sec_as_amends_the_bill2');
  if (!current) warnings.push('Missing #codeLawSectionNoHead current-statute panel.');
  if (!redline) warnings.push('Missing #code_sec_as_amends_the_bill2 redline panel.');
  const oldElems = redline ? qa('.deltaxml-old', redline) : [];
  const newElems = redline ? qa('.deltaxml-new', redline) : [];
  const parentBlock = el => {
    const blocks = directBlocks(redline);
    let p=el;
    while (p && p!==redline) { if (blocks.includes(p)) return p; p=p.parentElement; }
    return null;
  };
  const edits = [...oldElems.map(el=>({kind:'delete',el})), ...newElems.map(el=>({kind:'insert',el}))]
    .sort((a,b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
    .map(({kind,el},i) => {
      const block = parentBlock(el);
      const a = block ? directBlocks(redline).indexOf(block) : null;
      const prev = el.previousSibling?.textContent || '';
      const next = el.nextSibling?.textContent || '';
      return {edit_index:i, kind, text:el.textContent, text_normalized:norm(el.textContent),
        locator:locate(el), containing_block:locate(block), block_index:a,
        subdivision_marker: block ? markerFor(block.textContent) : null,
        context_before:norm(prev).slice(-120), context_after:norm(next).slice(0,120),
        style:style(el), parent_markup:el.parentElement?.outerHTML || null,
        ancestor_tags:(()=>{const tags=[];let p=el.parentElement;while(p && p!==redline){tags.push(p.localName);p=p.parentElement;}return tags;})()};
    });
  const baseText = reconstruct(redline,'before');
  const amendedText = reconstruct(redline,'after');
  const currentParagraphs = current ? qa('p',current).map(el=>norm(el.textContent)).filter(Boolean) : [];
  const reconstructedBlocks = directBlocks(redline).map((el,i)=>({
    block_index:i, locator:locate(el), marker:markerFor(el.textContent),
    original:reconstruct(el,'before'), amended:reconstruct(el,'after'),
    has_edits: !!q('.deltaxml-old,.deltaxml-new',el)
  }));
  const references = qa('a[href],link[href],script[src],img[src],form[action],iframe[src],object[data]').map(el=>{
    const raw=el.getAttribute('href') ?? el.getAttribute('src') ?? el.getAttribute('action') ?? el.getAttribute('data');
    let url=null; try{url=new URL(raw,location.href).href;}catch{}
    return {tag:el.localName, label:norm(el.textContent).slice(0,140), raw, url,
      is_pdf_candidate: /\.pdf(?:[?#]|$)/i.test(url||'') || /pdf/i.test(el.textContent||''), locator:locate(el)};
  });
  const navControls = qa('a,button,input[type=submit],input[type=button]').filter(el=>/return back to code|compare|pdf|download/i.test(norm(el.textContent+' '+(el.value||'')+' '+(el.title||'')))).map(el=>({
    label:norm(el.textContent||el.value||el.title), locator:locate(el), href:el.getAttribute('href'),
    onclick:el.getAttribute('onclick'), form_action:el.closest('form')?.getAttribute('action')||null
  }));
  const beforeIntro = reconstructedBlocks.find(x=>x.has_edits);
  const currentPlain = current ? norm(current.innerText || current.textContent) : '';
  const amendedSubdivisions = reconstructedBlocks.filter(x => /^\([a-zA-Z0-9]+\)/.test(norm(x.amended)));
  const missingFromCurrent = amendedSubdivisions.filter(x => !currentParagraphs.includes(norm(x.amended)));
  const validation = {
    old_markers:oldElems.length, new_markers:newElems.length,
    changed_blocks:reconstructedBlocks.filter(x=>x.has_edits).length,
    amended_subdivision_blocks:amendedSubdivisions.length,
    amended_subdivision_matches_in_current:amendedSubdivisions.length-missingFromCurrent.length,
    unmatched_amended_subdivisions:missingFromCurrent.map(x=>({marker:x.marker, text:x.amended.slice(0,180)})),
    introduction_matches_current:beforeIntro ? currentPlain.includes(norm(beforeIntro.amended)) : null,
    reconciliation_scope:'COMPARISON OF INTRODUCTION AND DIRECT SUBDIVISION BLOCKS; CURRENT PANEL INCLUDES HEADING AND LEGISLATIVE HISTORY',
    status: (!current||!redline) ? 'FAIL' : missingFromCurrent.length ? 'REVIEW' : 'PASS_WITH_SCOPE_LIMITATIONS'
  };
  if (missingFromCurrent.length) warnings.push('Some reconstructed amended subdivisions do not exactly match current statute paragraphs.');
  if (beforeIntro && !validation.introduction_matches_current) warnings.push('Amended introduction does not exactly match current-statute text.');
  if (!edits.length) warnings.push('No DeltaXML old/new markers found; page may be unchanged or use different markup.');
  const report = {
    schema_version:'8.7', record_type:'CA_LAW_AS_AMENDED_RECONSTRUCTION_FINAL', config:CFG, source,
    panels:{
      current_statute:{locator:locate(current), text:current?.innerText||null,
        raw_dom_html: CFG.INCLUDE_FULL_DOM_HTML ? current?.outerHTML||null : null,
        element_inventory:inventory(current), headings:headingInventory(current)},
      law_as_amended:{locator:locate(redline), redline_rendered_text:redline?.innerText||null,
        exact_redline_html:CFG.INCLUDE_FULL_DOM_HTML ? redline?.outerHTML||null : null,
        reconstructed_original_text:baseText, reconstructed_amended_text:amendedText,
        blocks:reconstructedBlocks, element_inventory:inventory(redline), headings:headingInventory(redline),
        amended_subdivision_hierarchy:subdivisionHierarchy(redline)}
    },
    edits,
    grouped_edits: reconstructedBlocks.filter(x=>x.has_edits).map(b=>({block_index:b.block_index,
      marker:b.marker, before:b.original, after:b.amended,
      edits:edits.filter(e=>e.block_index===b.block_index).map(e=>({kind:e.kind,text:e.text,color:e.style.computed_color,xpath:e.locator.xpath}))})),
    links:{observed_urls:references, pdf_candidates:references.filter(x=>x.is_pdf_candidate), navigation_controls:navControls},
    validation,warnings,
    hashes:{status:'PENDING'}
  };
  const sha256 = async s => {
    if (!crypto?.subtle) return null;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
  };
  try {
    report.hashes = {algorithm:'SHA-256',
      current_panel_html:await sha256(current?.outerHTML||''),
      redline_panel_html:await sha256(redline?.outerHTML||''),
      reconstructed_original:await sha256(baseText),
      reconstructed_amended:await sha256(amendedText),
      note:'Hashes are of browser DOM snapshots/text, not original HTTP response bytes.'};
  } catch(e) { report.hashes={status:'UNAVAILABLE',reason:String(e)}; }
  window.CA_STEP8_7_FINAL = report;
  if (CFG.OUTPUT_CONSOLE) {
    console.group('STEP 8.7 — LAW AS AMENDED / FINAL RECONSTRUCTION');
    console.log('SOURCE',source.url);
    console.log('ORIGINAL TEXT\n'+baseText);
    console.log('AMENDED TEXT\n'+amendedText);
    console.log('COLORED REDLINE HTML', redline?.outerHTML||null);
    console.table(edits.slice(0,CFG.MAX_CONSOLE_ROWS).map(e=>({kind:e.kind,text:e.text,color:e.style.computed_color,decoration:e.style.computed_text_decoration_line,italic:e.style.computed_font_style,block:e.block_index,css:e.locator.css,xpath:e.locator.xpath})));
    console.table(report.grouped_edits.slice(0,CFG.MAX_CONSOLE_ROWS));
    console.table(references.slice(0,CFG.MAX_CONSOLE_ROWS).map(x=>({tag:x.tag,label:x.label,url:x.url,pdf_candidate:x.is_pdf_candidate})));
    console.log('PDF CANDIDATES',report.links.pdf_candidates);
    console.log('VALIDATION',validation,'WARNINGS',warnings);
    if (CFG.CONSOLE_SHOW_ELEMENTS) {console.table(report.panels.current_statute.element_inventory);console.table(report.panels.law_as_amended.element_inventory);}
    if (CFG.CONSOLE_FULL_JSON) console.dir(report);
    console.groupEnd();
  }
  if (CFG.DOWNLOAD_TXT) {
    const name = `STEP8_7_${source.law_code||'CODE'}_${source.section_number||'SECTION'}_${source.bill_version_section_id||'VERSION'}_FINAL_LAW_AMENDED.txt`.replace(/[^a-zA-Z0-9_.-]/g,'_');
    const blob=new Blob([JSON.stringify(report,null,2)],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    console.info('Step 8.7 export:',name);
  }
  return report;
})();
