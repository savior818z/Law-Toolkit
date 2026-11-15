/**
 * CALIFORNIA LEGAL HIERARCHY CRAWLER — STEP 3.1
 * Run in the browser console on codedisplayexpand.xhtml?tocCode=...
 * Read-only: inspects current DOM; does not fetch or navigate.
 * Output: CA_STEP03_<CODE>_HIERARCHY_REFINED.txt
 *
 * Evidence model:
 *  - document order and inline margin-left support a candidate tree
 *  - URL hierarchy parameters cross-check relationships
 *  - source HTML / URLs are retained verbatim
 *  - candidate parent relations are flagged when inconsistent
 */
(() => {
  'use strict';

  const root = document.querySelector('#expandedbranchcodesid');
  if (!root) throw new Error('Expanded hierarchy container #expandedbranchcodesid not found.');

  const page = new URL(location.href);
  const code = page.searchParams.get('tocCode');
  if (!code) throw new Error('Missing tocCode in the expanded-page URL.');
  if (!page.pathname.endsWith('/codedisplayexpand.xhtml')) {
    throw new Error('Expected a codedisplayexpand.xhtml page.');
  }

  const LEVELS = ['division', 'title', 'part', 'chapter', 'article'];
  const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
  const getAttrs = element => Object.fromEntries(
    [...element.attributes].map(a => [a.name, a.value])
  );
  const xpathOf = el => {
    if (!el) return null;
    const chunks = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.id) {
        chunks.unshift(`//*[@id=${JSON.stringify(n.id)}]`);
        break;
      }
      const preceding = [...n.parentElement?.children || []]
        .filter(x => x.tagName === n.tagName);
      chunks.unshift(`${n.tagName.toLowerCase()}[${preceding.indexOf(n) + 1}]`);
    }
    return chunks.join('/');
  };

  // Limit extraction to real, navigable hierarchy endpoints.
  // This excludes header links, form actions, and '#' JSF controls.
  const raw = [...root.querySelectorAll('a[href]')];
  const rejected = [];
  const rows = [];
  for (const [source_index, anchor] of raw.entries()) {
    const href = anchor.getAttribute('href') || '';
    let url;
    try { url = new URL(href, location.href); }
    catch (e) {
      rejected.push({source_index, href, reason: 'invalid_url'});
      continue;
    }
    const path = url.pathname;
    const isBranch = path.endsWith('/codes_displayexpandedbranch.xhtml');
    const isText = path.endsWith('/codes_displayText.xhtml');
    if (!isBranch && !isText) {
      rejected.push({source_index, href, reason: 'not_hierarchy_destination'});
      continue;
    }
    const targetCode = url.searchParams.get(isBranch ? 'tocCode' : 'lawCode');
    if (url.origin !== location.origin || targetCode !== code) {
      rejected.push({source_index, href, reason: 'origin_or_code_mismatch'});
      continue;
    }

    const label = normalize(anchor.textContent);
    const inner = anchor.querySelector('div[style*="margin-left"]');
    const style = inner?.getAttribute('style') || '';
    const inlineMatch = style.match(/(?:^|;)\s*margin-left\s*:\s*(\d+(?:\.\d+)?)px/i);
    const indent_px = inlineMatch ? Number(inlineMatch[1]) : null;
    const params = Object.fromEntries(url.searchParams.entries());
    const hierarchy = Object.fromEntries(LEVELS.map(k => [k, url.searchParams.get(k)]));
    const leading = label.match(/^(DIVISION|TITLE|PART|CHAPTER|ARTICLE)\s+([\d.]+)\s*/i);
    const range = label.match(/(?:\[\s*)?(\d+(?:\.\d+)?[a-z]?)\s*[-–]\s*(\d+(?:\.\d+)?[a-z]?)(?:\s*\])?$/i);
    rows.push({
      id: `${code}:expanded:${rows.length + 1}`,
      index: rows.length,
      source_index,
      code,
      label,
      heading_type: leading ? leading[1].toUpperCase() : 'SPECIAL',
      heading_number: leading ? leading[2] : null,
      section_start: range ? range[1] : null,
      section_end: range ? range[2] : null,
      indent_px,
      href,
      url: url.href,
      destination: isBranch ? 'expanded_branch' : 'display_text',
      parameters: params,
      hierarchy,
      dom: {
        anchor_xpath: xpathOf(anchor),
        parent_xpath: xpathOf(anchor.parentElement),
        container_tag: anchor.parentElement?.tagName.toLowerCase() || null,
        anchor_attributes: getAttrs(anchor),
        outer_html: anchor.outerHTML
      },
      parent_id: null,
      parent_basis: null,
      depth: null,
      issues: []
    });
  }

  // The hierarchy is visually flat: its anchors generally have sibling
  // wrappers. Use a stack of immediately preceding lower-indentation nodes.
  // Missing indentation is not silently assigned a parent.
  const stack = [];
  for (const row of rows) {
    if (row.indent_px === null) {
      row.issues.push('missing_inline_indentation');
      stack.length = 0;
      continue;
    }
    while (stack.length && stack.at(-1).indent_px >= row.indent_px) stack.pop();
    if (stack.length) {
      const parent = stack.at(-1);
      row.parent_id = parent.id;
      row.parent_basis = 'preceding_lower_inline_indent';
      row.depth = parent.depth === null ? null : parent.depth + 1;

      // A candidate child cannot contradict any populated parameter
      // on its candidate parent. Unpopulated values do not constrain it.
      const conflicts = LEVELS.filter(k =>
        parent.hierarchy[k] && row.hierarchy[k] !== parent.hierarchy[k]
      );
      if (conflicts.length) row.issues.push(`parent_parameter_mismatch:${conflicts.join(',')}`);
    } else {
      row.depth = 1;
    }
    stack.push(row);
  }

  const idToRow = new Map(rows.map(r => [r.id, r]));
  const childCount = new Map(rows.map(r => [r.id, 0]));
  for (const r of rows) {
    if (r.parent_id) childCount.set(r.parent_id, (childCount.get(r.parent_id) || 0) + 1);
  }
  for (const row of rows) {
    row.child_count = childCount.get(row.id);
    row.hierarchy_status = row.issues.length ? 'REVIEW' : 'INDENT_SUPPORTED';
    if (row.parent_id && !idToRow.has(row.parent_id)) {
      row.issues.push('unresolved_parent');
      row.hierarchy_status = 'REVIEW';
    }
  }

  const frequency = field => Object.fromEntries(
    [...new Set(rows.map(r => String(r[field])))]
      .sort((a,b) => a.localeCompare(b, undefined, {numeric:true}))
      .map(key => [key, rows.filter(r => String(r[field]) === key).length])
  );
  const warnings = rows.filter(r => r.issues.length);
  const duplicates = [];
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.url)) duplicates.push({index:r.index, other_index:seen.get(r.url), url:r.url});
    else seen.set(r.url, r.index);
  }
  const report = {
    schema_version: '3.1', step: 3,
    captured_at: new Date().toISOString(), code,
    source_url: location.href,
    hierarchy_container: '#expandedbranchcodesid',
    interpretation: 'indentation_supported_candidate_tree_cross_checked_against_url_parameters',
    summary: {
      raw_anchors: raw.length, accepted: rows.length,
      rejected: rejected.length, duplicate_urls: duplicates.length,
      source_destinations: frequency('destination'),
      source_indent_pixels: frequency('indent_px'),
      heading_types: frequency('heading_type'),
      candidate_roots: rows.filter(r => !r.parent_id).length,
      candidate_links: rows.filter(r => r.parent_id).length,
      rows_needing_review: warnings.length
    },
    rejected, duplicates,
    warnings: warnings.map(r => ({id:r.id,index:r.index,label:r.label,issues:r.issues})),
    nodes: rows
  };

  window.CA_STEP03_HIERARCHY = report;
  console.log('STEP 3.1 EXPANDED HIERARCHY:', report.summary);
  console.table(rows.map(r => ({index:r.index,label:r.label,indent:r.indent_px,depth:r.depth,parent_id:r.parent_id,children:r.child_count,status:r.hierarchy_status})));

  const tree = rows.map(r => {
    const prefix = r.depth === null ? '? ' : '  '.repeat(Math.max(0,r.depth-1)) + '- ';
    return `${prefix}${r.label} [${r.id}] (${r.destination}; ${r.hierarchy_status})`;
  }).join('\n');
  const txt = [
    'CALIFORNIA CODE — STEP 3.1 EXPANDED HIERARCHY',
    `CODE: ${code}`, `SOURCE: ${location.href}`,
    '', '========== SUMMARY ==========', JSON.stringify(report.summary,null,2),
    '', '========== CANDIDATE TREE ==========', tree,
    '', '========== VALIDATION WARNINGS ==========', JSON.stringify(report.warnings,null,2),
    '', '========== REJECTED ==========', JSON.stringify(rejected,null,2),
    '', '========== DUPLICATE URLS ==========', JSON.stringify(duplicates,null,2),
    '', '========== FULL STRUCTURED RECORDS ==========', JSON.stringify(report,null,2)
  ].join('\n');
  const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
  const objectURL = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectURL;
  link.download = `CA_STEP03_${code}_HIERARCHY_REFINED.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectURL), 2000);
  return report;
})();
