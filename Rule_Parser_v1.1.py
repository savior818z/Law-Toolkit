#!/usr/bin/env python3
"""Standalone CRC unified parser v3.2. Text and HTML-parser JSON inputs; no external dependencies."""
import argparse
from datetime import datetime, timezone
#!/usr/bin/env python3
"""CRC text hierarchy parser and independent structural auditor.
Standard library only. Usage: python crc_full_parser_fixed.py input.txt [output_prefix]
Supports Titles 1-10, TOC/body detection, detached markers, rule histories,
comments, JSON/JSONL/TXT output, and an explicit uncertainty report.
Does NOT correct corrupted PDF text or infer missing legal provisions.
"""
import re
import json
import sys
from pathlib import Path

PAGE = re.compile(r'^\s*=====\s*PAGE\s+(\d+)\s*=====\s*$', re.I)
TITLE = re.compile(r'^\s*TITLE\s+(\d+)\.?\s+(.+?)\s*$', re.I)
DIV = re.compile(r'^\s*Division\s+(\d+)\.?\s+(.+?)\s*$', re.I)
CHAP = re.compile(r'^\s*Chapter\s+(\d+)\.?\s+(.+?)\s*$', re.I)
RULE = re.compile(r'^\s*Rule\s+(\d+\.\d+(?:\.\d+)?)\.?\s+(.+?)\s*$', re.I)
RULE_IN_LINE = re.compile(r'\bRule\s+(\d+\.\d+(?:\.\d+)?)\.?\s+', re.I)
MARK = re.compile(r'^(\s*)\(([a-z]|[A-Z]|\d+|[ivxlcdm]+)\)\s*(.*)$')
RULE_HISTORY = re.compile(r'^\s*Rule\s+\d+\.\d+(?:\.\d+)?\s+(?:adopted|amended|repealed|renumbered|operative|effective)\b', re.I)
SUBD_HISTORY = re.compile(r'^\s*\(?Subd\s+\([a-z]\)\)?\s+(?:adopted|amended|relettered|renumbered|repealed)\b', re.I)
COMMENT = re.compile(r'^\s*Advisory\s+Committee\s+Comment', re.I)
CROSSREF = re.compile(r'\b(?:rules?|sections?)\s+\d+\.\d+(?:\([^)]*\))*', re.I)


def clean(s):
    return re.sub(r'\s+', ' ', s).strip()


def level(token):
    if re.fullmatch(r'[ivxlcdm]{2,}', token): return 4
    if re.fullmatch(r'[a-z]', token): return 1
    if token.isdigit(): return 2
    if re.fullmatch(r'[A-Z]', token): return 3
    return None


def split_rule_headings(s):
    matches = list(RULE_IN_LINE.finditer(s))
    return [(m.group(1), clean(s[m.end():matches[i+1].start() if i+1 < len(matches) else len(s)]))
            for i, m in enumerate(matches)]


