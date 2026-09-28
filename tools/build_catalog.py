"""Validate archive entries and build GitHub-readable indexes; no dependencies."""
import argparse
from collections import defaultdict
from datetime import date
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote, urlparse

ROOT = Path(__file__).resolve().parents[1]
TYPES = {
    'dashboard': 'Dashboard', 'sidebar-navigation': 'Sidebar / Navigation',
    'settings': 'Settings', 'modal-dialog': 'Modal / Dialog',
    'data-visualization': 'Data Visualization', 'form-input': 'Form / Input',
    'table': 'Table', 'full-layout': 'Full Layout', 'other': '기타',
}
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def local_path(folder, value):
    require(isinstance(value, str) and value and '\\' not in value, 'invalid local path')
    path = (folder / value).resolve()
    require(path.is_relative_to(folder.resolve()) and path.exists(), f'missing/unsafe path: {value}')
    return path


def url(value):
    return isinstance(value, str) and urlparse(value).scheme in ('https', 'http') and bool(urlparse(value).netloc)


def load_entries(root):
    entries = []
    ids = set()
    for area, kind in [('my-ui', 'my'), ('reference-ui', 'reference')]:
        for file in sorted((root / area).rglob('metadata.json')):
            # source/demo may contain unrelated metadata.json; only archive-depth files count.
            if len(file.relative_to(root / area).parts) != 3:
                continue
            try:
                item = json.loads(file.read_text(encoding='utf-8'))
                folder = file.parent
                for key in ('schema_version', 'id', 'title', 'kind', 'primary_type', 'types', 'tags', 'frameworks', 'status', 'created', 'updated', 'revision', 'preview_image', 'preview_url', 'source', 'rights'):
                    require(key in item, f'missing {key}')
                require(item['schema_version'] == 1 and item['kind'] == kind, 'schema/kind mismatch')
                require(item['id'] not in ids, 'duplicate id')
                for key in ('id', 'title', 'revision'):
                    require(isinstance(item[key], str) and item[key].strip(), f'invalid {key}')
                require(item['primary_type'] in TYPES, 'invalid primary_type')
                for key in ('types', 'tags', 'frameworks'):
                    require(isinstance(item[key], list) and all(isinstance(v, str) and v for v in item[key]), f'invalid {key}')
                    require(len(item[key]) == len(set(item[key])), f'duplicate {key}')
                require(item['primary_type'] in item['types'] and all(v in TYPES for v in item['types']), 'invalid types')
                require(all(SLUG.fullmatch(v) for v in item['tags']), 'tags must be kebab-case')
                require(SLUG.fullmatch(folder.name), 'folder must be kebab-case') if kind == 'my' else None
                require(date.fromisoformat(item['created']) <= date.fromisoformat(item['updated']), 'updated precedes created')
                require((folder / 'README.md').is_file(), 'missing README.md')
                require((folder / 'licenses/README.md').is_file(), 'missing rights record')
                if kind == 'my':
                    require(item.get('program') == folder.parent.name and SLUG.fullmatch(item['program']), 'program mismatch')
                    require(item['id'] == f"my--{item['program']}--{folder.name}", 'id/path mismatch')
                    require((folder.parent / 'README.md').is_file(), 'missing program README')
                    require(bool(item.get('author')), 'missing author')
                    require(item['status'] in ('draft', 'ready', 'archived'), 'invalid status')
                else:
                    require(folder.parent.name == item['primary_type'], 'reference category mismatch')
                    require(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*', folder.name), 'invalid reference folder')
                    require(item['id'] == 'ref--' + folder.name, 'id/path mismatch')
                    require(item['status'] in ('unreviewed', 'reviewed', 'archived'), 'invalid status')
                    origin = item['origin']
                    require(url(origin['url']) and bool(origin['creator']), 'missing original URL/creator')
                    date.fromisoformat(origin['checked'])
                    for key in ('creator_url', 'repository'):
                        require(origin[key] is None or url(origin[key]), f'invalid origin {key}')
                if item['preview_image']:
                    require(local_path(folder, item['preview_image']).is_file(), 'preview image must be file')
                else:
                    require('screenshot-pending' in item['tags'], 'missing preview: add screenshot-pending tag')
                require(item['preview_url'] is None or url(item['preview_url']), 'invalid preview_url')
                source = item['source']
                require(source['mode'] in ('standalone', 'excerpt', 'link-only'), 'invalid source.mode')
                require(source['url'] is None or url(source['url']), 'invalid source.url')
                if source['mode'] != 'link-only':
                    local_path(folder, source['path'])
                rights = item['rights']
                require(rights['status'] in ('unverified', 'verified', 'permission-granted', 'restricted'), 'invalid rights.status')
                require(bool(rights['license']) and bool(rights['scope']), 'missing license/scope')
                if rights['status'] in ('verified', 'permission-granted'):
                    require(bool(rights['evidence']), 'missing rights evidence')
                    if not url(rights['evidence']):
                        local_path(folder, rights['evidence'])
                if kind == 'reference' and rights['status'] == 'unverified':
                    require(source['mode'] == 'link-only' and item['preview_image'] is None, 'unverified reference must be link-only')
                    for area_name in ('source', 'screenshots', 'preview'):
                        require(not any(p.is_file() and p.name != '.gitkeep' for p in (folder / area_name).rglob('*')), 'unverified reference contains external assets')
                ids.add(item['id'])
                entries.append({**item, '_path': folder.relative_to(root).as_posix()})
            except (ValueError, KeyError, TypeError) as error:
                raise ValueError(f'{file.relative_to(root)}: {error}') from error
    return entries


def cell(value):
    return str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('|', '&#124;').replace('[', '&#91;').replace(']', '&#93;').replace('\n', ' ')


def table(items):
    if not items:
        return '아직 등록된 UI가 없습니다.\n'
    lines = ['| Preview | UI · ID | 유형 | 태그 | Framework / library | 상태 |', '| --- | --- | --- | --- | --- | --- |']
    for item in sorted(items, key=lambda x: x['id']):
        base = '../' + quote(item['_path'])
        preview = f"![{cell(item['title'])}]({base}/{quote(item['preview_image'])})" if item['preview_image'] else '미등록'
        lines.append(f"| {preview} | [{cell(item['title'])}]({base}/README.md)<br>{cell(item['id'])} | {cell(', '.join(item['types']))} | {cell(', '.join(item['tags']))} | {cell(', '.join(item['frameworks']))} | {cell(item['status'])} |")
    return '\n'.join(lines) + '\n'


def render(entries):
    header = '<!-- Generated by tools/build_catalog.py; edit entry metadata instead. -->\n'
    mine = [e for e in entries if e['kind'] == 'my']
    refs = [e for e in entries if e['kind'] == 'reference']
    programs = defaultdict(list)
    for entry in mine:
        programs[entry['program']].append(entry)
    my_text = '# My UI — 프로그램별\n\n' + header + '\n'
    for program, items in sorted(programs.items()):
        my_text += f'## [{program}](../my-ui/{program}/README.md)\n\n' + table(items) + '\n'
    if not mine:
        my_text += table([])
    result = {'my-ui.md': my_text, 'reference-ui.md': '# Reference UI\n\n' + header + '\n' + table(refs)}
    for key, groups in [('type', TYPES), ('tag', sorted({t for e in entries for t in e['tags']}))]:
        text = f'# UI — {"유형별" if key == "type" else "태그별"}\n\n' + header + '\n'
        for group in groups:
            text += f'## {TYPES[group] if key == "type" else group}\n\n'
            for kind, label in [('my', 'My UI'), ('reference', 'Reference UI')]:
                text += f'### {label}\n\n' + table([e for e in entries if e['kind'] == kind and group in e['types' if key == 'type' else 'tags']]) + '\n'
        result[f'by-{key}.md'] = text if groups else text + table([])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='validate without modifying files')
    args = parser.parse_args()
    entries = load_entries(ROOT)
    for name, content in render(entries).items():
        path = ROOT / 'catalog' / name
        if args.check:
            require(path.exists() and path.read_text(encoding='utf-8') == content, f'outdated catalog: {name}; run without --check')
        else:
            path.parent.mkdir(exist_ok=True)
            path.write_text(content, encoding='utf-8', newline='\n')
    print(f'{len(entries)} entries validated; catalog {"checked" if args.check else "generated"}.')


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
