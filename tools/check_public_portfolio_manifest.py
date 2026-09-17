"""Validate the owner's intake manifest; this does not publish portfolio cards."""
import copy
import json
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'docs/PUBLIC_PORTFOLIO_MANIFEST_V1.json'
CATEGORIES = {'signs', 'windows', 'print', 'structures', 'banners'}


def local_path(value, prefix=''):
    assert isinstance(value, str) and value, 'Local path required'
    path = PurePosixPath(value)
    assert not path.is_absolute() and '..' not in path.parts and '\\' not in value and ':' not in value, 'Unsafe local path'
    assert not prefix or value.startswith(prefix), f'Expected path under {prefix}'
    return ROOT / path


def validate(data):
    assert data['version'] == 1 and data['source'], 'Missing manifest provenance'
    ids, images = set(), set()
    assert data['projects'], 'Expected owner-supplied projects'
    for project in data['projects']:
        slug = project['id']
        assert slug and slug not in ids and all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in slug), 'Invalid or duplicate project ID'
        ids.add(slug)
        assert project['owner_label'] and project['categories'] and set(project['categories']) <= CATEGORIES, 'Missing identity/category'
        assert project['service_pages'], 'Missing related service pages'
        for page in project['service_pages']:
            assert page.endswith('.html') and local_path(page).is_file(), 'Missing service page'
        assert type(project['publish']) is bool, 'Publish must be an explicit boolean'
        assert project['status'] in {'awaiting_originals', 'ready'}, 'Unknown readiness'
        assert project['publish'] == (project['status'] == 'ready'), 'Publication/readiness mismatch'
        assert project['photos'], 'No real photo slots'
        slots = set()
        for photo in project['photos']:
            assert photo['slot'] and photo['slot'] not in slots, 'Duplicate photo slot'
            slots.add(photo['slot'])
            filename = photo['expected_web_path']
            image = local_path(filename, f'assets/portfolio/{slug}/')
            assert filename not in images and image.suffix in {'.webp', '.avif', '.jpg', '.png'}, 'Duplicate/unsupported photo'
            images.add(filename)
            if project['publish']:
                assert image.is_file() and image.stat().st_size > 0, 'Ready project missing real web photo'
                assert all(type(photo[k]) is int and photo[k] > 0 for k in ('width', 'height')), 'Missing image dimensions'
                assert isinstance(photo['alt'], str) and photo['alt'].strip(), 'Missing inspected alt text'
                source = photo['source_file']
                assert isinstance(source, str) and source and '/' not in source and '\\' not in source and ':' not in source, 'Missing original filename'


if __name__ == '__main__':
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    validate(data)
    # Fail closed: toggling a draft must never make missing photos publishable.
    bad = copy.deepcopy(data)
    draft = next((p for p in bad['projects'] if not p['publish']), None)
    if draft:
        draft.update(publish=True, status='ready')
        draft['photos'][0]['expected_web_path'] = f"assets/portfolio/{draft['id']}/missing-regression-photo.webp"
        try:
            validate(bad)
        except AssertionError:
            pass
        else:
            raise AssertionError('Missing-photo publication gate failed')
    for unsafe in ('https://example.com/photo.webp', '../photo.webp', '/photo.webp'):
        try:
            local_path(unsafe)
        except AssertionError:
            pass
        else:
            raise AssertionError('Unsafe source path accepted')
    published = sum(p['publish'] for p in data['projects'])
    print(f"Portfolio manifest: PASS; {len(data['projects'])} intake records, {published} ready for publication")