def parse(source):
    lines = source.splitlines()
    nodes, by_id, warnings = [], {}, []
    title_id = None
    chapter_id = division_id = None
    current = active = None
    stack = {}
    page = None
    body = False
    mode = 'toc'
    pending = None
    rule_occurrences = {}
    body_started = set()
    seen_marker = 0
    detached = 0
    def add(cid, parent, kind, heading, n):
        if cid in by_id:
            warnings.append({'line': n, 'type': 'duplicate_citation', 'citation': cid})
            return by_id[cid]
        obj = {'citation': cid, 'parent': parent, 'kind': kind, 'heading': clean(heading),
               'text': '', 'raw_lines': [], 'history': [], 'comment': [], 'cross_references': [],
               'source_line': n, 'end_line': n, 'page': page}
        nodes.append(obj); by_id[cid] = obj
        return obj
    def append(obj, raw, n, field='text'):
        if not obj: return
        obj['end_line'] = n
        if field == 'text':
            obj['raw_lines'].append(raw)
            obj['text'] += ('\n' if obj['text'] else '') + raw.strip()
        else: obj[field].append(raw.strip())
    def new_marker(token, heading, n):
        nonlocal stack, active, seen_marker
        k = level(token)
        if token.lower() in ("i", "v", "x") and token.islower() and 3 in stack:
            k = 4
        if k is None: return
        candidates = [x for x in stack if x < k]
        if k == 1: parent = current['citation']
        else: parent = stack[max(candidates)] if candidates else current['citation']
        if k >= 3 and not candidates:
            warnings.append({'line': n, 'type': 'orphan_level', 'token': token, 'rule': current['citation']})
        cid = parent + '(' + token + ')'
        active = add(cid, parent, ['','subdivision','paragraph','subparagraph','clause'][k], heading, n)
        stack = {x: y for x,y in stack.items() if x < k}
        stack[k] = cid
        seen_marker += 1

    for n, raw in enumerate(lines, 1):
        s = clean(raw)
        p = PAGE.match(raw)
        if p: page = int(p.group(1)); continue
        if not s or re.fullmatch(r'\d{1,4}', s): continue
        t = TITLE.match(raw)
        if t:
            title_id = 'CRC:TITLE' + t.group(1)
            add(title_id, None, 'title', t.group(2), n)
            continue
        d = DIV.match(raw)
        if d and not re.match(r'^(?:adopted|amended|repealed)\b', d.group(2), re.I):
            if not title_id:
                title_id = 'CRC:TITLE_UNKNOWN'
                add(title_id, None, 'title', 'Title not detected', n)
            division_id = title_id + ':DIVISION' + d.group(1)
            add(division_id, title_id, 'division', d.group(2), n)
            chapter_id = None; current = active = None; mode = 'toc'; body = False
            continue
        c = CHAP.match(raw)
        if c and not re.match(r'^(?:adopted|amended|repealed)\b', c.group(2), re.I):
            if not title_id:
                title_id = 'CRC:TITLE_UNKNOWN'
                add(title_id, None, 'title', 'Title not detected', n)
            chapter_id = (division_id or title_id) + ':CHAPTER' + c.group(1)
            add(chapter_id, division_id or title_id, 'chapter', c.group(2), n)
            current = active = None; mode = 'toc'; body = False
            continue
        if RULE_HISTORY.match(raw):
            if current:
                append(current, raw, n, 'history')
                mode = 'history'; active = None
            continue
        if SUBD_HISTORY.match(raw):
            if current: append(current, raw, n, 'history')
            continue
        if COMMENT.match(raw):
            mode = 'comment'; active = None; continue
        r = RULE.match(raw)
        if r:
            parts = split_rule_headings(s)
            if not parts: parts = [(r.group(1), r.group(2))]
            first = None
            for number, heading in parts:
                cid = 'CRC:' + number
                rule_occurrences[cid] = rule_occurrences.get(cid, 0) + 1
                if cid not in by_id:
                    if not title_id:
                        title_id = 'CRC:TITLE' + number.split('.')[0]
                        add(title_id, None, 'title', 'Rules of Court', n)
                    add(cid, chapter_id or division_id or title_id, 'rule', heading, n)
                if first is None: first = cid
            if first:
                current = by_id[first]
                if first in body_started:
                    warnings.append({'line': n, 'type': 'repeated_body_heading', 'citation': first})
                elif rule_occurrences[first] >= 2 or (not re.match(r'^\s{24,}', raw) and mode != 'toc'):
                    body_started.add(first)
                # Single heading followed by operative text: detect below via marker or prose.
                body = first in body_started
                mode = 'body' if body else 'toc'
                active = current if body else None
                stack = {}; pending = None
            continue
        if current is None: continue
        # If TOC only supplied one heading, a marker is strong evidence of operative text.
        mm = MARK.match(raw)
        if not body and mm:
            body = True; body_started.add(current['citation']); mode = 'body'; active = current
        if not body:
            # Unmarked operative prose following a TOC heading is ambiguous. Keep it but flag.
            if mode == 'toc' and not re.match(r'^\s*Rule\b', raw, re.I) and len(s) > 65:
                body = True; body_started.add(current['citation']); mode = 'body'; active = current
                warnings.append({'line': n, 'type': 'body_start_inferred', 'citation': current['citation']})
            else: continue
        if mode == 'comment': append(current, raw, n, 'comment'); continue
        if mode == 'history':
            # Preserve history continuation until a new rule heading.
            append(current, raw, n, 'history'); continue
        if mm:
            token, remainder = mm.group(2), clean(mm.group(3))
            if pending:
                warnings.append({'line': n, 'type': 'consecutive_detached_markers', 'previous': pending[0], 'current': token})
                # Keep both in a pending queue instead of fabricating attachment.
                pending[2].append((token,n))
                continue
            if not remainder:
                pending = (token,n,[(token,n)])
                detached += 1
                continue
            new_marker(token, remainder, n)
            continue
        if pending:
            token, first_line, queue = pending
            if len(queue) == 1:
                new_marker(token, s, first_line)
                pending = None
                continue
            warnings.append({'line': n, 'type': 'unresolved_grouped_markers', 'markers': queue,
                             'rule': current['citation'], 'following_text': s[:120]})
            pending = None
        append(active or current, raw, n)
    if pending:
        warnings.append({'type': 'unresolved_detached_marker', 'markers': pending[2]})
    for obj in nodes:
        if obj['text']:
            obj['cross_references'] = sorted(set(CROSSREF.findall(obj['text'])))
    rules = [x for x in nodes if x['kind'] == 'rule']
    for r in rules:
        if r['citation'] not in body_started:
            warnings.append({'type': 'toc_only_rule', 'citation': r['citation'], 'line': r['source_line']})
    return nodes, {'source_lines': len(lines), 'nodes': len(nodes), 'rules': len(rules),
                   'markers_parsed': seen_marker, 'detached_markers_seen': detached,
                   'rule_heading_occurrences': rule_occurrences, 'warnings': warnings}


