/* California Rules of Court — parser-only v3.1
 * No crawling, UI, persistence, or exports.
 * API: CRCParser.parseRule(doc,url,article?), parseTitleIndex(doc,url),
 *      buildHierarchy(records,titleIndexes?), parseDocument(doc,url)
 */
(function (global) {
  'use strict';
  const clean = s => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizeUrl = (url, base = global.location?.href || 'https://courts.ca.gov/') => {
    const u = new URL(url, base); u.hash = ''; u.search = ''; return u.href;
  };
  const RULE_PATH = /\/cms\/rules\/index\/[^/?#]+\/rule\d+_\d+/i;
  const escapeHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const ruleNumberFromUrl = url => { const m = new URL(url).pathname.match(/\/rule(\d+)_(\d+)/i); return m ? `${m[1]}.${m[2]}` : null; };
  const isFollowing = (a,b) => !!(a.compareDocumentPosition(b) & 4);
  function captureDocumentTopToFooter(doc, article = null) {
    const starts = [...doc.querySelectorAll('#document_top')];
    let start = article ? starts.filter(s => s === article || isFollowing(s,article)).at(-1) : starts[0];
    if (!start && article) start = article;
    if (!start) return null;
    const footer = [...doc.querySelectorAll('footer')].find(f => isFollowing(start,f));
    const range = doc.createRange(); range.setStartBefore(start);
    if (footer) range.setEndBefore(footer);
    else { const main = start.closest('main'); range.setEndAfter(main || (article || start)); }
    const wrapper = doc.createElement('div'); wrapper.appendChild(range.cloneContents());
    return wrapper.innerHTML;
  }
  function articleSourceUrl(article, base = global.location?.href || 'https://courts.ca.gov/') {
    const about = article.getAttribute('about');
    if (!about) throw new Error('Rule article lacks an about URL');
    const u = new URL(about, base);
    if (!RULE_PATH.test(u.pathname)) throw new Error('Invalid rule article URL: ' + about);
    return normalizeUrl(u.href);
  }
  function extractAuthorities(nodes) {
    const patterns = [
      {type:'california_constitution', re:/\b(?:California Constitution|Cal\.\s*Const\.)\s*,?\s*(?:article|art\.)\s+([IVXLCDM]+|\d+)\s*,?\s*(?:section|§)\s*(\d+(?:\.\d+)?(?:\([a-z0-9]+\))*)/gi, cite:m=>`Cal. Const., art. ${m[1]}, § ${m[2]}`},
      {type:'california_constitution', re:/\b(?:article|art\.)\s+([IVXLCDM]+|\d+)\s*,?\s*(?:section|§)\s*(\d+(?:\.\d+)?(?:\([a-z0-9]+\))*)\s*,?\s*of the Constitution of the State of California/gi, cite:m=>`Cal. Const., art. ${m[1]}, § ${m[2]}`},
      {type:'california_statute', re:/\b(Code of Civil Procedure|Civil Code|Evidence Code|Penal Code|Government Code|Business and Professions Code|Family Code|Probate Code|Welfare and Institutions Code)\s*(?:section|sections|§|§§)\s*(\d+(?:\.\d+)?(?:\([a-z0-9]+\))*)/gi, cite:m=>`${m[1]}, § ${m[2]}`},
      {type:'court_rule', re:/\b(?:California Rules of Court|Cal\.\s*Rules of Court)\s*,?\s*rule\s+(\d+(?:\.\d+)+)/gi, cite:m=>`Cal. Rules of Court, rule ${m[1]}`},
      {type:'court_rule', re:/\brule\s+(\d+(?:\.\d+)+)\b/gi, cite:m=>`Cal. Rules of Court, rule ${m[1]}`}
    ];
    const refs = [], seen = new Set();
    for (const node of nodes) {
      if (['rule_history','subdivision_history','chapter_history'].includes(node.type)) continue;
      for (const p of patterns) {
        p.re.lastIndex = 0;
        for (const m of node.text.matchAll(p.re)) {
          const citation = p.cite(m), key = `${node.id}|${p.type}|${citation}|${m.index}`;
          if (seen.has(key)) continue; seen.add(key);
          refs.push({type:p.type,citation,matched_text:m[0],node_id:node.id,source_citation:node.citation,start:m.index,end:m.index+m[0].length,confidence:'pattern_match',verification:'not_verified'});
        }
      }
    }
    return refs;
  }
  function parseRule(doc, url, selectedArticle = null) {
    url = normalizeUrl(url);
    const article = selectedArticle || [...doc.querySelectorAll('article.roc__rule')].find(a => {
      try { return articleSourceUrl(a,url) === url; } catch { return false; }
    }) || doc.querySelector('article.roc__rule');
    if (!article) throw new Error('Rule article not found');
    const root = [...article.querySelectorAll('.roc__rule__content .jcc-rulesformatting, .jcc-rulesformatting')].find(el => el.closest('article.roc__rule') === article);
    if (!root) throw new Error('Rule formatting container not found');
    const headingEl = [...article.querySelectorAll('h1.hangover__title, h1')].find(el => el.closest('article.roc__rule') === article);
    const heading = clean(headingEl?.textContent);
    const match = heading.match(/^Rule\s+(\d+(?:\.\d+)+)\.?\s*(.*)$/i);
    const number = match?.[1] || ruleNumberFromUrl(url);
    if (!number) throw new Error('Rule number not found');
    const base = `CRC:${number}`, nodes = [], issues = [], structural = new Set([base]);
    let subdivision=null, paragraph=null, subparagraph=null, item=null, advisory=false, index=0;
    const citation = (...parts) => base + parts.filter(x=>x!==null && x!==undefined && x!=='').map(x=>`(${x})`).join('');
    const push = (el,type,marker,parent,extra={}) => {
      const isStructural = ['subdivision','paragraph','numbered_item','subparagraph','item'].includes(type);
      const cite = isStructural && marker ? `${parent}(${marker})` : parent;
      if (isStructural && marker) { if (structural.has(cite)) issues.push(`Duplicate structural citation: ${cite}`); structural.add(cite); }
      const n={id:`${base}#${++index}`,order:index,type,marker:marker||null,citation:cite,parent_citation:parent,
        text:clean(el.textContent),raw_text:el.textContent,html_class:el.getAttribute('class')||'',source_html:el.outerHTML,tag_name:el.tagName.toLowerCase(),...extra};
      nodes.push(n); return n;
    };
    // Preserve each source element verbatim; derived prose is additionally indexed, not substituted.
    const elements=[...root.children];
    let sibling=root.nextElementSibling;
    while(sibling && (sibling.matches('.advcommheader,.advcommtext,.jcc-rulesformatting') || sibling.querySelector('.advcommheader,.advcommtext'))) {
      if(sibling.matches('.jcc-rulesformatting')) elements.push(...sibling.children);
      else if(sibling.matches('.advcommheader,.advcommtext')) elements.push(sibling);
      else elements.push(...sibling.querySelectorAll('.advcommheader,.advcommtext'));
      sibling=sibling.nextElementSibling;
    }
    const markerRe=/^\(([A-Za-z0-9]+)\)\s*/;
    for(const el of elements) {
      if(!['P','DIV','OL','UL'].includes(el.tagName)) continue;
      if(el.closest('.infy-scroll-divider,.autopagerize_page_info')) continue;
      const raw=clean(el.textContent); if(!raw) continue;
      const cls=el.classList, markerCandidate=raw.match(markerRe)?.[1]||null;
      let type='other', marker=null, parent=base;
      if(/^Chapter\s+\d+\s+(?:adopted|amended|repealed|renumbered)\b/i.test(raw)) {type='chapter_history';parent=null;}
      else if(cls.contains('advcommheader') || /^Advisory Committee Comment/i.test(raw)) {type='advisory_heading';advisory=true;subdivision=paragraph=subparagraph=item=null;parent=null;}
      else if(cls.contains('advcommtext') || advisory && !cls.contains('subdivheading') && !cls.contains('rulehist') && !cls.contains('subdhist')) {type='advisory_text';parent=null;}
      else if(cls.contains('subdivheading')) {advisory=false;type='subdivision';marker=raw.match(/^\(([a-z])\)/)?.[1]||null;subdivision=marker;paragraph=subparagraph=item=null;}
      else if(/^Rule\s+\d+(?:\.\d+)+\s+(?:amended|adopted|repealed|renumbered)\b/i.test(raw) || cls.contains('rulehist') || cls.contains('RuleHistory')) {type='rule_history';}
      else if(/^\(Subd\s*\([a-z]\)\s+(?:amended|adopted|relettered|repealed)\b/i.test(raw) || cls.contains('subdhist')) {type='subdivision_history';parent=subdivision?citation(subdivision):base;}
      else if(cls.contains('itemlist') || (markerCandidate && /^[ivxlcdm]+$/.test(markerCandidate) && subparagraph)) {type='item';marker=markerCandidate;parent=citation(subdivision,paragraph,subparagraph);item=marker;}
      else if(cls.contains('subparagraphnolist')) {type='subparagraph_text';parent=citation(subdivision,paragraph,subparagraph);}
      else if(cls.contains('paragraphnolist')) {type='paragraph_text';parent=citation(subdivision,paragraph);}
      else if(cls.contains('subparagraphlist') || (markerCandidate && /^[A-Z]$/.test(markerCandidate) && paragraph)) {type='subparagraph';marker=markerCandidate;parent=citation(subdivision,paragraph);subparagraph=marker;item=null;}
      else if(cls.contains('paragraphlist') || cls.contains('numberedlist') || cls.contains('NumbersLeft0ptFirstline0pt') || (markerCandidate && /^\d+$/.test(markerCandidate))) {type=subdivision?'paragraph':'numbered_item';marker=markerCandidate;parent=subdivision?citation(subdivision):base;paragraph=marker;subparagraph=item=null;}
      else if(cls.contains('subdivtext') || cls.contains('normal')) {type=subdivision?'subdivision_text':'rule_text';parent=subdivision?citation(subdivision):base;}
      else if(raw==='1' && el.tagName==='P' && !el.getAttribute('class')) {type='source_artifact';parent=null;}
      else {issues.push(`Unclassified ${el.tagName}.${el.getAttribute('class')||''}: ${raw.slice(0,100)}`);}
      if(['subdivision','paragraph','numbered_item','subparagraph','item'].includes(type) && !marker) issues.push(`Missing marker: ${raw.slice(0,100)}`);
      const n=push(el,type,marker,parent);
      if(type==='subdivision' && marker) {
        // Heading can contain operative prose following the marker and heading label.
        const strong=el.querySelector(':scope > strong');
        if(strong) {
          const children=[...el.childNodes], pos=children.indexOf(strong);
          if(pos>=0) {
            const tail=children.slice(pos+1).map(x=>x.textContent).join('');
            if(clean(tail)) nodes.push({id:`${base}#${++index}`,order:index,type:'subdivision_text',marker:null,citation:n.citation,parent_citation:n.citation,text:clean(tail),raw_text:tail,html_class:n.html_class,source_html:el.outerHTML,tag_name:n.tag_name,derived_from_mixed_heading:true,source_node_id:n.id});
          }
        }
      }
    }
    const cleaned_html=`<article class="roc__rule" data-source-url="${escapeHtml(url)}"><h1>${escapeHtml(heading)}</h1>${root.outerHTML}${elements.slice(root.children.length).map(el=>el.outerHTML).join('')}</article>`;
    return {rule_number:number,title:match?clean(match[2]):heading,heading,source_url:url,extracted_at:new Date().toISOString(),
      cleaned_html,source_section_html:captureDocumentTopToFooter(doc,article),nodes,authority_references:extractAuthorities(nodes),issues,
      status:/\[repealed\]/i.test(heading)?'repealed':'active'};
  }
  function parseTitleIndex(doc,pageUrl) {
    pageUrl=normalizeUrl(pageUrl);
    const path=new URL(pageUrl).pathname;
    const articles=[...doc.querySelectorAll('article.roc__document')];
    const article=articles.find(a=>a.getAttribute('about')===path) || articles.find(a=>a.querySelector('.roc__rule-index__content'));
    const root=article?.querySelector('.roc__rule-index__content');
    if(!root) throw new Error('Title index not found');
    const title=clean(article.querySelector('h1.hangover__title, h1')?.textContent);
    const date=article.querySelector('time[datetime]'), chapters=[], warnings=[], seen=new Set();
    for(const li of root.querySelectorAll('ul.rule-section > li.paragraph--type--rule-section--default')) {
      const chapter=clean([...li.children].find(e=>e.tagName==='DIV')?.textContent);
      const rules=[];
      for(const a of li.querySelectorAll(':scope > ul.list__container a[href]')) {
        const u=new URL(a.getAttribute('href'),pageUrl); if(u.origin!==new URL(pageUrl).origin || !RULE_PATH.test(u.pathname)) continue;
        const label=clean(a.textContent), m=label.match(/^Rule\s+(\d+(?:\.\d+)+)\.?\s*(.*)$/i);
        if(!m) {warnings.push(`Unrecognized rule link: ${label}`);continue;}
        if(seen.has(u.pathname)) {warnings.push(`Duplicate rule link: ${u.pathname}`);continue;}
        seen.add(u.pathname);
        rules.push({rule_number:m[1],title:clean(m[2]),label,url:normalizeUrl(u.href),repealed:/\[repealed\]/i.test(label)});
      }
      if(rules.length) chapters.push({chapter,rules});
    }
    if(!chapters.length) throw new Error('No chapter links found');
    const attachments=[...root.querySelectorAll('.roc__rule-index__attached-files a[href]')].map(a=>({label:clean(a.textContent),url:new URL(a.getAttribute('href'),pageUrl).href}));
    return {title,source_url:pageUrl,source_section_html:captureDocumentTopToFooter(doc,article),current_as_of:clean(date?.textContent),datetime:date?.getAttribute('datetime')||null,chapters,attachments,warnings,rule_count:chapters.reduce((n,ch)=>n+ch.rules.length,0)};
  }
  function buildHierarchy(records,titleIndexes=[]) {
    const indexByNumber=new Map();
    for(const idx of titleIndexes) for(const ch of idx.chapters||[]) for(const r of ch.rules||[]) indexByNumber.set(r.rule_number,{title:idx.title,chapter:ch.chapter});
    const titles=new Map(), unresolvedParents=[],collisions=[];
    for(const rule of records) {
      const idx=indexByNumber.get(rule.rule_number)||{};
      const titleName=idx.title||rule.title_index?.title||`Title ${rule.rule_number.split('.')[0]}`;
      const chapterName=idx.chapter||rule.title_index?.chapter||'Unindexed';
      if(!titles.has(titleName)) titles.set(titleName,{type:'title',title:titleName,chapters:[]});
      const title=titles.get(titleName);
      let chapter=title.chapters.find(x=>x.chapter===chapterName);
      if(!chapter) {chapter={type:'chapter',chapter:chapterName,rules:[],histories:[]};title.chapters.push(chapter);}
      const root={type:'rule',rule_number:rule.rule_number,title:rule.title,citation:`CRC:${rule.rule_number}`,source_url:rule.source_url,status:rule.status,children:[],advisory_comments:[],source_artifacts:[]};
      const byCitation=new Map([[root.citation,root]]);
      let advisoryHeading=null,commentaryOn=null;
      for(const node of rule.nodes||[]) {
        const item={...node,children:[]};
        if(node.type==='chapter_history') {chapter.histories.push({...item,source_rule:rule.rule_number});continue;}
        if(node.type==='source_artifact') {root.source_artifacts.push(item);continue;}
        if(node.type==='advisory_heading') {root.advisory_comments.push(item);advisoryHeading=item;commentaryOn=null;continue;}
        if(node.type==='advisory_text') {
          const m=node.text.match(/^Subdivision\s*\(([a-z])\)(?:\((\d+)\))?(?:\(([A-Z]+)\))?\s*\./i);
          if(m) commentaryOn=root.citation+`(${m[1].toLowerCase()})`+(m[2]?`(${m[2]})`:'')+(m[3]?`(${m[3]})`:'');
          item.commentary_on=commentaryOn;
          (advisoryHeading?advisoryHeading.children:root.advisory_comments).push(item);continue;
        }
        const parent=byCitation.get(node.parent_citation)||root;
        if(node.parent_citation && !byCitation.has(node.parent_citation)) {item.unresolved_parent_citation=node.parent_citation;unresolvedParents.push({rule_number:rule.rule_number,node_id:node.id,parent_citation:node.parent_citation});}
        parent.children.push(item);
        if(['subdivision','paragraph','numbered_item','subparagraph','item'].includes(node.type) && node.citation) {
          if(byCitation.has(node.citation)) collisions.push({rule_number:rule.rule_number,citation:node.citation,node_id:node.id});
          else byCitation.set(node.citation,item);
        }
      }
      chapter.rules.push(root);
    }
    return {schema_version:'3.1',generated_at:new Date().toISOString(),titles:[...titles.values()],reconciliation:{source_nodes:records.reduce((n,r)=>n+(r.nodes?.length||0),0),unresolved_parents:unresolvedParents,structural_citation_collisions:collisions}};
  }
  function parseDocument(doc,url) {
    const rules=[...doc.querySelectorAll('article.roc__rule')].map(a=>parseRule(doc,a.hasAttribute('about')?articleSourceUrl(a,url):url,a));
    const indexes=[];
    if(doc.querySelector('article.roc__document .roc__rule-index__content')) indexes.push(parseTitleIndex(doc,url));
    return {rules,indexes,hierarchy:buildHierarchy(rules,indexes)};
  }
  global.CRCParser=Object.freeze({clean,normalizeUrl,parseRule,parseTitleIndex,extractAuthorities,captureDocumentTopToFooter,articleSourceUrl,buildHierarchy,parseDocument});
})(typeof window!=='undefined'?window:globalThis);