def tree(nodes):
    children = {}
    for x in nodes: children.setdefault(x['parent'], []).append(x)
    out = []
    def visit(x, prefix='', last=True):
        out.append(prefix + (('└── ' if last else '├── ') if x['parent'] else '') + x['citation'] + ' — ' + x['heading'])
        group = children.get(x['citation'], [])
        lead = prefix + (('    ' if last else '│   ') if x['parent'] else '')
        for i, child in enumerate(group): visit(child, lead, i == len(group)-1)
    for x in children.get(None, []): visit(x)
    return '\n'.join(out) + '\n'



# Unified schema and CLI
parse_text = parse
STRUCTURAL={'subdivision','paragraph','numbered_item','subparagraph','item','clause'}
HISTORY={'rule_history','subdivision_history','chapter_history'}
def timestamp(): return datetime.now(timezone.utc).isoformat()
def depth(citation): return len(re.findall(r'\([^()]+\)', citation or ''))
def normalize_node(n, fmt, idx, rule_number):
    citation=n.get('citation') or f'CRC:{rule_number}'
    kind=n.get('type') or n.get('kind') or 'other'
    if kind=='clause': kind='item'
    raw=n.get('raw_text')
    if raw is None: raw='\n'.join(n.get('raw_lines') or []) if fmt=='text' else n.get('text','')
    original=n.get('text','')
    node={
        'id':n.get('id') or f'{citation}#source-{idx}', 'order':n.get('order',idx),
        'type':kind,'marker':n.get('marker') or (re.findall(r'\(([^()]*)\)',citation)[-1] if kind in STRUCTURAL and '(' in citation else None),
        'citation':citation,'parent_citation':n.get('parent_citation',n.get('parent')),
        'parent_id':None,'depth':depth(citation),'text':original,
        'normalized_text':re.sub(r'\s+',' ',original).strip(),
        'raw_text':raw,'raw_lines':n.get('raw_lines') if fmt=='text' else None,
        'source_line':n.get('source_line'), 'end_line':n.get('end_line'),'page':n.get('page'),
        'source_html':n.get('source_html') if fmt=='html' else None,
        'html_class':n.get('html_class') if fmt=='html' else None,
        'html_tag':n.get('tag_name') if fmt=='html' else None,
        'derived_from_mixed_heading':bool(n.get('derived_from_mixed_heading',False)),
        'derived_from_node_id':n.get('source_node_id') or n.get('derived_from_node_id'),
        'children':[]
    }
    return node

def normalize_html(records):
    if isinstance(records,dict): records=records.get('rules', [records] if 'rule_number' in records else [])
    output=[]
    for r in records:
        number=r['rule_number']
        nodes=[normalize_node(n,'html',i,number) for i,n in enumerate(r.get('nodes',[]),1)]
        output.append({'schema_version':'3.2','source_format':'html','rule_number':number,
          'title':r.get('title'),'heading':r.get('heading'),'citation':f'CRC:{number}',
          'status':r.get('status','unknown'),'source_url':r.get('source_url'),
          'title_index':r.get('title_index'),
          'source':{'article_html':r.get('cleaned_html'),'content_html':None,
                    'document_top_to_footer_html':r.get('source_section_html')},
          'nodes':nodes,'authority_references':r.get('authority_references',[]),
          'navigation':r.get('navigation',[]),'issues':list(r.get('issues',[]))})
    return output

def normalize_text(source):
    legacy, audit=parse_text(source)
    rules=[n for n in legacy if n['kind']=='rule']
    results=[]
    legacy_by_id={n['citation']:n for n in legacy}
    for r in rules:
        num=r['citation'].removeprefix('CRC:')
        descendants=[n for n in legacy if n is r or n['citation'].startswith(r['citation']+'(')]
        nodes=[]
        for i,n in enumerate(descendants):
            if n is r: continue
            nodes.append(normalize_node(n,'text',i,num))
        # Legacy stores histories/comments on the rule, not as independent nodes.
        # Promote each entry with a unique ID and retain source provenance limits.
        for kind, field in [('rule_history','history'),('advisory_text','comment')]:
            for value in r.get(field,[]):
                i=len(nodes)+1
                nodes.append(normalize_node({'id':f'CRC:{num}#legacy-{kind}-{i}',
                  'citation':f'CRC:{num}','parent':f'CRC:{num}', 'kind':kind,
                  'text':value,'raw_lines':[value]},'text',i,num))
        issues=[w for w in audit['warnings'] if w.get('citation')==r['citation'] or w.get('rule')==r['citation']]
        results.append({'schema_version':'3.2','source_format':'text','rule_number':num,
          'title':r['heading'],'heading':f'Rule {num}. {r["heading"]}',
          'citation':r['citation'],'status':'unknown','source_url':None,
          'title_index':{'title':None,'chapter':legacy_by_id.get(r.get('parent'),{}).get('heading') or 'Unindexed'},'source':{'article_html':None,'content_html':None,
            'document_top_to_footer_html':None,'source_line':r['source_line'],'page':r['page']},
          'nodes':nodes,'authority_references':[], 'navigation':[],'issues':issues})
    return results,audit

def build_hierarchy(rules):
    titles={}; reconciliation={'source_nodes':0,'placed_nodes':0,'unresolved_parents':[],
       'duplicate_citations':[],'duplicate_node_ids':[]}
    for rule in rules:
        num=rule['rule_number']; title_num=num.split('.')[0]
        title=titles.setdefault(title_num,{'type':'title','title_number':title_num,
          'name':(rule.get('title_index') or {}).get('title') or f'Title {title_num}', 'chapters':[]})
        chapter_name=(rule.get('title_index') or {}).get('chapter') or 'Unindexed'
        chapter=next((c for c in title['chapters'] if c['name']==chapter_name),None)
        if chapter is None:
            chapter={'type':'chapter','name':chapter_name,'histories':[],'rules':[]};title['chapters'].append(chapter)
        root={'type':'rule','rule_number':num,'citation':f'CRC:{num}',
              'title':rule['title'],'source_format':rule['source_format'],'id':f'CRC:{num}',
              'children':[],'rule_histories':[],'advisory_comments':[],'source_artifacts':[]}
        bycite={root['citation']:root}; ids=set(); pending=[]
        for node in rule['nodes']:
            reconciliation['source_nodes']+=1
            if node['id'] in ids: reconciliation['duplicate_node_ids'].append({'rule':num,'id':node['id']})
            ids.add(node['id']); item={**node,'children':[]}
            typ=node['type']
            if typ=='chapter_history': chapter['histories'].append(item)
            elif typ in {'rule_history','subdivision_history'}: root['rule_histories'].append(item)
            elif typ in {'advisory_heading','advisory_text'}: root['advisory_comments'].append(item)
            elif typ=='source_artifact': root['source_artifacts'].append(item)
            else: pending.append(item)
            if typ in STRUCTURAL:
                if item['citation'] in bycite: reconciliation['duplicate_citations'].append({'rule':num,'citation':item['citation']})
                else: bycite[item['citation']]=item
            reconciliation['placed_nodes']+=1
        # Two-pass parent resolution, so parent order does not affect placement.
        for item in pending:
            parent=bycite.get(item['parent_citation'])
            if parent is None:
                reconciliation['unresolved_parents'].append({'rule':num,'id':item['id'],'parent':item['parent_citation']})
                parent=root
            if parent is item:
                reconciliation['unresolved_parents'].append({'rule':num,'id':item['id'],'parent':'self'})
                parent=root
            item['parent_id']=parent.get('id')
            parent['children'].append(item)
        chapter['rules'].append(root)
    return {'schema_version':'3.2','type':'collection','title':'California Rules of Court',
       'titles':list(titles.values()),'reconciliation':reconciliation}



# Unified ingestion layer: TXT, source HTML, and structured JSON.
from html.parser import HTMLParser
from html import unescape
import hashlib

class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.parts=[]
    def handle_data(self,data): self.parts.append(data)
    def text(self): return ''.join(self.parts)

def html_text(markup):
    parser=PlainHTML(); parser.feed(markup); return parser.text()

ARTICLE_RE=re.compile(r'<article\b(?P<attrs>[^>]*)>(?P<body>.*?)</article\s*>',re.I|re.S)
P_RE=re.compile(r'<p\b(?P<attrs>[^>]*)>(?P<body>.*?)</p\s*>',re.I|re.S)
CHAPTER_RE=re.compile(r'<h[1-6]\b[^>]*class=["\'][^"\']*crc-chapter[^"\']*["\'][^>]*>(.*?)</h[1-6]>',re.I|re.S)
ATTR_RE=re.compile(r'([\w:-]+)\s*=\s*(["\'])(.*?)\2',re.S)
RULE_HEAD_RE=re.compile(r'\bRule\s+(\d+\.\d+(?:\.\d+)?)\.?\s*(.*)',re.I|re.S)
MARKER_RE=re.compile(r'^\s*\((\d+|[a-z]|[A-Z]|[ivxlcdm]+)\)\s*(.*)$',re.S)
HISTORY_RE=re.compile(r'^(?:\(?Subd\s*\([a-z]\)|Rule\s+\d+\.\d+).*\b(?:adopted|amended|repealed|renumbered|effective)\b',re.I|re.S)

def attrs_of(s): return {k:unescape(v) for k,_,v in ATTR_RE.findall(s)}

def extract_html(source):
    rules=[]; audit={'source_format':'html','issues':[],'articles_seen':0}
    chapters=[(m.start(),clean(html_text(m.group(1)))) for m in CHAPTER_RE.finditer(source)]
    for article in ARTICLE_RE.finditer(source):
        audit['articles_seen']+=1
        at=attrs_of(article.group('attrs')); markup=article.group(0); body=article.group('body')
        head=re.search(r'<h1\b[^>]*>(.*?)</h1>',body,re.I|re.S)
        title=clean(html_text(head.group(1))) if head else ''
        match=RULE_HEAD_RE.search(title)
        if not match:
            audit['issues'].append({'type':'missing_rule_heading','article_id':at.get('id')}); continue
        number=match.group(1); heading=match.group(2)
        chapter=next((name for pos,name in reversed(chapters) if pos<article.start()),'Unindexed')
        root=f'CRC:{number}'; stack={}; nodes=[]; advisory_id=None
        for p in P_RE.finditer(body):
            a=attrs_of(p.group('attrs')); classes=a.get('class','').split(); cls=classes[0] if classes else ''
            raw=p.group(0); text_value=html_text(p.group('body')).strip()
            normalized=clean(text_value); marker=MARKER_RE.match(normalized)
            kind='other'; parent=root; citation=root; label=None
            if cls=='subdivheading': kind='subdivision'
            elif cls in ('paragraphlist','numberedlist'): kind='paragraph'
            elif cls=='subparagraphlist': kind='subparagraph'
            elif cls in ('itemlist','clauselist'): kind='item'
            elif cls in ('subdivtext',): kind='subdivision_text'
            elif cls in ('paragraphnolist','paragraphtext'): kind='paragraph_text'
            elif cls=='subparagraphtext': kind='subparagraph_text'
            elif cls=='rulehist': kind='rule_history'
            elif cls=='subdhist': kind='subdivision_history'
            elif cls=='advcommheader': kind='advisory_heading'
            elif cls=='advcommtext': kind='advisory_text'
            elif cls=='normal': kind='rule_text'
            if kind=='other' and HISTORY_RE.match(normalized):
                kind='subdivision_history' if normalized.lower().startswith('(subd') else 'rule_history'
            if marker and kind in ('other','rule_text','subdivision_text','paragraph_text'):
                if marker.group(1).isdigit(): kind='paragraph'
                elif marker.group(1).isupper(): kind='subparagraph'
                elif 3 in stack and marker.group(1) in ('i','v','x'): kind='item'
                elif marker.group(1).islower(): kind='subdivision'
            if kind in STRUCTURAL:
                k={'subdivision':1,'paragraph':2,'subparagraph':3,'item':4}.get(kind,1)
                if not marker:
                    audit['issues'].append({'type':'missing_marker','rule':number,'class':cls,'text':normalized[:100]})
                    kind='other'
                else:
                    label=marker.group(1)
                    candidates=[v for depth_key,v in stack.items() if depth_key<k]
                    parent=stack[max((z for z in stack if z<k),default=0)] if candidates else root
                    citation=parent+'('+label+')'
                    stack={z:v for z,v in stack.items() if z<k};stack[k]=citation
            if kind in ('subdivision_text','subdivision_history'): parent=stack.get(1,root)
            elif kind=='paragraph_text': parent=stack.get(2,stack.get(1,root))
            elif kind=='subparagraph_text': parent=stack.get(3,stack.get(2,root))
            elif kind=='advisory_heading': parent=root
            elif kind=='advisory_text': parent=root
            if kind=='rule_text' and 1 in stack: parent=stack[1]
            if kind=='rule_history': parent=root
            pos=article.start('body')+p.start()
            line=source.count('\n',0,pos)+1
            node_id=f'{root}#node-{len(nodes)+1}'
            node={'id':node_id,'order':len(nodes)+1,'type':kind,'marker':label,
                  'citation':citation,'parent_citation':parent,'parent_id':None,
                  'depth':depth(citation),'text':text_value,'normalized_text':normalized,
                  'raw_text':text_value,'raw_lines':None,'source_line':line,
                  'end_line':line+raw.count('\n'),'page':None,'source_html':raw,
                  'html_class':a.get('class'),'html_classes':classes,'html_tag':'p',
                  'attributes':a,'derived_from_mixed_heading':False,
                  'derived_from_node_id':None,'children':[]}
            nodes.append(node)
        rules.append({'schema_version':'3.2','source_format':'html','rule_number':number,
            'title':heading,'heading':title,'citation':root,
            'status':'repealed' if '[repealed]' in title.lower() else 'unknown',
            'source_url':at.get('data-source-url'),
            'title_index':{'title':f'Title {number.split(".")[0]}','chapter':chapter},
            'source':{'article_html':markup,'content_html':body,'document_top_to_footer_html':None,
                      'source_line':source.count('\n',0,article.start())+1},
            'nodes':nodes,'authority_references':[],'navigation':[],'issues':[]})
    audit['rules']=len(rules)
    return rules,audit

def ingest_json(source):
    obj=json.loads(source)
    if isinstance(obj,dict) and 'rules' in obj: obj=obj['rules']
    if isinstance(obj,dict) and 'rule_number' in obj: obj=[obj]
    if not isinstance(obj,list): raise ValueError('JSON must contain a rule, a rules array, or {"rules": [...]}')
    if not obj: return [],{'source_format':'json','records':0}
    if not all(isinstance(r,dict) and r.get('rule_number') for r in obj):
        raise ValueError('Each JSON rule must have a rule_number. Flat node-only JSON is not supported without rule grouping.')
    if all(r.get('schema_version')=='3.2' and r.get('source_format') for r in obj):
        return obj,{'source_format':'json','records':len(obj),'mode':'unified'}
    return normalize_html(obj),{'source_format':'json','records':len(obj),'mode':'html-parser'}

def hierarchy_text(hierarchy):
    out=[]
    def walk(n,level):
        out.append('  '*level+(n.get('citation') or n.get('name') or n.get('type','')))
        for child in n.get('children',[]): walk(child,level+1)
    for title in hierarchy['titles']:
        out.append(title['name'])
        for ch in title['chapters']:
            out.append('  '+ch['name'])
            for rule in ch['rules']: walk(rule,2)
    return '\n'.join(out)+'\n'

def run_ingestion(inputs,output_dir):
    output_dir=Path(output_dir);output_dir.mkdir(parents=True,exist_ok=True)
    rules=[];sources=[];issues=[]
    for name in inputs:
        path=Path(name);content=path.read_text(encoding='utf-8-sig')
        ext=path.suffix.lower()
        try:
            if ext in ('.html','.htm'): part,audit=extract_html(content)
            elif ext in ('.txt','.text','.md'): part,audit=normalize_text(content)
            elif ext in ('.json','.jsonl'):
                if ext=='.jsonl': content=json.dumps([json.loads(line) for line in content.splitlines() if line.strip()])
                part,audit=ingest_json(content)
            else: raise ValueError('Unsupported extension: '+ext)
        except Exception as exc:
            issues.append({'file':str(path),'type':'ingestion_error','message':str(exc)});continue
        for r in part:
            r['input_file']=str(path)
        rules.extend(part)
        sources.append({'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                        'rules':len(part),'audit':audit})
    hierarchy=build_hierarchy(rules)
    # Additional integrity checks for source element coverage and citation collisions.
    for rule in rules:
        seen={}
        for n in rule['nodes']:
            if n['type'] in STRUCTURAL:
                if n['citation'] in seen:
                    issues.append({'type':'duplicate_structural_citation','rule':rule['rule_number'],
                                   'citation':n['citation'],'node_ids':[seen[n['citation']],n['id']]})
                seen[n['citation']]=n['id']
    result={'schema_version':'3.2','generated_at':timestamp(),'sources':sources,
            'rules':rules,'hierarchy':hierarchy}
    (output_dir/'crc_unified.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    with (output_dir/'crc_nodes.jsonl').open('w',encoding='utf-8') as f:
        for r in rules:
            for n in r['nodes']:
                f.write(json.dumps({'rule_number':r['rule_number'],'input_file':r['input_file'],**n},ensure_ascii=False)+'\n')
    (output_dir/'crc_hierarchy.txt').write_text(hierarchy_text(hierarchy),encoding='utf-8')
    report={'source_files':len(sources),'rules':len(rules),'nodes':sum(len(r['nodes']) for r in rules),
            'reconciliation':hierarchy['reconciliation'],'issues':issues,'sources':sources}
    (output_dir/'crc_audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report

def main():
    parser=argparse.ArgumentParser(description='Ingest CRC TXT, JSON/JSONL, and HTML into unified hierarchy and audit')
    parser.add_argument('inputs',nargs='+',help='One or more input files')
    parser.add_argument('-o','--output-dir',default='crc_output',help='Directory for four output files')
    args=parser.parse_args()
    report=run_ingestion(args.inputs,args.output_dir)
    print(f"Sources={report['source_files']} Rules={report['rules']} Nodes={report['nodes']} "+
          f"Unresolved={len(report['reconciliation']['unresolved_parents'])} Issues={len(report['issues'])}")
    print('Output directory:',args.output_dir)

if __name__=='__main__': main()



#!/usr/bin/env python3
"""Extract California Rules of Court rule/subdivision histories using re.
PDF extraction: PyMuPDF (fitz). TXT accepts ===== PAGE N ===== markers.
Outputs JSONL records and a JSON audit. No OCR; run OCR first for image-only PDFs.
"""
import argparse, json, re
from pathlib import Path

RULE_HEAD = re.compile(r'^\s*Rule\s+(\d+\.\d+(?:\.\d+)?)\.?\s+(.+?)\s*$', re.I)
RULE_HIST = re.compile(r'^\s*Rule\s+(?P<rule>\d+\.\d+(?:\.\d+)?)\s+(?P<action>(?:previously\s+)?(?:amended|adopted|repealed|renumbered|relettered|operative)\b.*)$', re.I)
SUBD_HIST = re.compile(r'^\s*\(?\s*Subd(?:ivision)?\.?\s*\((?P<marker>[a-z])\)\s*\)?\s+(?P<action>(?:previously\s+)?(?:amended|adopted|repealed|renumbered|relettered)\b.*)$', re.I)
CHAPTER = re.compile(r'^\s*Chapter\s+\d+\b',re.I)
PAGE_MARK = re.compile(r'^\s*=====\s*PAGE\s+(\d+)\s*=====\s*$',re.I)
ACTIONS = re.compile(r'\b(?:adopted|amended|repealed|renumbered|relettered|operative)\b',re.I)

def pages(path):
    if path.suffix.lower()=='.pdf':
        import fitz
        with fitz.open(path) as doc:
            for i,p in enumerate(doc): yield i+1,p.get_text(sort=True)
    else:
        text=path.read_text(encoding='utf-8-sig')
        pg=1; buff=[]
        for line in text.splitlines():
            m=PAGE_MARK.match(line)
            if m:
                if buff: yield pg,'\n'.join(buff)
                pg=int(m.group(1));buff=[]
            else: buff.append(line)
        if buff:yield pg,'\n'.join(buff)

def extract(path):
    rows=[]; audit={'input':str(path),'pages':0,'rule_histories':0,'subdivision_histories':0,'unresolved_rule_context':0,'history_without_action':0}
    current_rule=None; pending=None
    def finish():
        nonlocal pending
        if pending:
            pending['text']=' '.join(x.strip() for x in pending.pop('_lines'))
            pending['actions']=ACTIONS.findall(pending['text'])
            if not pending['actions']:audit['history_without_action']+=1
            if not pending['rule_number']:audit['unresolved_rule_context']+=1
            rows.append(pending);pending=None
    for page,text in pages(path):
        audit['pages']+=1
        for line_no,raw in enumerate(text.splitlines(),1):
            s=raw.strip()
            if not s or re.fullmatch(r'\d{1,3}',s):continue
            rh=RULE_HIST.match(s)
            sh=SUBD_HIST.match(s)
            heading=RULE_HEAD.match(s)
            if rh or sh:
                finish()
                kind='rule_history' if rh else 'subdivision_history'
                rule_number=rh.group('rule') if rh else current_rule
                if rh:current_rule=rule_number
                marker=sh.group('marker') if sh else None
                citation=f'CRC:{rule_number}' if rule_number else None
                parent=(citation+'('+marker+')') if marker and citation else citation
                pending={'type':kind,'rule_number':rule_number,'marker':marker,'citation':citation,'parent_citation':parent,'page_start':page,'page_end':page,'line_start':line_no,'line_end':line_no,'_lines':[s]}
                continue
            if heading:
                finish()
                # Heading appears in TOC as well; context is still useful for histories.
                current_rule=heading.group(1)
                continue
            if CHAPTER.match(s):
                finish();current_rule=None;continue
            if pending:
                # Histories can wrap over multiple lines and across PDF page boundaries.
                # Stop on a new structural marker or advisory comment.
                if re.match(r'^\s*(?:\([a-zA-Z0-9]+\)|Advisory Committee Comment|TITLE\s+\d+|Division\s+\d+)',s,re.I):
                    finish()
                else:
                    pending['_lines'].append(s);pending['page_end']=page;pending['line_end']=line_no
    finish()
    audit['rule_histories']=sum(r['type']=='rule_history' for r in rows)
    audit['subdivision_histories']=sum(r['type']=='subdivision_history' for r in rows)
    return rows,audit

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('input',type=Path)
    ap.add_argument('-o','--output-dir',type=Path,default=Path('crc_history_output'))
    a=ap.parse_args();a.output_dir.mkdir(parents=True,exist_ok=True)
    rows,audit=extract(a.input)
    with (a.output_dir/'crc_histories.jsonl').open('w',encoding='utf-8') as f:
        for row in rows:f.write(json.dumps(row,ensure_ascii=False)+'\n')
    (a.output_dir/'crc_history_audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
    print(json.dumps(audit,indent=2))
if __name__=='__main__':main()
